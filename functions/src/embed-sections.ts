/**
 * Generates and stores vector embeddings for all service manual sections.
 * Run with: npx tsx src/embed-sections.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { genkit } from "genkit";
import { vertexAI } from "@genkit-ai/vertexai";
import type { ServiceManual, ManualSpecification, SectionEmbedding } from "./types";

// Initialize Firebase
initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const ai = genkit({
  plugins: [vertexAI({ projectId: "parts-test-93b26", location: "us-central1" })],
});

function buildEmbeddingText(
  manual: ServiceManual,
  section: { title: string; content: string; specifications?: ManualSpecification[]; warnings?: string[]; steps?: string[] }
): string {
  const parts: string[] = [];

  parts.push(`[${manual.manufacturer} ${manual.equipmentName}]`);
  parts.push(`[Section: ${section.title}]`);
  parts.push(section.content);

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

  if (section.warnings && section.warnings.length > 0) {
    parts.push(`[Warnings: ${section.warnings.join(" ")}]`);
  }

  if (section.steps && section.steps.length > 0) {
    const stepSummary = section.steps
      .map((s, i) => `Step ${i + 1}: ${s.substring(0, 80)}`)
      .join("; ");
    parts.push(`[Procedure: ${stepSummary}]`);
  }

  return parts.join("\n");
}

async function embedText(text: string): Promise<number[]> {
  const result = await ai.embed({
    embedder: "vertexai/text-embedding-004",
    content: text,
  });
  return result[0].embedding;
}

async function main() {
  console.log("=== Embedding Script ===\n");

  console.log("Loading service manuals...");
  const snapshot = await db.collection("service_manuals").get();
  const manuals = snapshot.docs.map((doc) => doc.data() as ServiceManual);
  console.log(`Found ${manuals.length} manuals.\n`);

  if (manuals.length === 0) {
    console.error("   No manuals found! Run the seed script first: npx tsx src/seed.ts");
    process.exit(1);
  }

  console.log("Building embedding texts...");
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
  console.log(`${sectionsToEmbed.length} sections to embed.\n`);

  console.log("Generating embeddings...");
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

  console.log("Writing embeddings to Firestore...");
  const BATCH_SIZE = 5;
  for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
    const chunk = embeddings.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const emb of chunk) {
      const docId = `${emb.manualId}_${emb.sectionId}`;
      const ref = db.collection("section_embeddings").doc(docId);
      batch.set(ref, emb);
    }
    await batch.commit();
    console.log(`   Wrote docs ${i + 1}–${i + chunk.length} of ${embeddings.length}`);
  }
  console.log(`   Done. ${embeddings.length} embedding documents written.\n`);

  console.log(`\nDone — ${embeddings.length} sections from ${manuals.length} manuals embedded.`);
}

main().catch((err) => {
  console.error("Embedding failed:", err);
  process.exit(1);
});
