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
  z.object({ type: z.literal("phase_structuring") }),
]);

// ---------------------------------------------------------------------------
// Zero-tool-call detection (for Phase 1 text output)
// ---------------------------------------------------------------------------

/**
 * Returns true if the model produced a text response without calling any
 * tools and the text doesn't look like a clarification question.
 */
function shouldRetryWithoutTools(
  researchText: string,
  toolCount: number
): boolean {
  if (toolCount > 0) return false;
  // Text ending with a question → model is asking for more info, that's fine
  if (/\?\s*$/.test(researchText.trim())) return false;
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
// Phase 2 structuring prompt
//
// After Phase 1 (research with tools), Phase 2 formats the results into
// the required JSON schema. The key instruction: use ONLY data from tool
// results, never invent values.
// ---------------------------------------------------------------------------

const STRUCTURING_PROMPT = `Now produce the structured JSON response based on your research above.

CRITICAL — use ONLY data that your tools returned:
- recommendedPart: copy the EXACT name, partNumber, avgPrice, and criticality from searchParts results. NEVER invent or guess part numbers.
- manualReferences: use the EXACT manualId, sectionId, sectionTitle, and quote text from searchManual or getManualSection results.
- equipmentAsset: use the EXACT values from lookupAsset results.
- repairGuide: use the EXACT steps, tools, and safety warnings from getRepairGuide results.
- supplierRanking: use the EXACT supplier names and scores from getSuppliers results.
- If a tool returned no data for a field, set it to null or []. NEVER fabricate values.`;

// ---------------------------------------------------------------------------
// diagnosticPartnerChat — two-phase flow
//
// Phase 1 (Research): generateStream with tools, NO structured output.
//   Removing the output schema prevents Gemini from taking the shortcut
//   of filling JSON from its training data instead of calling tools.
//   Tool progress streams to the UI via MetricsCollector.
//
// Phase 2 (Structure): generate with output schema, NO tools.
//   Takes the full conversation (including tool call results) and formats
//   it into the required JSON. The model can't hallucinate because the
//   real data is right there in context.
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
          ? `${currentMessage.content}\n\n[SYSTEM: You MUST call your tools (lookupAsset, searchManual, searchParts, etc.) to research this equipment BEFORE responding. Do NOT respond without calling tools first.]`
          : currentMessage.content;

        // ── Phase 1: Research — tools enabled, NO structured output ──
        // Without output: { schema }, the model cannot shortcut to JSON.
        // It must actually call tools to be useful.
        const { response: researchPromise, stream } = ai.generateStream({
          system: SYSTEM_PROMPT,
          messages: genkitHistory,
          prompt: effectivePrompt,
          tools: ALL_TOOLS,
          maxTurns: 15,
        });

        // Stream text chunks as they arrive (tool-calling turns produce planning text)
        for await (const chunk of stream) {
          if (chunk.text) {
            sendChunk({ type: "text_chunk", text: chunk.text });
          }
        }

        const researchResponse = await researchPromise;
        const researchText = researchResponse.text;

        // Guard: if model skipped tools and didn't ask a clarification, retry
        const toolCount = getActiveCollector()?.getToolCallCount() ?? 0;
        if (!forceToolPrompt && attempt < MAX_RETRIES && shouldRetryWithoutTools(researchText, toolCount)) {
          console.warn(`[agent] Phase 1 returned 0 tool calls with non-question text (attempt ${attempt}/${MAX_RETRIES}). Retrying...`);
          forceToolPrompt = true;
          continue;
        }

        // ── Phase 2: Structure — format tool results into JSON ──
        // Pass the full conversation (with tool call data) so the model
        // can copy exact values instead of hallucinating.
        sendChunk({ type: "phase_structuring" } as StreamChunk);

        const structuredResponse = await ai.generate({
          messages: researchResponse.messages,
          prompt: STRUCTURING_PROMPT,
          output: { schema: ChatAgentResponseSchema },
        });

        const result = structuredResponse.output;

        if (!result) {
          // Model didn't produce valid structured output — fall back to raw text
          console.warn(`[agent] Phase 2 structured output was null, falling back to research text (${researchText.length} chars)`);
          span.setStatus({ code: SpanStatusCode.OK });
          setActiveChunkEmitter(null);
          return {
            type: "guidance",
            message: researchText || "I wasn't able to structure my response. Please try again.",
            manualReferences: [],
            diagnosis: null,
            recommendedPart: null,
            repairGuide: null,
            supplierRanking: [],
            alternativeParts: [],
            confidence: "medium",
            reasoning: "Structured output was null; returning raw research text.",
            warnings: [],
            ...EMPTY_BUSINESS_FIELDS,
          };
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
