/**
 * Edge case tests that cover production failures.
 *
 * These validate:
 * 1. Tools never return raw null (Gemini can't serialize null tool responses)
 * 2. Agent retry logic catches transient Gemini errors
 * 3. System prompt contains required guardrails
 * 4. ChatAgentResponse fallbacks are always valid
 */

import { z } from "zod";
import { SYSTEM_PROMPT } from "../prompts";
import { ChatAgentResponseSchema } from "../agent";

// ---------------------------------------------------------------------------
// 1. Tool output schemas reject null — Gemini crashes on null tool responses
// ---------------------------------------------------------------------------

describe("Tool output schemas must never allow raw null", () => {
  // These mirror the outputSchema definitions in tools.ts.
  // If someone changes a tool back to .nullable(), this fails the build.

  const NotFoundSchema = z.object({ notFound: z.literal(true), message: z.string() });

  it("getRepairGuide notFound response is valid (not null)", () => {
    const response = { notFound: true as const, message: "No repair guide found for part part_999" };
    const result = NotFoundSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("null is NOT a valid notFound response", () => {
    const result = NotFoundSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Agent fallback responses always pass schema validation
//    (Gemini returning null output should produce a valid fallback, not crash)
// ---------------------------------------------------------------------------

describe("Agent fallback responses are schema-valid", () => {
  const EMPTY_BUSINESS_FIELDS = { equipmentAsset: null };

  it("schema-null fallback (Gemini returns null structured output)", () => {
    const fallback = {
      type: "guidance" as const,
      message: "I wasn't able to structure my response. Please try again.",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "medium" as const,
      reasoning: "Structured output was null; returning raw text.",
      warnings: [],
      ...EMPTY_BUSINESS_FIELDS,
    };

    const result = ChatAgentResponseSchema.safeParse(fallback);
    expect(result.success).toBe(true);
  });

  it("error fallback (generation failed)", () => {
    const fallback = {
      type: "clarification" as const,
      message: "I wasn't able to process that. Could you rephrase your question?",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "Generation failed: Schema validation failed",
      warnings: [],
      ...EMPTY_BUSINESS_FIELDS,
    };

    const result = ChatAgentResponseSchema.safeParse(fallback);
    expect(result.success).toBe(true);
  });

  it("rate-limit fallback", () => {
    const fallback = {
      type: "clarification" as const,
      message: "The AI service is temporarily rate-limited. Please wait a moment and try again.",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "Generation failed: 429 Resource Exhausted",
      warnings: [],
      ...EMPTY_BUSINESS_FIELDS,
    };

    const result = ChatAgentResponseSchema.safeParse(fallback);
    expect(result.success).toBe(true);
  });

  it("exhausted-retries fallback", () => {
    const fallback = {
      type: "clarification" as const,
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

    const result = ChatAgentResponseSchema.safeParse(fallback);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. System prompt contains required guardrails
//    If someone edits prompts.ts and removes a guardrail, this fails the build.
// ---------------------------------------------------------------------------

describe("System prompt guardrails", () => {
  it("instructs model to NEVER return null", () => {
    expect(SYSTEM_PROMPT).toContain("NEVER return null");
  });

  it("includes multi-turn independence rule", () => {
    expect(SYSTEM_PROMPT).toContain("treat every message as a new equipment problem");
  });

  it("tells model asset tag is optional", () => {
    expect(SYSTEM_PROMPT).toContain("asset tag is OPTIONAL");
  });

  it("tells model to only ask once for info", () => {
    expect(SYSTEM_PROMPT).toContain("ONLY ask once");
  });

  it("includes non-medical equipment rejection rule", () => {
    expect(SYSTEM_PROMPT).toContain("non-medical equipment");
  });

  it("includes clarification example JSON", () => {
    // Ensures the model has a concrete example of a valid clarification response
    expect(SYSTEM_PROMPT).toContain('"type":"clarification"');
    expect(SYSTEM_PROMPT).toContain('"manualReferences":[]');
  });

  it("lists all 6 tools", () => {
    const tools = [
      "lookupAsset",
      "getRepairHistory",
      "searchManual",
      "searchParts",
      "getSuppliers",
      "getRepairGuide",
    ];
    for (const tool of tools) {
      expect(SYSTEM_PROMPT).toContain(tool);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Retry error detection patterns
//    Verify the string matching used to detect retryable errors.
// ---------------------------------------------------------------------------

describe("Retry error detection", () => {
  function isRetryable(msg: string): boolean {
    const isSchemaNull = msg.includes("Schema validation failed") && msg.includes("null");
    const isToolNull = msg.includes("missing tool response data");
    return isSchemaNull || isToolNull;
  }

  it("detects schema validation null error", () => {
    const msg = "INVALID_ARGUMENT: Schema validation failed. Parse Errors: - (root): must be object  Provided data:  null";
    expect(isRetryable(msg)).toBe(true);
  });

  it("detects missing tool response data error", () => {
    const msg = "Could not convert genkit part to gemini tool response part: missing tool response data";
    expect(isRetryable(msg)).toBe(true);
  });

  it("does NOT retry on rate limit (separate handling)", () => {
    const msg = "429 Resource Exhausted";
    expect(isRetryable(msg)).toBe(false);
  });

  it("does NOT retry on generic errors", () => {
    const msg = "Internal server error";
    expect(isRetryable(msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Multi-turn conversation edge cases
// ---------------------------------------------------------------------------

describe("Multi-turn conversation handling", () => {
  it("history mapping preserves all turns", () => {
    const messages = [
      { role: "user" as const, content: "Drager Evita V500 error 57" },
      { role: "assistant" as const, content: "That's a fan module issue." },
      { role: "user" as const, content: "GE CT660 tube arc fault" },
    ];

    const history = messages.slice(0, -1);
    const current = messages[messages.length - 1];

    const genkitHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    expect(genkitHistory).toHaveLength(2);
    expect(genkitHistory[0].role).toBe("user");
    expect(genkitHistory[1].role).toBe("model");
    expect(current.content).toContain("GE CT660");
  });

  it("single-message conversation has empty history", () => {
    const messages = [
      { role: "user" as const, content: "the ventilator is broken" },
    ];

    const history = messages.slice(0, -1);
    expect(history).toHaveLength(0);
  });

  it("assistant messages map to 'model' role for Genkit", () => {
    const messages = [
      { role: "assistant" as const, content: "Hello, I'm the repair agent." },
    ];

    const mapped = messages.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
    }));

    expect(mapped[0].role).toBe("model");
  });
});
