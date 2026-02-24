import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { flushTracing } from "genkit/tracing";
import { chatWithMetrics, chatStreamWithMetrics } from "./agent";
import { getRecentMetrics, aggregateMetrics } from "./metrics";
import type { ChatMessage } from "./types";

// Initialize Firebase Admin SDK (once, at cold start)
initializeApp();

/**
 * POST /api/chat
 *
 * V2 Diagnostic Partner endpoint. Accepts a conversation history
 * (multi-turn messages with optional image attachments) and returns
 * a ChatAgentResponse with manual references, diagnosis, and guidance.
 */
export const chat = onRequest(
  { cors: true, timeoutSeconds: 300 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const { messages } = req.body as { messages?: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error:
          "Missing or invalid 'messages' field. Provide an array of {role, content} message objects.",
      });
      return;
    }

    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        res.status(400).json({
          error: "Each message must have a role of 'user' or 'assistant'.",
        });
        return;
      }
      if (!msg.content || typeof msg.content !== "string") {
        res.status(400).json({
          error: "Each message must have a non-empty 'content' string.",
        });
        return;
      }
    }

    if (messages[messages.length - 1].role !== "user") {
      res.status(400).json({
        error: "The last message must be from the user.",
      });
      return;
    }

    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > 50000) {
      res.status(400).json({
        error: "Conversation too long. Maximum 50,000 characters total.",
      });
      return;
    }

    const lastMsg = messages[messages.length - 1].content;
    console.log(
      `[chat] Received ${messages.length} messages, latest: "${lastMsg.substring(0, 100)}..."`
    );

    try {
      const { response, metrics } = await chatWithMetrics(messages);
      console.log(
        `[chat] Completed — type: ${response.type}, refs: ${response.manualReferences.length}, ` +
          `latency: ${metrics.totalLatencyMs}ms, tools: ${metrics.totalToolCalls}`
      );
      res.status(200).json({ ...response, _metrics: metrics });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[chat] Error:", message);
      res.status(500).json({
        error: "Failed to process chat request.",
        detail: message,
      });
    } finally {
      await flushTracing();
    }
  }
);

/**
 * POST /api/chatStream
 *
 * Streaming version of the chat endpoint. Returns a text/event-stream response
 * with tool_done and phase_structuring events during execution, followed by a
 * complete event containing the full ChatAgentResponse.
 */
export const chatStream = onRequest(
  { cors: true, timeoutSeconds: 300 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const { messages } = req.body as { messages?: import("./types").ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Missing or invalid 'messages' field." });
      return;
    }

    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        res.status(400).json({ error: "Each message must have a role of 'user' or 'assistant'." });
        return;
      }
      if (!msg.content || typeof msg.content !== "string") {
        res.status(400).json({ error: "Each message must have a non-empty 'content' string." });
        return;
      }
    }

    if (messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "The last message must be from the user." });
      return;
    }

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
      console.error("[chatStream] Error:", message);
      write({ type: "error", message });
    } finally {
      res.end();
      await flushTracing();
    }
  }
);

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
