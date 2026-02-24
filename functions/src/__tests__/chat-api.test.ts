/**
 * Tests for the /api/chat request validation logic.
 */

import { validateChatRequest } from "../validation";

describe("/api/chat request validation", () => {
  it("accepts a single user message", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "What equipment should I check?" }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts a multi-turn conversation", () => {
    const result = validateChatRequest({
      messages: [
        { role: "user", content: "Evita V500 error 57" },
        { role: "assistant", content: "That's likely a fan module issue." },
        { role: "user", content: "How do I replace it?" },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when messages field is missing", () => {
    const result = validateChatRequest({});
    expect(result.valid).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("Missing");
  });

  it("rejects when messages is not an array", () => {
    const result = validateChatRequest({ messages: "not an array" });
    expect(result.valid).toBe(false);
  });

  it("rejects when messages is empty array", () => {
    const result = validateChatRequest({ messages: [] });
    expect(result.valid).toBe(false);
  });

  it("rejects message with invalid role", () => {
    const result = validateChatRequest({
      messages: [{ role: "system", content: "test" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("role");
  });

  it("rejects message with missing role", () => {
    const result = validateChatRequest({
      messages: [{ content: "test" }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects message with missing content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user" }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("content");
  });

  it("rejects message with empty content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "" }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects message with non-string content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: 123 }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects when last message is from assistant", () => {
    const result = validateChatRequest({
      messages: [
        { role: "user", content: "help" },
        { role: "assistant", content: "sure" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("last message");
  });

  it("rejects conversation over 50,000 characters", () => {
    const longContent = "x".repeat(51000);
    const result = validateChatRequest({
      messages: [{ role: "user", content: longContent }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("50,000");
  });

  it("accepts conversation at exactly 50,000 characters", () => {
    const content = "x".repeat(50000);
    const result = validateChatRequest({
      messages: [{ role: "user", content }],
    });
    expect(result.valid).toBe(true);
  });
});

describe("ChatAgentResponse contract", () => {
  it("diagnosis response has all fields the UI needs for part cards", () => {
    const response = {
      type: "diagnosis",
      message: "Fan module failure.",
      manualReferences: [],
      diagnosis: "Error 57",
      recommendedPart: {
        name: "Fan Module",
        partNumber: "EVITA-FM-001",
        description: "Complete fan module",
        avgPrice: 45000,
        criticality: "critical",
      },
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [
        { name: "Fan v2", partNumber: "FM-002", reason: "Cheaper" },
      ],
      confidence: "high",
      reasoning: "test",
      warnings: [],
    };

    expect(response.recommendedPart).toBeTruthy();
    expect(response.recommendedPart!.name).toBeTruthy();
    expect(response.recommendedPart!.partNumber).toBeTruthy();
    expect(typeof response.recommendedPart!.avgPrice).toBe("number");
    expect(response.recommendedPart!.criticality).toBeTruthy();

    expect(response.alternativeParts[0].name).toBeTruthy();
    expect(response.alternativeParts[0].partNumber).toBeTruthy();
    expect(response.alternativeParts[0].reason).toBeTruthy();
  });

  it("clarification response has null part/diagnosis fields", () => {
    const response = {
      type: "clarification",
      message: "What make and model?",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "Insufficient info",
      warnings: [],
    };

    expect(response.type).toBe("clarification");
    expect(response.recommendedPart).toBeNull();
    expect(response.diagnosis).toBeNull();
    expect(response.confidence).toBeNull();
    expect(response.message).toBeTruthy();
  });

  it("guidance response includes manual references", () => {
    const response = {
      type: "guidance",
      message: "The torque spec is 25 Nm.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_7",
          sectionTitle: "Fan Module Replacement",
          quotedText: "Torque to 25 Nm +/- 2 Nm",
          pageHint: "p. 42",
        },
      ],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "high",
      reasoning: "Found in manual",
      warnings: [],
    };

    expect(response.manualReferences).toHaveLength(1);
    expect(response.manualReferences[0].quotedText).toContain("25 Nm");
    expect(response.manualReferences[0].sectionTitle).toBeTruthy();
    expect(response.manualReferences[0].manualId).toBeTruthy();
  });

  it("_metrics in response has the structure the trace UI expects", () => {
    const metrics = {
      requestId: "test-123",
      timestamp: "2025-01-01T00:00:00Z",
      input: "test",
      toolCalls: [
        {
          toolName: "searchManual",
          input: { keyword: "fan" },
          resultCount: 3,
          latencyMs: 450,
          timestamp: "2025-01-01T00:00:00Z",
          ragTrace: {
            searchMode: "vector" as const,
            embeddingsLoaded: 127,
            candidatesAfterFilter: 45,
            queryText: "Drager fan module",
            topScores: [
              { sectionTitle: "Fan Module", score: 0.85 },
              { sectionTitle: "Blower", score: 0.62 },
            ],
            similarityThreshold: 0.3,
            resultsAboveThreshold: 2,
            topK: 5,
          },
        },
      ],
      totalToolCalls: 1,
      toolSequence: ["searchManual"],
      confidence: "high" as const,
      partFound: true,
      recommendedPartNumber: "FM-001",
      supplierCount: 0,
      alternativeCount: 0,
      warningCount: 0,
      totalLatencyMs: 500,
      avgToolLatencyMs: 450,
    };

    expect(metrics.toolCalls[0].ragTrace).toBeDefined();
    expect(metrics.toolCalls[0].ragTrace!.topScores).toBeInstanceOf(Array);
    expect(metrics.toolCalls[0].ragTrace!.searchMode).toBe("vector");
    expect(typeof metrics.toolCalls[0].ragTrace!.similarityThreshold).toBe("number");
  });
});
