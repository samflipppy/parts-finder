import { z } from "genkit";
import { SpanStatusCode } from "@opentelemetry/api";
import type { AgentResponse, ChatMessage, ChatAgentResponse } from "./types";
import { ai, tracer } from "./ai";
import { SYSTEM_PROMPT } from "./prompts";
import {
  listManualSections,
  searchManual,
  getManualSection,
  searchParts,
  getSuppliers,
  getRepairGuide,
  lookupAsset,
  getRepairHistory,
} from "./tools";
import {
  MetricsCollector,
  getActiveCollector,
  setActiveCollector,
  setActiveChunkEmitter,
  saveMetrics,
  type StreamChunk,
} from "./metrics";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ManualReferenceSchema = z.object({
  manualId: z.string(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  quotedText: z.string(),
  pageHint: z.string().nullable().optional(),
});

export const ChatAgentResponseSchema = z.object({
  type: z.enum(["diagnosis", "clarification", "guidance", "photo_analysis"]),
  message: z.string(),
  manualReferences: z.array(ManualReferenceSchema),
  diagnosis: z.string().nullable(),
  recommendedPart: z
    .object({
      name: z.string(),
      partNumber: z.string(),
      description: z.string(),
      avgPrice: z.number(),
      criticality: z.string(),
    })
    .nullable(),
  repairGuide: z
    .object({
      title: z.string(),
      estimatedTime: z.string(),
      difficulty: z.string(),
      safetyWarnings: z.array(z.string()),
      steps: z.array(z.string()),
      tools: z.array(z.string()),
    })
    .nullable(),
  supplierRanking: z.array(
    z.object({
      supplierName: z.string(),
      qualityScore: z.number(),
      deliveryDays: z.number(),
      reasoning: z.string(),
    })
  ),
  alternativeParts: z.array(
    z.object({
      name: z.string(),
      partNumber: z.string(),
      reason: z.string(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  reasoning: z.string().nullable(),
  warnings: z.array(z.string()),
  equipmentAsset: z
    .object({
      assetId: z.string(),
      assetTag: z.string(),
      department: z.string(),
      location: z.string(),
      hoursLogged: z.number(),
      warrantyExpiry: z.string(),
      status: z.string(),
    })
    .nullable(),
});

const StreamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_done"), toolName: z.string(), resultCount: z.number(), latencyMs: z.number() }),
  z.object({ type: z.literal("text_chunk"), text: z.string() }),
]);

// ---------------------------------------------------------------------------
// Zero-tool-call detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the model tried to answer without calling any tools.
 * Clarifications (asking the user for more info) are fine with 0 tools.
 * Anything else — diagnosis, guidance, photo_analysis — needs tool data.
 */
function shouldRetryWithoutTools(
  result: ChatAgentResponse,
  toolCount: number
): boolean {
  if (toolCount > 0) return false;
  if (result.type === "clarification") return false;
  return true;
}

// All tools available to the agent
const ALL_TOOLS = [
  listManualSections,
  searchManual,
  getManualSection,
  searchParts,
  getSuppliers,
  getRepairGuide,
  lookupAsset,
  getRepairHistory,
];

// Default empty business fields for error/fallback responses
const EMPTY_BUSINESS_FIELDS = {
  equipmentAsset: null,
};

// ---------------------------------------------------------------------------
// diagnosticPartnerChat — single-phase flow
//
// One generateStream call with tools + structured output.
// The model calls tools, then returns structured JSON.
// Tool progress streams via sendChunk (from MetricsCollector).
// ---------------------------------------------------------------------------

export const diagnosticPartnerChat = ai.defineFlow(
  {
    name: "diagnosticPartnerChat",
    inputSchema: z.object({
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      ),
    }),
    outputSchema: ChatAgentResponseSchema,
    streamSchema: StreamChunkSchema,
  },
  async (input, { sendChunk }): Promise<ChatAgentResponse> => {
    setActiveChunkEmitter(sendChunk as (chunk: StreamChunk) => void);
    console.log(`[agent] Processing ${input.messages.length} messages`);

    const history = input.messages.slice(0, -1);
    const currentMessage = input.messages[input.messages.length - 1];

    const genkitHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    const span = tracer.startSpan("agent.generate", {
      attributes: { "messages.count": input.messages.length },
    });

    const MAX_RETRIES = 3;
    let forceToolPrompt = false;

    try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // On retry after zero-tool-call, append an instruction forcing tool usage
        const effectivePrompt = forceToolPrompt
          ? `${currentMessage.content}\n\n[SYSTEM: You MUST call your tools (lookupAsset, searchManual, searchParts, etc.) to research this equipment BEFORE responding. Do NOT respond without calling tools first. Call at least searchManual and searchParts.]`
          : currentMessage.content;

        const { response: responsePromise, stream } = ai.generateStream({
          system: SYSTEM_PROMPT,
          messages: genkitHistory,
          prompt: effectivePrompt,
          tools: ALL_TOOLS,
          output: { schema: ChatAgentResponseSchema },
          maxTurns: 15,
        });

        // Stream text chunks as they arrive (tool-calling turns produce planning text)
        for await (const chunk of stream) {
          if (chunk.text) {
            sendChunk({ type: "text_chunk", text: chunk.text });
          }
        }

        const response = await responsePromise;
        const result = response.output;

        if (!result) {
          // Model didn't produce valid structured output — fall back to raw text
          const rawText = response.text;
          console.warn(`[agent] Structured output was null, falling back to raw text (${rawText.length} chars)`);
          span.setStatus({ code: SpanStatusCode.OK });
          setActiveChunkEmitter(null);
          return {
            type: "guidance",
            message: rawText || "I wasn't able to structure my response. Please try again.",
            manualReferences: [],
            diagnosis: null,
            recommendedPart: null,
            repairGuide: null,
            supplierRanking: [],
            alternativeParts: [],
            confidence: "medium",
            reasoning: "Structured output was null; returning raw text.",
            warnings: [],
            ...EMPTY_BUSINESS_FIELDS,
          };
        }

        // Guard: if the model tried to answer without calling any tools, retry
        const toolCount = getActiveCollector()?.getToolCallCount() ?? 0;
        if (!forceToolPrompt && attempt < MAX_RETRIES && shouldRetryWithoutTools(result, toolCount)) {
          console.warn(`[agent] Model returned type="${result.type}" with 0 tool calls (attempt ${attempt}/${MAX_RETRIES}). Retrying with forced tool prompt...`);
          forceToolPrompt = true;
          continue;
        }

        span.setAttributes({
          "response.type": result.type,
          "part.found": !!(result.recommendedPart),
          "confidence": result.confidence ?? "null",
        });
        span.setStatus({ code: SpanStatusCode.OK });
        console.log(
          `[agent] Complete — type: ${result.type}, part: ${result.recommendedPart?.partNumber ?? "none"}, tools: ${toolCount}`
        );

        setActiveChunkEmitter(null);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isSchemaNull = msg.includes("Schema validation failed") && msg.includes("null");
        const isToolNull = msg.includes("missing tool response data");
        const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("resource exhausted");

        // Retry on transient Gemini failures (null structured output, null tool responses)
        if ((isSchemaNull || isToolNull) && attempt < MAX_RETRIES) {
          console.warn(`[agent] Transient Gemini error on attempt ${attempt}/${MAX_RETRIES}, retrying...`);
          continue;
        }

        span.recordException(new Error(msg));
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        console.error("[agent] Failed:", msg);

        setActiveChunkEmitter(null);

        return {
          type: "clarification",
          message: isRateLimit
            ? "The AI service is temporarily rate-limited. Please wait a moment and try again."
            : "I wasn't able to process that. Could you rephrase your question? Include the equipment manufacturer and model if possible.",
          manualReferences: [],
          diagnosis: null,
          recommendedPart: null,
          repairGuide: null,
          supplierRanking: [],
          alternativeParts: [],
          confidence: null,
          reasoning: `Generation failed: ${msg}`,
          warnings: [],
          ...EMPTY_BUSINESS_FIELDS,
        };
      }
    }

    // Exhausted retries — should not normally reach here
    setActiveChunkEmitter(null);
    return {
      type: "clarification",
      message: "I wasn't able to process that. Could you rephrase your question?",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "Exhausted retries due to transient Gemini errors.",
      warnings: [],
      ...EMPTY_BUSINESS_FIELDS,
    };
    } finally {
      span.end();
    }
  }
);

// ---------------------------------------------------------------------------
// chatStreamWithMetrics — the only way to call the agent
// ---------------------------------------------------------------------------

export async function* chatStreamWithMetrics(messages: ChatMessage[]) {
  const collector = new MetricsCollector();
  setActiveCollector(collector);

  try {
    const { stream, output } = diagnosticPartnerChat.stream({ messages });

    for await (const chunk of stream) {
      yield chunk as StreamChunk;
    }

    const response = (await output) as ChatAgentResponse;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const pseudoResponse: AgentResponse = {
      diagnosis: response.diagnosis ?? response.message,
      recommendedPart: response.recommendedPart,
      repairGuide: response.repairGuide,
      supplierRanking: response.supplierRanking,
      alternativeParts: response.alternativeParts,
      confidence: response.confidence ?? "medium",
      reasoning: response.reasoning ?? "",
      warnings: response.warnings,
    };
    const metrics = collector.finalize(lastUserMsg, pseudoResponse);
    saveMetrics(metrics).catch((err) => console.error("[agent] Failed to save metrics:", err));

    yield { type: "complete" as const, response: { ...response, _metrics: metrics } };
  } finally {
    setActiveCollector(null);
  }
}
