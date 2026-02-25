import { z } from "genkit";
import { SpanStatusCode } from "@opentelemetry/api";
import type { AgentResponse, ChatMessage, ChatAgentResponse } from "./types";
import { ai, tracer, generateWithRetry } from "./ai";
import { SYSTEM_PROMPT, STRUCTURE_PROMPT } from "./prompts";
import {
  listManualSections,
  searchManual,
  getManualSection,
  searchParts,
  getSuppliers,
  getRepairGuide,
  lookupAsset,
  checkInventory,
  getRepairHistory,
  createWorkOrder,
  createOrderRequest,
} from "./tools";
import {
  MetricsCollector,
  setActiveCollector,
  setActiveChunkEmitter,
  saveMetrics,
  type RequestMetrics,
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

const ChatAgentResponseSchema = z.object({
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
  // PartsSource business fields
  inventory: z.array(
    z.object({
      supplierName: z.string(),
      unitPrice: z.number(),
      quantityAvailable: z.number(),
      leadTimeDays: z.number(),
      inStock: z.boolean(),
      isOEM: z.boolean(),
      contractPricing: z.boolean(),
    })
  ),
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
  workOrderId: z.string().nullable(),
  orderRequestId: z.string().nullable(),
});

const StreamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_done"), toolName: z.string(), resultCount: z.number(), latencyMs: z.number() }),
  z.object({ type: z.literal("text_chunk"), text: z.string() }),
  z.object({ type: z.literal("phase_structuring") }),
]);

// All tools available to the agent
const ALL_TOOLS = [
  listManualSections,
  searchManual,
  getManualSection,
  searchParts,
  getSuppliers,
  getRepairGuide,
  lookupAsset,
  checkInventory,
  getRepairHistory,
  createWorkOrder,
  createOrderRequest,
];

// Default empty business fields for error/fallback responses
const EMPTY_BUSINESS_FIELDS = {
  inventory: [] as ChatAgentResponse["inventory"],
  equipmentAsset: null,
  workOrderId: null,
  orderRequestId: null,
};

// ---------------------------------------------------------------------------
// diagnosticPartnerChat flow
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
    console.log(`[diagnosticPartnerChat] Processing ${input.messages.length} messages`);

    const history = input.messages.slice(0, -1);
    const currentMessage = input.messages[input.messages.length - 1];

    const genkitHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    // -----------------------------------------------------------------------
    // Phase 1: Research with tool calling (streaming)
    // -----------------------------------------------------------------------

    const phase1Opts: Parameters<typeof ai.generate>[0] = {
      system: SYSTEM_PROMPT,
      messages: genkitHistory,
      prompt: currentMessage.content,
      tools: ALL_TOOLS,
      maxTurns: 15,
    };

    let phase1Text: string;
    const phase1Span = tracer.startSpan("phase1.research", {
      attributes: { "messages.count": input.messages.length },
    });
    try {
      const { response: phase1Promise, stream: phase1Stream } = ai.generateStream(phase1Opts);
      for await (const chunk of phase1Stream) {
        if (chunk.text) {
          sendChunk({ type: "text_chunk", text: chunk.text });
        }
      }
      const phase1Response = await phase1Promise;
      phase1Text = phase1Response.text;
      phase1Span.setAttribute("response.chars", phase1Text.length);
      phase1Span.setStatus({ code: SpanStatusCode.OK });
      console.log(`[diagnosticPartnerChat] Phase 1 complete — ${phase1Text.length} chars`);
    } catch (genErr: unknown) {
      const msg = genErr instanceof Error ? genErr.message : String(genErr);
      phase1Span.recordException(new Error(msg));
      phase1Span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      console.error("[diagnosticPartnerChat] Phase 1 failed:", msg);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("resource exhausted");
      setActiveChunkEmitter(null);
      phase1Span.end();
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
        reasoning: `Phase 1 generation failed: ${msg}`,
        warnings: [],
        ...EMPTY_BUSINESS_FIELDS,
      };
    } finally {
      phase1Span.end();
    }

    // -----------------------------------------------------------------------
    // Phase 2: Structure into JSON (fast extraction)
    // -----------------------------------------------------------------------

    sendChunk({ type: "phase_structuring" });

    let result: ChatAgentResponse | null = null;
    const phase2Span = tracer.startSpan("phase2.structure");
    try {
      const phase2Response = await generateWithRetry(() =>
        ai.generate({
          system: STRUCTURE_PROMPT,
          prompt: `Convert this repair research into the JSON schema:\n\n${phase1Text}`,
          output: { schema: ChatAgentResponseSchema },
        })
      );
      result = phase2Response.output ?? null;
      phase2Span.setAttributes({
        "response.type": result?.type ?? "null",
        "part.found": !!(result?.recommendedPart),
        "confidence": result?.confidence ?? "null",
        "manual.refs": result?.manualReferences?.length ?? 0,
        "inventory.count": result?.inventory?.length ?? 0,
        "has.asset": !!(result?.equipmentAsset),
      });
      phase2Span.setStatus({ code: SpanStatusCode.OK });
      console.log(
        `[diagnosticPartnerChat] Phase 2 complete — type: ${result?.type}, refs: ${result?.manualReferences?.length ?? 0}, part: ${result?.recommendedPart?.partNumber ?? "none"}, inventory: ${result?.inventory?.length ?? 0}`
      );
    } catch (structErr: unknown) {
      const msg = structErr instanceof Error ? structErr.message : String(structErr);
      phase2Span.recordException(new Error(msg));
      phase2Span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      console.error("[diagnosticPartnerChat] Phase 2 failed:", msg);
      setActiveChunkEmitter(null);
      phase2Span.end();
      return {
        type: "guidance",
        message: phase1Text,
        manualReferences: [],
        diagnosis: null,
        recommendedPart: null,
        repairGuide: null,
        supplierRanking: [],
        alternativeParts: [],
        confidence: "medium",
        reasoning: `Structured formatting failed: ${msg}`,
        warnings: [],
        ...EMPTY_BUSINESS_FIELDS,
      };
    } finally {
      phase2Span.end();
    }

    setActiveChunkEmitter(null);

    if (!result) {
      console.error("[diagnosticPartnerChat] Phase 2 returned null output, falling back to Phase 1 text");
      return {
        type: "guidance",
        message: phase1Text,
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

    return result;
  }
);

// ---------------------------------------------------------------------------
// chatWithMetrics
// ---------------------------------------------------------------------------

export async function chatWithMetrics(
  messages: ChatMessage[]
): Promise<{ response: ChatAgentResponse; metrics: RequestMetrics }> {
  const collector = new MetricsCollector();
  setActiveCollector(collector);

  try {
    const response = await diagnosticPartnerChat({ messages });
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
    saveMetrics(metrics).catch((err) => console.error("[chatWithMetrics] Failed to save metrics:", err));
    return { response, metrics };
  } finally {
    setActiveCollector(null);
  }
}

// ---------------------------------------------------------------------------
// chatStreamWithMetrics
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
    saveMetrics(metrics).catch((err) => console.error("[chatStreamWithMetrics] Failed to save metrics:", err));

    yield { type: "complete" as const, response: { ...response, _metrics: metrics } };
  } finally {
    setActiveCollector(null);
  }
}
