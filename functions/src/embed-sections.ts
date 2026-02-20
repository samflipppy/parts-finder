/**
 * RAG Embedding Script — generates vector embeddings for all manual sections.
 *
 * Run with: npx tsx src/embed-sections.ts
 *
 * HOW RAG WORKS (the indexing side):
 *
 * 1. Load all service manuals from Firestore
 * 2. For each section, build a text string that captures what it's about
 * 3. Send that text to an embedding model (Gemini text-embedding-004)
 *    → The model returns a 3072-dimensional vector (array of 3072 numbers)
 *    → Sections about similar topics will have similar vectors
 * 4. Store the vector alongside the section data in Firestore
 *
 * Later, at query time (in agent.ts):
 * 1. Embed the user's question using the same model
 * 2. Compare the query vector against all stored section vectors
 *    using cosine similarity (dot product / magnitudes)
 * 3. Return the sections with the highest similarity scores
 *
 * This is literally all RAG is: embed documents, embed query, find closest match.
 * Vector databases like Pinecone/Weaviate just do step 2 efficiently at scale.
 * At our scale (~20 sections), we can do it in a simple loop.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ServiceManual, ManualSpecification, SectionEmbedding } from "./types";

// Initialize Firebase
initializeApp();
const db = getFirestore();

// Initialize the Gemini API client for embeddings.
// We use the raw SDK here (not Genkit) because this is a standalone script.
const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.error("ERROR: Set GOOGLE_GENAI_API_KEY or GEMINI_API_KEY in your .env");
  process.exit(1);
}
const genai = new GoogleGenerativeAI(apiKey);

/**
 * Build the text that gets embedded for a section.
 *
 * The goal is to capture the *meaning* of the section in a single string
 * so the embedding model can understand what topics it covers.
 * We include: manual context, section title, content, specs, and warnings.
 */
function buildEmbeddingText(
  manual: ServiceManual,
  section: { title: string; content: string; specifications?: ManualSpecification[]; warnings?: string[]; steps?: string[] }
): string {
  const parts: string[] = [];

  // Manual context — helps disambiguate sections across different manuals
  parts.push(`[${manual.manufacturer} ${manual.equipmentName}]`);
  parts.push(`[Section: ${section.title}]`);

  // Main content
  parts.push(section.content);

  // Specifications — these are high-value search targets
  // ("what's the torque spec" → needs to match sections with torque specs)
  if (section.specifications && section.specifications.length > 0) {
    const specText = section.specifications
      .map((s) => {
        let str = `${s.parameter}: ${s.value} ${s.unit}`;
        if (s.tolerance) str += ` (${s.tolerance})`;
        return str;
      })
      .join("; ");
    parts.push(`[Specifications: ${specText}]`);
  }

  // Warnings — safety-critical content that techs often ask about
  if (section.warnings && section.warnings.length > 0) {
    parts.push(`[Warnings: ${section.warnings.join(" ")}]`);
  }

  // Step summaries — just the first few words of each step for context
  if (section.steps && section.steps.length > 0) {
    const stepSummary = section.steps
      .map((s, i) => `Step ${i + 1}: ${s.substring(0, 80)}`)
      .join("; ");
    parts.push(`[Procedure: ${stepSummary}]`);
  }

  return parts.join("\n");
}

/**
 * Call Gemini's embedding API for a single text.
 * Returns a 3072-dimensional vector (gemini-embedding-001 default).
 */
async function embedText(text: string): Promise<number[]> {
  const model = genai.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Main: load manuals → embed sections → write to Firestore
 */
async function main() {
  console.log("=== RAG Embedding Script ===\n");

  // Step 1: Load all service manuals from Firestore
  console.log("1. Loading service manuals from Firestore...");
  const snapshot = await db.collection("service_manuals").get();
  const manuals = snapshot.docs.map((doc) => doc.data() as ServiceManual);
  console.log(`   Found ${manuals.length} manuals.\n`);

  if (manuals.length === 0) {
    console.error("   No manuals found! Run the seed script first: npx tsx src/seed.ts");
    process.exit(1);
  }

  // Step 2: Flatten all sections and build embedding texts
  console.log("2. Building embedding texts for each section...");
  const sectionsToEmbed: Array<{
    manual: ServiceManual;
    section: ServiceManual["sections"][0];
    embeddingText: string;
  }> = [];

  for (const manual of manuals) {
    for (const section of manual.sections) {
      const text = buildEmbeddingText(manual, section);
      sectionsToEmbed.push({ manual, section, embeddingText: text });
      console.log(`   ${manual.manualId} > ${section.sectionId}: ${text.length} chars`);
    }
  }
  console.log(`   Total: ${sectionsToEmbed.length} sections to embed.\n`);

  // Step 3: Embed each section using Gemini
  console.log("3. Generating embeddings via Gemini text-embedding-004...");
  const embeddings: SectionEmbedding[] = [];

  for (const item of sectionsToEmbed) {
    process.stdout.write(`   Embedding ${item.manual.manualId} > ${item.section.sectionId}...`);
    const vector = await embedText(item.embeddingText);
    console.log(` done (${vector.length} dimensions)`);

    embeddings.push({
      manualId: item.manual.manualId,
      sectionId: item.section.sectionId,
      manualTitle: item.manual.title,
      sectionTitle: item.section.title,
      manufacturer: item.manual.manufacturer,
      equipmentName: item.manual.equipmentName,
      embeddedText: item.embeddingText,
      embedding: vector,
      content: item.section.content,
      specifications: item.section.specifications,
      warnings: item.section.warnings,
      steps: item.section.steps,
      tools: item.section.tools,
    });

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log();

  // Step 4: Write embeddings to Firestore
  console.log("4. Writing embeddings to Firestore (section_embeddings collection)...");
  const batch = db.batch();
  for (const emb of embeddings) {
    const docId = `${emb.manualId}_${emb.sectionId}`;
    const ref = db.collection("section_embeddings").doc(docId);
    batch.set(ref, emb);
  }
  await batch.commit();
  console.log(`   Wrote ${embeddings.length} embedding documents.\n`);

  // Summary
  console.log("=== Done! ===");
  console.log(`Embedded ${embeddings.length} sections from ${manuals.length} manuals.`);
  console.log("Each embedding is a 3072-dimensional vector from gemini-embedding-001.");
  console.log("\nThe searchManual tool will now use vector similarity to find relevant sections.");
  console.log("Run your chat to see it in action!\n");
}

main().catch((err) => {
  console.error("Embedding failed:", err);
  process.exit(1);
});
