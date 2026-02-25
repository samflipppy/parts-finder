/**
 * Structured logging and metrics collection for the PartsFinder Agent.
 *
 * Captures per-request telemetry: tool calls, latency, confidence,
 * and result quality indicators. Persists to Firestore for trend analysis.
 */

import { randomUUID } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import type { AgentResponse } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterStep {
  filter: string;   // e.g. "category", "manufacturer"
  value: string;    // the search term Gemini sent
  remaining: number; // how many results survived this filter
}

export interface RAGTraceData {
  searchMode: "vector" | "keyword";
  embeddingsLoaded: number;
  candidatesAfterFilter: number;
  queryText: string;
  topScores: Array<{ sectionTitle: string; score: number }>;
  similarityThreshold: number;
  resultsAboveThreshold: number;
  topK: number;
}

export interface ToolCallMetric {
  toolName: string;
  input: Record<string, unknown>;
  resultCount: number;
  latencyMs: number;
  timestamp: string;
  filterSteps?: FilterStep[]; // per-filter narrowing trace (searchParts only)
  ragTrace?: RAGTraceData;    // RAG pipeline trace (searchManual only)
}

export interface RequestMetrics {
  requestId: string;
  timestamp: string;
  input: string;

  // Tool usage
  toolCalls: ToolCallMetric[];
  totalToolCalls: number;
  toolSequence: string[]; // e.g. ["searchParts", "getSuppliers"]

  // Response quality
  confidence: "high" | "medium" | "low";
  partFound: boolean;
  recommendedPartNumber: string | null;
  supplierCount: number;
  alternativeCount: number;
  warningCount: number;

