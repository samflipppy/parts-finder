/**
 * Unit tests for MetricsCollector, RAGTraceData, and aggregateMetrics.
 *
 * These are pure logic tests — no Firestore, no LLM, no network.
 */

import {
  MetricsCollector,
  setActiveCollector,
  getActiveCollector,
  aggregateMetrics,
  type RequestMetrics,
  type RAGTraceData,
} from "../metrics";
import type { AgentResponse } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal AgentResponse that satisfies the finalize() contract. */
function makeAgentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    diagnosis: "Test diagnosis",
    recommendedPart: null,
    repairGuide: null,
    supplierRanking: [],
    alternativeParts: [],
    confidence: "high",
    reasoning: "test",
    warnings: [],
    ...overrides,
  };
}

/** Build a minimal RequestMetrics for aggregation tests. */
function makeMetrics(overrides: Partial<RequestMetrics> = {}): RequestMetrics {
  return {
    requestId: "test-id",
    timestamp: new Date().toISOString(),
    input: "test input",
    toolCalls: [],
    totalToolCalls: 0,
    toolSequence: [],
    confidence: "high",
    partFound: false,
    recommendedPartNumber: null,
    supplierCount: 0,
    alternativeCount: 0,
    warningCount: 0,
    totalLatencyMs: 100,
    avgToolLatencyMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

describe("MetricsCollector", () => {
  it("generates a unique requestId", () => {
    const a = new MetricsCollector();
    const b = new MetricsCollector();
    expect(a.requestId).toBeTruthy();
    expect(b.requestId).toBeTruthy();
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("records tool calls and exposes them in finalize()", () => {
    const c = new MetricsCollector();

    c.recordToolCall("searchParts", { manufacturer: "Drager" }, 3, 120);
    c.recordToolCall("getSuppliers", { supplierIds: ["sup_001"] }, 1, 45);

    const metrics = c.finalize("test query", makeAgentResponse());

    expect(metrics.totalToolCalls).toBe(2);
    expect(metrics.toolSequence).toEqual(["searchParts", "getSuppliers"]);
    expect(metrics.toolCalls).toHaveLength(2);

    // First tool call
    expect(metrics.toolCalls[0].toolName).toBe("searchParts");
    expect(metrics.toolCalls[0].resultCount).toBe(3);
    expect(metrics.toolCalls[0].latencyMs).toBe(120);
    expect(metrics.toolCalls[0].timestamp).toBeTruthy();
  });

  it("records filterSteps on searchParts calls", () => {
    const c = new MetricsCollector();

    const filterSteps = [
      { filter: "manufacturer", value: "Drager", remaining: 8 },
      { filter: "errorCode", value: "Error 57", remaining: 1 },
    ];
    c.recordToolCall("searchParts", {}, 1, 80, filterSteps);

    const metrics = c.finalize("test", makeAgentResponse());

    expect(metrics.toolCalls[0].filterSteps).toEqual(filterSteps);
  });

  it("records RAGTraceData on searchManual calls", () => {
    const c = new MetricsCollector();

    const ragTrace: RAGTraceData = {
      searchMode: "vector",
      embeddingsLoaded: 127,
      candidatesAfterFilter: 45,
      queryText: "Drager Evita V500 fan module",
      topScores: [
        { sectionTitle: "Fan Module Replacement", score: 0.8234 },
        { sectionTitle: "Blower Assembly", score: 0.5102 },
      ],
      similarityThreshold: 0.3,
      resultsAboveThreshold: 2,
      topK: 5,
    };
    c.recordToolCall("searchManual", { keyword: "fan" }, 2, 350, undefined, ragTrace);

    const metrics = c.finalize("test", makeAgentResponse());

    expect(metrics.toolCalls[0].ragTrace).toBeDefined();
    expect(metrics.toolCalls[0].ragTrace!.searchMode).toBe("vector");
    expect(metrics.toolCalls[0].ragTrace!.embeddingsLoaded).toBe(127);
    expect(metrics.toolCalls[0].ragTrace!.topScores).toHaveLength(2);
    expect(metrics.toolCalls[0].ragTrace!.topScores[0].score).toBe(0.8234);
  });

  it("computes totalLatencyMs as wall-clock time", () => {
    const c = new MetricsCollector();
    // No tool calls, just finalize immediately
    const metrics = c.finalize("test", makeAgentResponse());
    expect(metrics.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.totalLatencyMs).toBeLessThan(1000); // Should be nearly instant
  });

  it("computes avgToolLatencyMs correctly", () => {
    const c = new MetricsCollector();
    c.recordToolCall("searchParts", {}, 1, 100);
    c.recordToolCall("getSuppliers", {}, 2, 200);
    c.recordToolCall("getRepairGuide", {}, 1, 300);

    const metrics = c.finalize("test", makeAgentResponse());
    expect(metrics.avgToolLatencyMs).toBe(200); // (100+200+300)/3
  });

  it("handles zero tool calls gracefully", () => {
    const c = new MetricsCollector();
    const metrics = c.finalize("test", makeAgentResponse());
    expect(metrics.totalToolCalls).toBe(0);
    expect(metrics.avgToolLatencyMs).toBe(0);
    expect(metrics.toolSequence).toEqual([]);
  });

  it("extracts response quality fields from AgentResponse", () => {
    const c = new MetricsCollector();

    const response = makeAgentResponse({
      confidence: "medium",
      recommendedPart: {
        name: "Fan Module",
        partNumber: "FM-001",
        description: "test",
        avgPrice: 450,
        criticality: "critical",
      },
      supplierRanking: [
        { supplierName: "MedSupply", qualityScore: 98, deliveryDays: 2, reasoning: "best" },
      ],
      alternativeParts: [
        { name: "Fan Alt", partNumber: "FM-002", reason: "cheaper" },
      ],
      warnings: ["Verify compatibility", "Critical part"],
    });

    const metrics = c.finalize("test", response);

    expect(metrics.confidence).toBe("medium");
    expect(metrics.partFound).toBe(true);
    expect(metrics.recommendedPartNumber).toBe("FM-001");
    expect(metrics.supplierCount).toBe(1);
    expect(metrics.alternativeCount).toBe(1);
    expect(metrics.warningCount).toBe(2);
  });

  it("sets partFound=false when recommendedPart is null", () => {
    const c = new MetricsCollector();
    const metrics = c.finalize("test", makeAgentResponse({ recommendedPart: null }));
    expect(metrics.partFound).toBe(false);
    expect(metrics.recommendedPartNumber).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Module-level collector (request-scoped context)
// ---------------------------------------------------------------------------

describe("setActiveCollector / getActiveCollector", () => {
  afterEach(() => {
    setActiveCollector(null);
  });

  it("starts as null", () => {
    setActiveCollector(null);
    expect(getActiveCollector()).toBeNull();
  });

  it("can set and get a collector", () => {
    const c = new MetricsCollector();
    setActiveCollector(c);
    expect(getActiveCollector()).toBe(c);
  });

  it("can be cleared back to null", () => {
    const c = new MetricsCollector();
    setActiveCollector(c);
    setActiveCollector(null);
    expect(getActiveCollector()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aggregateMetrics
// ---------------------------------------------------------------------------

describe("aggregateMetrics", () => {
  it("returns zeroed stats for empty input", () => {
    const result = aggregateMetrics([]);
    expect(result.totalRequests).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
    expect(result.avgToolCalls).toBe(0);
    expect(result.partFoundRate).toBe(0);
    expect(result.confidenceDistribution).toEqual({});
    expect(result.toolUsageCount).toEqual({});
  });

  it("computes correct averages across multiple requests", () => {
    const metrics = [
      makeMetrics({ totalLatencyMs: 1000, totalToolCalls: 3, partFound: true }),
      makeMetrics({ totalLatencyMs: 2000, totalToolCalls: 2, partFound: false }),
      makeMetrics({ totalLatencyMs: 3000, totalToolCalls: 4, partFound: true }),
    ];

    const result = aggregateMetrics(metrics);

    expect(result.totalRequests).toBe(3);
    expect(result.avgLatencyMs).toBe(2000); // (1000+2000+3000)/3
    expect(result.avgToolCalls).toBe(3);    // (3+2+4)/3
    expect(result.partFoundRate).toBe(66.7); // 2/3 * 100
  });

  it("counts confidence distribution correctly", () => {
    const metrics = [
      makeMetrics({ confidence: "high" }),
      makeMetrics({ confidence: "high" }),
      makeMetrics({ confidence: "medium" }),
      makeMetrics({ confidence: "low" }),
    ];

    const result = aggregateMetrics(metrics);
    expect(result.confidenceDistribution).toEqual({
      high: 2,
      medium: 1,
      low: 1,
    });
  });

  it("counts tool usage across requests", () => {
    const metrics = [
      makeMetrics({ toolSequence: ["searchParts", "getSuppliers"] }),
      makeMetrics({ toolSequence: ["searchParts", "getSuppliers", "getRepairGuide"] }),
      makeMetrics({ toolSequence: ["searchManual"] }),
    ];

    const result = aggregateMetrics(metrics);
    expect(result.toolUsageCount).toEqual({
      searchParts: 2,
      getSuppliers: 2,
      getRepairGuide: 1,
      searchManual: 1,
    });
  });
});
