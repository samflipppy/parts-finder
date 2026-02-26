import { genkit } from "genkit";
import { vertexAI } from "@genkit-ai/vertexai";
import { enableGoogleCloudTelemetry } from "@genkit-ai/google-cloud";
import { trace } from "@opentelemetry/api";

// Use the auto-set GCLOUD_PROJECT env var in Cloud Functions;
// falls back to the Firebase project ID for local development.
const projectId = process.env.GCLOUD_PROJECT ?? "parts-test-93b26";

enableGoogleCloudTelemetry({ projectId });

export const ai = genkit({
  plugins: [vertexAI({ projectId, location: "us-central1" })],
  model: "vertexai/gemini-2.0-flash",
});

export const tracer = trace.getTracer("parts-finder-agent");

export async function generateWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("resource exhausted");
      if (isRateLimit && attempt < maxAttempts) {
        const delayMs = attempt * 15000;
        console.warn(`[generateWithRetry] Rate limited (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("generateWithRetry: exhausted all attempts");
}
