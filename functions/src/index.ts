import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { flushTracing } from "genkit/tracing";
import { chatStreamWithMetrics } from "./agent";
import { getRecentMetrics, aggregateMetrics } from "./metrics";
import { validateChatRequest } from "./validation";
import type { ChatMessage } from "./types";

// Re-export for backwards compatibility
export { validateChatRequest } from "./validation";
export type { ValidationResult } from "./validation";

// Initialize Firebase Admin SDK (once, at cold start)
initializeApp();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per Cloud Functions instance)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // max requests per IP per window

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
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

    const clientIp = req.ip || "unknown";
    if (isRateLimited(clientIp)) {
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
      for await (const event of chatStreamWithMetrics(messages)) {
        write(event);
      }
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