  // Performance
  totalLatencyMs: number;
  avgToolLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Streaming event types
// ---------------------------------------------------------------------------

export type StreamChunk =
  | { type: "tool_done"; toolName: string; resultCount: number; latencyMs: number }
  | { type: "text_chunk"; text: string }
  | { type: "phase_structuring" };

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

let _activeCollector: MetricsCollector | null = null;
let _activeChunkEmitter: ((chunk: StreamChunk) => void) | null = null;

export function setActiveCollector(collector: MetricsCollector | null): void {
  _activeCollector = collector;
}

export function getActiveCollector(): MetricsCollector | null {
  return _activeCollector;
}

export function setActiveChunkEmitter(fn: ((chunk: StreamChunk) => void) | null): void {
  _activeChunkEmitter = fn;
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

export class MetricsCollector {
  readonly requestId: string;
  private startTime: number;
  private toolCalls: ToolCallMetric[] = [];

  constructor() {
    this.requestId = randomUUID();
    this.startTime = Date.now();
  }

  /** Record a single tool invocation with its timing. */
  recordToolCall(
    toolName: string,
    input: Record<string, unknown>,
    resultCount: number,
    latencyMs: number,
    filterSteps?: FilterStep[],
    ragTrace?: RAGTraceData
  ): void {
    this.toolCalls.push({
      toolName,
      input,
      resultCount,
      latencyMs,
      timestamp: new Date().toISOString(),
      filterSteps,
      ragTrace,
    });
    _activeChunkEmitter?.({ type: "tool_done", toolName, resultCount, latencyMs });
  }

  /** How many tool calls have been recorded so far. */
  getToolCallCount(): number {
    return this.toolCalls.length;
  }

  /** Produce the final metrics snapshot after the agent flow completes. */
  finalize(input: string, response: AgentResponse): RequestMetrics {
    const totalLatencyMs = Date.now() - this.startTime;
    const totalToolLatency = this.toolCalls.reduce(
      (sum, tc) => sum + tc.latencyMs,
      0
    );
    const avgToolLatencyMs =
      this.toolCalls.length > 0
        ? Math.round(totalToolLatency / this.toolCalls.length)
        : 0;

    const metrics: RequestMetrics = {
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      input,
      toolCalls: this.toolCalls,
      totalToolCalls: this.toolCalls.length,
      toolSequence: this.toolCalls.map((tc) => tc.toolName),
      confidence: response.confidence,
      partFound: response.recommendedPart !== null,
      recommendedPartNumber: response.recommendedPart?.partNumber ?? null,
      supplierCount: response.supplierRanking.length,
      alternativeCount: response.alternativeParts.length,
      warningCount: response.warnings.length,
      totalLatencyMs,
      avgToolLatencyMs,
    };

    // Human-readable log
    console.log(
      `[metrics] Request ${this.requestId} completed in ${totalLatencyMs}ms — ` +
        `${this.toolCalls.length} tool calls, confidence: ${response.confidence}, ` +
        `part found: ${metrics.partFound}`
    );

    // Structured log for Cloud Monitoring log-based metrics
    console.log(JSON.stringify({
      severity: "INFO",
      message: "agent_request_complete",
      "logging.googleapis.com/labels": { type: "agent_metrics" },
      agent: {
        requestId: this.requestId,
        totalLatencyMs,
        totalToolCalls: this.toolCalls.length,
        avgToolLatencyMs,
        confidence: response.confidence,
        partFound: metrics.partFound,
        supplierCount: metrics.supplierCount,
        warningCount: metrics.warningCount,
        toolSequence: metrics.toolSequence,
      },
    }));

    return metrics;
  }
}

// ---------------------------------------------------------------------------
// Firestore persistence
// ---------------------------------------------------------------------------

/** Persist a metrics snapshot to the metrics collection. */
export async function saveMetrics(metrics: RequestMetrics): Promise<void> {
  try {
    const db = getFirestore();
    // JSON round-trip strips undefined values — Firestore rejects them
    // (e.g. optional filterSteps/ragTrace fields on tool calls that don't use them)
    const data = JSON.parse(JSON.stringify(metrics));
    await db.collection("metrics").doc(metrics.requestId).set(data);
    console.log(`[metrics] Saved to metrics/${metrics.requestId}`);
  } catch (err) {
    // Non-blocking — metrics should never break the main request
    console.error("[metrics] Failed to persist:", err);
  }
}

/** Fetch recent metrics for the dashboard/API. */
export async function getRecentMetrics(
  limit: number = 50
): Promise<RequestMetrics[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("metrics")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as RequestMetrics);
}

/** Compute aggregate stats from an array of metrics. */
export function aggregateMetrics(metrics: RequestMetrics[]): {
  totalRequests: number;
  avgLatencyMs: number;
  avgToolCalls: number;
  partFoundRate: number;
  confidenceDistribution: Record<string, number>;
  toolUsageCount: Record<string, number>;
} {
  if (metrics.length === 0) {
    return {
      totalRequests: 0,
      avgLatencyMs: 0,
      avgToolCalls: 0,
      partFoundRate: 0,
      confidenceDistribution: {},
      toolUsageCount: {},
    };
  }

  const totalRequests = metrics.length;
  const avgLatencyMs = Math.round(
    metrics.reduce((sum, m) => sum + m.totalLatencyMs, 0) / totalRequests
  );
  const avgToolCalls = +(
    metrics.reduce((sum, m) => sum + m.totalToolCalls, 0) / totalRequests
  ).toFixed(1);
  const partFoundRate = +(
    (metrics.filter((m) => m.partFound).length / totalRequests) *
    100
  ).toFixed(1);

  const confidenceDistribution: Record<string, number> = {};
  const toolUsageCount: Record<string, number> = {};

  for (const m of metrics) {
    confidenceDistribution[m.confidence] =
      (confidenceDistribution[m.confidence] || 0) + 1;

    for (const tool of m.toolSequence) {
      toolUsageCount[tool] = (toolUsageCount[tool] || 0) + 1;
    }
  }

  return {
    totalRequests,
    avgLatencyMs,
    avgToolCalls,
    partFoundRate,
    confidenceDistribution,
    toolUsageCount,
  };
}
