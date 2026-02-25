import { z } from "genkit";
import { SpanStatusCode } from "@opentelemetry/api";
import type { AgentResponse, ChatMessage, ChatAgentResponse } from "./types";
import { ai, tracer } from "./ai";
import {
  searchParts,
  searchManual,
  getSuppliers,
  getRepairGuide,
  lookupAsset,
  getRepairHistory,
} from "./tools";
import {
  MetricsCollector,
  setActiveCollector,
  getActiveCollector,
  saveMetrics,
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

// ---------------------------------------------------------------------------
// Parameter extraction — LLM parses natural language into structured params
// ---------------------------------------------------------------------------

const ExtractionSchema = z.object({
  manufacturer: z.string().nullable().describe("Equipment manufacturer, e.g. Drager, Philips, GE, Zoll. null if unknown"),
  equipmentName: z.string().nullable().describe("Equipment model name, e.g. Evita V500, IntelliVue MX800. null if unknown"),
  errorCode: z.string().nullable().describe("Error code mentioned, e.g. Error 57. null if none"),
  symptom: z.string().nullable().describe("Symptom description, e.g. fan not spinning. null if none"),
  assetTag: z.string().nullable().describe("Asset tag or unit number, e.g. ASSET-4302, unit 4302. null if none"),
  department: z.string().nullable().describe("Hospital department, e.g. ICU-3, OR-7. null if none"),
  needsClarification: z.boolean().describe("true if the technician hasn't given enough info to search (no manufacturer, no model, no error code, no symptom)"),
  clarificationMessage: z.string().nullable().describe("A helpful question to ask the technician, or null"),
  isNonMedical: z.boolean().describe("true if asking about non-hospital equipment (coffee maker, printer, etc.)"),
});

const EXTRACTION_PROMPT = `You extract structured equipment information from hospital biomedical technician messages.

Extract: manufacturer, equipment model name, error codes, symptoms, asset tags, and department.

Rules:
- If the technician gives a manufacturer + model OR a specific error code OR a specific symptom, set needsClarification to false — that's enough to search.
- Only set needsClarification to true if the message is too vague to search at all (e.g. "my equipment is broken" with no details).
- If asking about non-medical equipment (coffee makers, printers, microwaves, etc.), set isNonMedical to true.
- For asset tags: "unit 4302" → assetTag: "ASSET-4302". "serial SN-V500-2847" → leave as assetTag.`;

type ExtractionResult = z.infer<typeof ExtractionSchema>;

// ---------------------------------------------------------------------------
// Response formatting — LLM formats tool results into structured response
// ---------------------------------------------------------------------------

const FORMATTING_PROMPT = `You are formatting database lookup results into a structured response for a hospital biomedical equipment technician.

CRITICAL RULES:
- Use ONLY the exact data from the tool results below. NEVER invent part numbers, prices, manual references, or any other values.
- For recommendedPart: copy the EXACT name, partNumber, avgPrice, criticality from the parts results.
- For manualReferences: use EXACT manualId, sectionId, sectionTitle from the manual results.
- For equipmentAsset: use EXACT data from the asset results.
- For repairGuide: use EXACT steps, tools, warnings from the repair guide results.
- For supplierRanking: use EXACT supplier names and scores from the supplier results.
- If no data exists for a field, use null or []. NEVER fabricate values.
- If parts results are empty, set type to "guidance" and explain that no matching parts were found in the database.
- Write a natural 2-5 sentence message summarizing your findings for the technician.`;

// Default empty fields for clarification/error responses
const EMPTY_RESPONSE_FIELDS = {
  manualReferences: [] as never[],
  diagnosis: null,
  recommendedPart: null,
  repairGuide: null,
  supplierRanking: [] as never[],
  alternativeParts: [] as never[],
  confidence: null as null,
  reasoning: null as null,
  warnings: [] as string[],
  equipmentAsset: null,
};

// ---------------------------------------------------------------------------
// diagnosticPartnerChat — deterministic orchestrator
//
// Instead of giving the LLM tools and hoping it calls them, we:
//   1. Use the LLM to extract structured params from natural language
//   2. Call tools programmatically — always, deterministically
//   3. Use the LLM to format the tool results into a response
//
// No retries. No streaming. No tool-skipping. No hallucinated part numbers.
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
  },
  async (input): Promise<ChatAgentResponse> => {
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

    try {
      // ── Step 1: Extract structured params from the user message ──
      const extractionStart = Date.now();
      const extraction = await ai.generate({
        system: EXTRACTION_PROMPT,
        messages: genkitHistory,
        prompt: currentMessage.content,
        output: { schema: ExtractionSchema },
      });

      getActiveCollector()?.recordLLMCall(
        "extraction",
        extraction.model ?? "vertexai/gemini-2.0-flash",
        extraction.usage?.inputTokens ?? 0,
        extraction.usage?.outputTokens ?? 0,
        Date.now() - extractionStart
      );

      const params: ExtractionResult | null = extraction.output;

      if (!params) {
        return {
          type: "clarification",
          message: "I can help with that. What manufacturer and model of equipment are you working with?",
          ...EMPTY_RESPONSE_FIELDS,
          reasoning: "Extraction returned null.",
        };
      }

      // ── Step 2: Handle clarification / non-medical ──
      if (params.isNonMedical) {
        span.setAttributes({ "response.type": "guidance", "non_medical": true });
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          type: "guidance",
          message: "I specialize in hospital biomedical equipment — ventilators, patient monitors, defibrillators, infusion pumps, and similar devices. I don't have repair data for that type of equipment, but your facilities team should be able to help.",
          ...EMPTY_RESPONSE_FIELDS,
          reasoning: "Non-medical equipment request.",
        };
      }

      if (params.needsClarification) {
        span.setAttributes({ "response.type": "clarification" });
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          type: "clarification",
          message: params.clarificationMessage || "I can help with that! Could you tell me the manufacturer and model of the equipment? Any error codes on the display would also help narrow it down.",
          ...EMPTY_RESPONSE_FIELDS,
          reasoning: "Not enough information to search. Need manufacturer/model/symptoms.",
        };
      }

      // ── Step 3: Search parts — the primary lookup ──
      // Sanitize LLM extraction — models sometimes return "null" as a string
      const notNull = (v: string | null | undefined): v is string =>
        v != null && v !== "null" && v !== "none" && v !== "N/A";

      const partsInput: Record<string, string> = {};
      if (notNull(params.manufacturer)) partsInput.manufacturer = params.manufacturer;
      if (notNull(params.equipmentName)) partsInput.equipmentName = params.equipmentName;
      if (notNull(params.errorCode)) partsInput.errorCode = params.errorCode;
      if (notNull(params.symptom)) partsInput.symptom = params.symptom;

      const parts = await searchParts(partsInput);

      // ── Step 4: Search manual ──
      const manualInput: Record<string, string> = {};
      if (notNull(params.manufacturer)) manualInput.manufacturer = params.manufacturer;
      if (notNull(params.equipmentName)) manualInput.equipmentName = params.equipmentName;
      if (notNull(params.errorCode)) manualInput.keyword = params.errorCode;
      else if (notNull(params.symptom)) manualInput.keyword = params.symptom;

      const manualSections = await searchManual(manualInput);

      // ── Step 5: Suppliers + repair guide (if parts found) ──
      let suppliers: unknown[] = [];
      let repairGuide: unknown = null;

      if (Array.isArray(parts) && parts.length > 0) {
        const topPart = parts[0] as { id: string; supplierIds?: string[] };
        const [suppResult, guideResult] = await Promise.all([
          topPart.supplierIds && topPart.supplierIds.length > 0
            ? getSuppliers({ supplierIds: topPart.supplierIds })
            : Promise.resolve([]),
          getRepairGuide({ partId: topPart.id }),
        ]);
        suppliers = Array.isArray(suppResult) ? suppResult : [];
        repairGuide = guideResult;
      }

      // ── Step 6: Asset lookup (if tag provided) ──
      let assets: unknown[] = [];
      if (notNull(params.assetTag)) {
        assets = await lookupAsset({ assetTag: params.assetTag });
      } else if (notNull(params.department) && notNull(params.equipmentName)) {
        assets = await lookupAsset({ department: params.department, equipmentName: params.equipmentName });
      }

      // ── Step 7: Repair history (if asset found) ──
      let repairHistory: unknown[] = [];
      if (Array.isArray(assets) && assets.length > 0) {
        const topAsset = assets[0] as { assetId: string };
        try {
          repairHistory = await getRepairHistory({ assetId: topAsset.assetId });
        } catch (err) {
          console.warn("[agent] getRepairHistory failed, continuing without it:", err instanceof Error ? err.message : err);
        }
      }

      // ── Step 8: Format response — LLM only formats, never invents ──
      const toolData = {
        parts: Array.isArray(parts) ? parts : [],
        manualSections: Array.isArray(manualSections) ? manualSections : [],
        suppliers,
        repairGuide,
        assets: Array.isArray(assets) ? assets : [],
        repairHistory: Array.isArray(repairHistory) ? repairHistory : [],
      };

      const formattingStart = Date.now();
      const formatted = await ai.generate({
        system: FORMATTING_PROMPT,
        messages: genkitHistory,
        prompt: `Technician asked: "${currentMessage.content}"\n\nTool results:\n${JSON.stringify(toolData, null, 2)}`,
        output: { schema: ChatAgentResponseSchema },
      });

      getActiveCollector()?.recordLLMCall(
        "formatting",
        formatted.model ?? "vertexai/gemini-2.0-flash",
        formatted.usage?.inputTokens ?? 0,
        formatted.usage?.outputTokens ?? 0,
        Date.now() - formattingStart
      );

      const result = formatted.output;

      if (!result) {
        const partsArr = toolData.parts as Array<{ name: string; partNumber: string; description: string; avgPrice: number; criticality: string }>;
        const topPart = partsArr.length > 0 ? partsArr[0] : null;
        const fallbackMsg = topPart
          ? `I found a potential match: ${topPart.name} (${topPart.partNumber}) at $${topPart.avgPrice.toLocaleString()}. Please verify this matches your equipment.`
          : "I searched our database but couldn't find a matching part for that equipment. Could you double-check the manufacturer and model?";

        return {
          type: topPart ? "diagnosis" : "guidance",
          message: fallbackMsg,
          ...EMPTY_RESPONSE_FIELDS,
          recommendedPart: topPart
            ? { name: topPart.name, partNumber: topPart.partNumber, description: topPart.description, avgPrice: topPart.avgPrice, criticality: topPart.criticality }
            : null,
          confidence: topPart ? "medium" : null,
          reasoning: "Formatting LLM returned null; built fallback from raw tool data.",
        };
      }

      const toolCount = (Array.isArray(parts) ? 1 : 0) +
        (Array.isArray(manualSections) ? 1 : 0) +
        (suppliers.length > 0 ? 1 : 0) +
        (repairGuide ? 1 : 0) +
        (assets.length > 0 ? 1 : 0) +
        (repairHistory.length > 0 ? 1 : 0);

      span.setAttributes({
        "response.type": result.type,
        "part.found": !!(result.recommendedPart),
        "confidence": result.confidence ?? "null",
      });
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(
        `[agent] Complete — type: ${result.type}, part: ${result.recommendedPart?.partNumber ?? "none"}, tools: ${toolCount}`
      );

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("resource exhausted");

      span.recordException(new Error(msg));
      span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      console.error("[agent] Failed:", msg);

      return {
        type: "clarification",
        message: isRateLimit
          ? "The AI service is temporarily rate-limited. Please wait a moment and try again."
          : "I wasn't able to process that. Could you rephrase your question? Include the equipment manufacturer and model if possible.",
        ...EMPTY_RESPONSE_FIELDS,
        reasoning: `Generation failed: ${msg}`,
      };
    } finally {
      span.end();
    }
  }
);

// ---------------------------------------------------------------------------
// chatWithMetrics — runs the agent and returns the response with metrics
// ---------------------------------------------------------------------------

export async function chatWithMetrics(messages: ChatMessage[]): Promise<ChatAgentResponse & { _metrics?: unknown }> {
  const collector = new MetricsCollector();
  setActiveCollector(collector);

  try {
    const response = await diagnosticPartnerChat(({ messages } as unknown) as { messages: ChatMessage[] });

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

    return { ...response, _metrics: metrics };
  } finally {
    setActiveCollector(null);
  }
}
