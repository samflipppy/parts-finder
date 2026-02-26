import { createHash } from "crypto";
import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { flushTracing } from "genkit/tracing";
import { getFirestore } from "firebase-admin/firestore";
import { chatWithMetrics } from "./agent";
import { getRecentMetrics, aggregateMetrics } from "./metrics";
import { validateChatRequest } from "./validation";
import type { ChatMessage } from "./types";

// Re-export for backwards compatibility
export { validateChatRequest } from "./validation";
export type { ValidationResult } from "./validation";

// Initialize Firebase Admin SDK (once, at cold start)
initializeApp();

// ---------------------------------------------------------------------------
// Demo password (set via firebase functions:config or .env)
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = defineString("DEMO_PASSWORD", { default: "123" });

function checkDemoAuth(req: { headers: Record<string, unknown> }, res: { status: (code: number) => { json: (body: object) => void } }): boolean {
  const password = DEMO_PASSWORD.value();
  if (!password) return true; // no password configured → open access
  const provided = req.headers["x-demo-password"] as string | undefined;
  if (provided === password) return true;
  res.status(401).json({ error: "Invalid or missing demo password." });
  return false;
}

// ---------------------------------------------------------------------------
// Distributed rate limiter (Firestore-backed, works across all instances)
// ---------------------------------------------------------------------------
// Configure a TTL policy on the "rate_limits" collection in the Firebase
// console to auto-delete expired documents (field: "expiresAt", type: Date).

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // max requests per IP per window

async function isRateLimited(ip: string): Promise<boolean> {
  const db = getFirestore();
  // Hash the IP for privacy; bucket by time window for automatic rotation
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  const windowKey = `${ipHash}_${Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)}`;
  const ref = db.collection("rate_limits").doc(windowKey);

  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const count = (doc.data()?.count as number ?? 0) + 1;
      tx.set(ref, {
        count,
        expiresAt: new Date(Date.now() + RATE_LIMIT_WINDOW_MS * 2),
      }, { merge: true });
      return count;
    });
    return result > RATE_LIMIT_MAX_REQUESTS;
  } catch (err) {
    // Fail open — don't block requests if Firestore is temporarily unavailable
    console.warn("[rateLimit] Firestore check failed, allowing request:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat  (SSE streaming — single endpoint)
// ---------------------------------------------------------------------------

/**
 * POST /api/chat
 *
 * Single streaming endpoint. Returns text/event-stream with:
 *   - tool_done events as each tool completes
 *   - text_chunk events during generation
 *   - complete event with the full structured ChatAgentResponse + metrics
 */
export const chat = onRequest(
  { cors: true, timeoutSeconds: 300 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    if (!checkDemoAuth(req, res)) return;

    const clientIp = req.ip || "unknown";
    if (await isRateLimited(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
      return;
    }

    const validation = validateChatRequest(req.body);
    if (!validation.valid) {
      res.status(validation.status!).json({ error: validation.error });
      return;
    }

    const messages = req.body.messages as ChatMessage[];
    const lastMsg = messages[messages.length - 1].content;
    console.log(`[chat] ${messages.length} messages, latest: "${lastMsg.substring(0, 100)}"`);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const write = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const response = await chatWithMetrics(messages);
      write({ type: "complete", response });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[chat] Error:", message);
      write({ type: "error", message });
    } finally {
      res.end();
      await flushTracing();
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/metrics
// ---------------------------------------------------------------------------

/**
 * GET /api/metrics
 *
 * Returns recent request metrics and aggregate stats for
 * monitoring agent performance over time.
 */
export const metrics = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed. Use GET." });
      return;
    }

    if (!checkDemoAuth(req, res)) return;

    try {
      const limit = Math.min(
        parseInt(req.query.limit as string, 10) || 50,
        200
      );
      const recent = await getRecentMetrics(limit);
      const aggregated = aggregateMetrics(recent);

      res.status(200).json({
        summary: aggregated,
        recent,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[metrics] Error:", message);
      res.status(500).json({
        error: "Failed to fetch metrics.",
        detail: message,
      });
    } finally {
      await flushTracing();
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/feedback  — per-conversation star rating
// ---------------------------------------------------------------------------

/**
 * POST /api/feedback
 *
 * Accepts { rating: 1-5, messageCount: number, lastRequestId?: string }
 * Persists to Firestore and emits a structured log for Cloud Monitoring.
 */
export const feedback = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    if (!checkDemoAuth(req, res)) return;

    const { rating, messageCount, lastRequestId } = req.body ?? {};

    if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      res.status(400).json({ error: "rating must be an integer 1-5." });
      return;
    }

    const doc = {
      rating,
      messageCount: typeof messageCount === "number" ? messageCount : 0,
      lastRequestId: typeof lastRequestId === "string" ? lastRequestId : null,
      timestamp: new Date().toISOString(),
      ip: req.ip || "unknown",
    };

    try {
      const db = getFirestore();
      const ref = await db.collection("feedback").add(doc);

      // Structured log — Cloud Monitoring can create log-based metrics from this
      console.log(JSON.stringify({
        severity: "INFO",
        message: "user_feedback",
        "logging.googleapis.com/labels": { type: "agent_feedback" },
        feedback: {
          rating: doc.rating,
          messageCount: doc.messageCount,
          lastRequestId: doc.lastRequestId,
          feedbackId: ref.id,
        },
      }));

      res.status(200).json({ ok: true, feedbackId: ref.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[feedback] Error:", message);
      res.status(500).json({ error: "Failed to save feedback." });
    }
  }
);
