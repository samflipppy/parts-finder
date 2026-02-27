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
