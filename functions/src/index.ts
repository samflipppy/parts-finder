import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { diagnoseAndRecommend } from "./agent";

// Initialize Firebase Admin SDK (once, at cold start)
initializeApp();

/**
 * POST /api/diagnose
 *
 * Accepts { description: string } and returns an AgentResponse with
 * diagnosis, recommended part, supplier ranking, and reasoning.
 */
export const diagnose = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const { description } = req.body as { description?: string };

    // Input validation
    if (!description || typeof description !== "string") {
      res.status(400).json({
        error:
          "Missing or invalid 'description' field. Provide a string describing the equipment problem.",
      });
      return;
    }

    if (description.trim().length === 0) {
      res.status(400).json({ error: "Description cannot be empty." });
      return;
    }

    if (description.length > 2000) {
      res.status(400).json({
        error: "Description too long. Maximum 2000 characters.",
      });
      return;
    }

    console.log(`[diagnose] Received request: "${description.substring(0, 100)}..."`);

    try {
      const result = await diagnoseAndRecommend(description);
      console.log("[diagnose] Responding with confidence:", result.confidence);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[diagnose] Error:", message);
      res.status(500).json({
        error: "Failed to process diagnosis request.",
        detail: message,
      });
    }
  }
);
