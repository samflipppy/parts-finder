import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { getFirestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { Part, Supplier, RepairGuide, AgentResponse, ServiceManual, SectionEmbedding, ChatMessage, ChatAgentResponse } from "./types";
import {
  MetricsCollector,
  setActiveCollector,
  getActiveCollector,
  saveMetrics,
  type FilterStep,
  type RAGTraceData,
  type RequestMetrics,
} from "./metrics";

// ---------------------------------------------------------------------------
// Genkit instance
// ---------------------------------------------------------------------------

const ai = genkit({
  plugins: [googleAI()],
  model: "googleai/gemini-2.0-flash",
});

// ---------------------------------------------------------------------------
// Zod schemas (mirror the TypeScript interfaces for Genkit validation)
// ---------------------------------------------------------------------------

const PartSchema = z.object({
  id: z.string(),
  name: z.string(),
  partNumber: z.string(),
  category: z.string(),
  manufacturer: z.string(),
  compatibleEquipment: z.array(z.string()),
  relatedErrorCodes: z.array(z.string()),
  description: z.string(),
  avgPrice: z.number(),
  criticality: z.enum(["low", "medium", "high", "critical"]),
  supplierIds: z.array(z.string()),
});

const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualityScore: z.number(),
  avgDeliveryDays: z.number(),
  returnRate: z.number(),
  specialties: z.array(z.string()),
  isOEM: z.boolean(),
  inStock: z.boolean(),
});

const AgentResponseSchema = z.object({
  diagnosis: z.string(),
  recommendedPart: z
    .object({
      name: z.string(),
      partNumber: z.string(),
      description: z.string(),
      avgPrice: z.number(),
      criticality: z.string(),
    })
    .nullable(),
  repairGuide: z
    .object({
      title: z.string(),
      estimatedTime: z.string(),
      difficulty: z.string(),
      safetyWarnings: z.array(z.string()),
      steps: z.array(z.string()),
      tools: z.array(z.string()),
    })
    .nullable(),
  supplierRanking: z.array(
    z.object({
      supplierName: z.string(),
      qualityScore: z.number(),
      deliveryDays: z.number(),
      reasoning: z.string(),
    })
  ),
  alternativeParts: z.array(
    z.object({
      name: z.string(),
      partNumber: z.string(),
      reason: z.string(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
  warnings: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Tool 1: searchParts (instrumented)
// ---------------------------------------------------------------------------

const searchParts = ai.defineTool(
  {
    name: "searchParts",
    description:
      "Search the parts database for replacement parts matching the given criteria. " +
      "You can filter by manufacturer, equipment name, error code, symptom, and/or category. " +
      "Try the most specific search first, then broaden if no results are returned.",
    inputSchema: z.object({
      manufacturer: z
        .string()
        .optional()
        .describe("Equipment manufacturer, e.g. Drager, Philips, GE, Zoll"),
      equipmentName: z
        .string()
        .optional()
        .describe("Equipment model name, e.g. Evita V500, IntelliVue MX800"),
      errorCode: z
        .string()
        .optional()
        .describe("Error code displayed on the equipment, e.g. Error 57"),
      symptom: z
        .string()
        .optional()
        .describe("Symptom description, e.g. fan not spinning, screen black"),
      category: z
        .string()
        .optional()
        .describe(
          "Equipment category: ventilators, monitors, imaging, defibrillators, infusion, or anesthesia"
        ),
    }),
    outputSchema: z.array(PartSchema),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log("[searchParts] Query params:", JSON.stringify(input));

    // Fetch all parts — only 28 docs, so in-memory filtering is fast and
    // avoids case-sensitivity issues with Firestore where() queries.
    const snapshot = await db.collection("parts").get();
    let results: Part[] = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as Part
    );

    console.log(
      `[searchParts] Firestore returned ${results.length} docs`
    );

    // All filters are case-insensitive in-memory.
    // Track how each filter narrows results for the reasoning trace.
    const filterSteps: FilterStep[] = [];

    if (input.category) {
      const searchTerm = input.category.toLowerCase();
      results = results.filter(
        (part) => part.category.toLowerCase() === searchTerm
      );
      filterSteps.push({ filter: "category", value: input.category, remaining: results.length });
    }

    if (input.manufacturer) {
      const searchTerm = input.manufacturer.toLowerCase();
      results = results.filter(
        (part) => part.manufacturer.toLowerCase() === searchTerm
      );
      filterSteps.push({ filter: "manufacturer", value: input.manufacturer, remaining: results.length });
    }

    if (input.equipmentName) {
      const searchTerm = input.equipmentName.toLowerCase();
      results = results.filter((part) =>
        part.compatibleEquipment.some((eq) =>
          eq.toLowerCase().includes(searchTerm)
        )
      );
      filterSteps.push({ filter: "equipmentName", value: input.equipmentName, remaining: results.length });
    }

    if (input.errorCode) {
      const searchTerm = input.errorCode.toLowerCase();
      results = results.filter((part) =>
        part.relatedErrorCodes.some((code) =>
          code.toLowerCase().includes(searchTerm)
        )
      );
      filterSteps.push({ filter: "errorCode", value: input.errorCode, remaining: results.length });
    }

    if (input.symptom) {
      const searchTerm = input.symptom.toLowerCase();
      results = results.filter(
        (part) =>
          part.description.toLowerCase().includes(searchTerm) ||
          part.name.toLowerCase().includes(searchTerm)
      );
      filterSteps.push({ filter: "symptom", value: input.symptom, remaining: results.length });
    }

    const latencyMs = Date.now() - startTime;
    console.log(
      `[searchParts] Returning ${results.length} parts after all filters (${latencyMs}ms)`
    );

    // Record metrics if a collector is active
    const collector = getActiveCollector();
    if (collector) {
      collector.recordToolCall(
        "searchParts",
        input as Record<string, unknown>,
        results.length,
        latencyMs,
        filterSteps
      );
    }

    return results;
  }
);

// ---------------------------------------------------------------------------
// Tool 2: getSuppliers (instrumented)
// ---------------------------------------------------------------------------

const getSuppliers = ai.defineTool(
  {
    name: "getSuppliers",
    description:
      "Fetch supplier details (quality score, delivery speed, return rate) " +
      "for the given supplier IDs. Use this to evaluate and rank suppliers for a recommended part.",
    inputSchema: z.object({
      supplierIds: z
        .array(z.string())
        .describe("Array of supplier document IDs, e.g. ['sup_001', 'sup_002']"),
    }),
    outputSchema: z.array(SupplierSchema),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log("[getSuppliers] Fetching suppliers:", input.supplierIds);

    const suppliers: Supplier[] = [];
    for (const id of input.supplierIds) {
      const doc = await db.collection("suppliers").doc(id).get();
      if (doc.exists) {
        suppliers.push(doc.data() as Supplier);
      } else {
        console.warn(`[getSuppliers] Supplier ${id} not found`);
      }
    }

    const latencyMs = Date.now() - startTime;
    console.log(
      `[getSuppliers] Returning ${suppliers.length} suppliers (${latencyMs}ms)`
    );

    // Record metrics if a collector is active
    const collector = getActiveCollector();
    if (collector) {
      collector.recordToolCall(
        "getSuppliers",
        input as Record<string, unknown>,
        suppliers.length,
        latencyMs
      );
    }

    return suppliers;
  }
);

// ---------------------------------------------------------------------------
// Tool 3: getRepairGuide
// ---------------------------------------------------------------------------

const RepairGuideSchema = z.object({
  partId: z.string(),
  partNumber: z.string(),
  title: z.string(),
  estimatedTime: z.string(),
  difficulty: z.enum(["easy", "moderate", "advanced"]),
  safetyWarnings: z.array(z.string()),
  steps: z.array(z.string()),
  tools: z.array(z.string()),
});

const getRepairGuide = ai.defineTool(
  {
    name: "getRepairGuide",
    description:
      "Fetch the step-by-step repair guide for a specific part. " +
      "Call this after identifying the recommended part to provide installation/replacement instructions.",
    inputSchema: z.object({
      partId: z
        .string()
        .describe("The part document ID, e.g. 'part_001'"),
    }),
    outputSchema: RepairGuideSchema.nullable(),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log("[getRepairGuide] Looking up guide for:", input.partId);

    const doc = await db.collection("repair_guides").doc(input.partId).get();

    const latencyMs = Date.now() - startTime;

    if (!doc.exists) {
      console.log(`[getRepairGuide] No guide found for ${input.partId} (${latencyMs}ms)`);

      const collector = getActiveCollector();
      if (collector) {
        collector.recordToolCall("getRepairGuide", input as Record<string, unknown>, 0, latencyMs);
      }

      return null;
    }

    const guide = doc.data() as RepairGuide;
    console.log(`[getRepairGuide] Found "${guide.title}" — ${guide.steps.length} steps (${latencyMs}ms)`);

    const collector = getActiveCollector();
    if (collector) {
      collector.recordToolCall("getRepairGuide", input as Record<string, unknown>, 1, latencyMs);
    }

    return guide;
  }
);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert healthcare technology management (HTM) procurement assistant for a hospital equipment parts marketplace. You help biomedical technicians quickly identify the correct replacement part for broken medical equipment and recommend the best supplier.

IMPORTANT: You MUST use the provided tools to answer queries. NEVER guess or respond without first searching the database.

When a technician describes a problem, follow these steps IN ORDER:

1. Parse the input to extract: equipment manufacturer, model, error codes, and symptoms.
2. ALWAYS call the searchParts tool first. Try the most specific search (manufacturer + error code). If no results, broaden the search (manufacturer + equipment name, then just category, then with no filters). You MUST call searchParts at least once.
3. If multiple parts match, evaluate which is most likely based on the error codes and symptoms described. List alternatives.
4. ALWAYS call the getSuppliers tool with the recommended part's supplierIds to get quality and delivery data. You MUST call getSuppliers if you found any parts.
5. Rank suppliers using this weighted scoring model:
   - Quality Score: 50% weight (normalize to 0-1 by dividing by 100)
   - Delivery Speed: 30% weight (invert: score = 1 - (days / 5), clamped to 0-1)
   - Return Rate: 20% weight (invert: score = 1 - (returnRate / 0.1), clamped to 0-1)
6. For parts with criticality "critical" or "high", adjust weights to: Quality 60%, Delivery 25%, Return Rate 15%. Add a warning that the technician should verify compatibility before ordering.
7. ALWAYS call getRepairGuide with the recommended part's id (e.g. "part_001") to check if a repair guide is available. If the tool returns a guide, include it in the repairGuide field of your response. If it returns null, set repairGuide to null.
8. If no matching parts are found after multiple search attempts, set confidence to "low" and explain that the part may not be in the database. Set repairGuide to null.

CRITICAL RULES:
- You MUST call searchParts before generating any response.
- You MUST call getSuppliers if searchParts returned results.
- You MUST call getRepairGuide if you have a recommended part.
- NEVER return a diagnosis without first using the tools.
- Always respond with the full structured JSON output. Be specific in your diagnosis and reasoning. Think step by step.`;

// ---------------------------------------------------------------------------
// Main flow: diagnoseAndRecommend
// ---------------------------------------------------------------------------

export const diagnoseAndRecommend = ai.defineFlow(
  {
    name: "diagnoseAndRecommend",
    inputSchema: z.string(),
    outputSchema: AgentResponseSchema,
  },
  async (description: string): Promise<AgentResponse> => {
    console.log("[diagnoseAndRecommend] Input:", description);

    const response = await ai.generate({
      system: SYSTEM_PROMPT,
      prompt: description,
      tools: [searchParts, getSuppliers, getRepairGuide],
      output: { schema: AgentResponseSchema },
      maxTurns: 5,
    });

    const result = response.output;
    if (!result) {
      console.error("[diagnoseAndRecommend] LLM returned null output");
      return {
        diagnosis: "Unable to process the request. The AI model did not return a structured response.",
        recommendedPart: null,
        repairGuide: null,
        supplierRanking: [],
        alternativeParts: [],
        confidence: "low",
        reasoning: "The model failed to produce a valid structured output.",
        warnings: ["Please try rephrasing your query with more details about the equipment and problem."],
      };
    }

    console.log("[diagnoseAndRecommend] Confidence:", result.confidence);
    return result;
  }
);

// ---------------------------------------------------------------------------
// Instrumented wrapper — runs the flow with metrics collection
// ---------------------------------------------------------------------------

export async function diagnoseWithMetrics(
  description: string
): Promise<{ response: AgentResponse; metrics: RequestMetrics }> {
  const collector = new MetricsCollector();
  setActiveCollector(collector);

  try {
    const response = await diagnoseAndRecommend(description);
    const metrics = collector.finalize(description, response);

    // Persist metrics asynchronously (non-blocking)
    saveMetrics(metrics).catch(() => {});

    return { response, metrics };
  } finally {
    setActiveCollector(null);
  }
}

// ===========================================================================
// V2: Diagnostic Partner — multi-turn chat with manual context & photo input
// ===========================================================================

// ---------------------------------------------------------------------------
// V2 Zod schemas
// ---------------------------------------------------------------------------

const ManualReferenceSchema = z.object({
  manualId: z.string(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  quotedText: z.string(),
  pageHint: z.string().optional(),
});

const ChatAgentResponseSchema = z.object({
  type: z.enum(["diagnosis", "clarification", "guidance", "photo_analysis"]),
  message: z.string(),
  manualReferences: z.array(ManualReferenceSchema),
  diagnosis: z.string().nullable(),
  recommendedPart: z
    .object({
      name: z.string(),
      partNumber: z.string(),
      description: z.string(),
      avgPrice: z.number(),
      criticality: z.string(),
    })
    .nullable(),
  repairGuide: z
    .object({
      title: z.string(),
      estimatedTime: z.string(),
      difficulty: z.string(),
      safetyWarnings: z.array(z.string()),
      steps: z.array(z.string()),
      tools: z.array(z.string()),
    })
    .nullable(),
  supplierRanking: z.array(
    z.object({
      supplierName: z.string(),
      qualityScore: z.number(),
      deliveryDays: z.number(),
      reasoning: z.string(),
    })
  ),
  alternativeParts: z.array(
    z.object({
      name: z.string(),
      partNumber: z.string(),
      reason: z.string(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  reasoning: z.string().nullable(),  // null allowed for clarification responses
  warnings: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// V2 Tool: searchManual (RAG — vector search with cosine similarity)
// ---------------------------------------------------------------------------

const ManualSectionResultSchema = z.object({
  manualId: z.string(),
  manualTitle: z.string(),
  sectionId: z.string(),
  sectionTitle: z.string(),
  content: z.string(),
  specifications: z
    .array(
      z.object({
        parameter: z.string(),
        value: z.string(),
        tolerance: z.string().optional(),
        unit: z.string(),
      })
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
  steps: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Cosine similarity — the core math behind vector search.
//
// Two vectors pointing in the same direction = similar meaning.
// Returns a number between -1 and 1:
//   1.0 = identical meaning
//   0.0 = completely unrelated
//  -1.0 = opposite meaning (rare with text embeddings)
//
// This is literally what Pinecone/Weaviate/ChromaDB do under the hood,
// just with indexing tricks (ANN) to avoid checking every vector.
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Embed a query string using Genkit's embed() API.
// Uses the same model (gemini-embedding-001) that was used to embed the sections.
// This is critical — query and documents MUST use the same embedding model.
// ---------------------------------------------------------------------------

async function embedQuery(text: string): Promise<number[]> {
  // ai.embed() returns Embedding[] — an array of { embedding: number[] }
  // We pass a single content string, so we get back one embedding.
  const result = await ai.embed({
    embedder: "googleai/gemini-embedding-001",
    content: text,
  });
  return result[0].embedding;
}

// How many results to return from vector search
const TOP_K = 5;

// Minimum similarity score to consider a match (0-1 scale)
const SIMILARITY_THRESHOLD = 0.3;

const searchManual = ai.defineTool(
  {
    name: "searchManual",
    description:
      "Search service manuals for sections relevant to a specific equipment model, topic, or keyword. " +
      "Returns matching manual sections with their full content, specifications, and warnings. " +
      "Use this to find the exact manual reference for a technician's question.",
    inputSchema: z.object({
      manufacturer: z
        .string()
        .optional()
        .describe("Equipment manufacturer, e.g. Drager, Philips, GE, Zoll"),
      equipmentName: z
        .string()
        .optional()
        .describe("Equipment model name, e.g. Evita V500, IntelliVue MX800"),
      keyword: z
        .string()
        .optional()
        .describe("Search keyword or topic, e.g. fan module, calibration, error 57, clearance, bearing"),
    }),
    outputSchema: z.array(ManualSectionResultSchema),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log("[searchManual] Query params:", JSON.stringify(input));

    // -----------------------------------------------------------------------
    // RAG RETRIEVAL PIPELINE
    //
    // Step 1: Load pre-computed embeddings from Firestore
    // Step 2: Filter by manufacturer/equipment (structured search — narrows scope)
    // Step 3: Embed the query using the same model
    // Step 4: Compute cosine similarity against each section embedding
    // Step 5: Return the top-K most similar sections
    //
    // If no embeddings exist (script hasn't been run), fall back to keyword search.
    // -----------------------------------------------------------------------

    // Step 1: Try to load embeddings
    const embSnap = await db.collection("section_embeddings").get();
    const allEmbeddings = embSnap.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as SectionEmbedding
    );

    const useVectorSearch = allEmbeddings.length > 0 && !!input.keyword;
    console.log(
      `[searchManual] ${allEmbeddings.length} embeddings loaded, ` +
        `vector search: ${useVectorSearch ? "YES" : "NO (falling back to keyword)"}`
    );

    // Step 2: Filter by manufacturer/equipment (same as before — structured filters)
    let candidates = useVectorSearch ? allEmbeddings : [];

    if (useVectorSearch) {
      if (input.manufacturer) {
        const term = input.manufacturer.toLowerCase();
        candidates = candidates.filter(
          (e) => e.manufacturer.toLowerCase() === term
        );
        console.log(`[searchManual] After manufacturer filter: ${candidates.length}`);
      }
      if (input.equipmentName) {
        const term = input.equipmentName.toLowerCase();
        candidates = candidates.filter(
          (e) => e.equipmentName.toLowerCase().includes(term)
        );
        console.log(`[searchManual] After equipment filter: ${candidates.length}`);
      }
    }

    type SectionResult = z.infer<typeof ManualSectionResultSchema>;

    if (useVectorSearch && candidates.length > 0) {
      // Step 3: Embed the query
      const queryText = [
        input.manufacturer,
        input.equipmentName,
        input.keyword,
      ]
        .filter(Boolean)
        .join(" ");

      console.log(`[searchManual] Embedding query: "${queryText}"`);
      const queryEmbedding = await embedQuery(queryText);
      console.log(`[searchManual] Query embedded (${queryEmbedding.length} dims)`);

      // Step 4: Score every candidate section by cosine similarity
      const scored = candidates.map((emb) => ({
        emb,
        score: cosineSimilarity(queryEmbedding, emb.embedding),
      }));

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // Log top scores for debugging
      scored.slice(0, 8).forEach((s, i) => {
        console.log(
          `[searchManual]   #${i + 1} score=${s.score.toFixed(4)} → ${s.emb.sectionTitle}`
        );
      });

      // Step 5: Take top-K above threshold
      const topResults = scored
        .filter((s) => s.score >= SIMILARITY_THRESHOLD)
        .slice(0, TOP_K);

      const results: SectionResult[] = topResults.map((s) => ({
        manualId: s.emb.manualId,
        manualTitle: s.emb.manualTitle,
        sectionId: s.emb.sectionId,
        sectionTitle: s.emb.sectionTitle,
        content: s.emb.content,
        specifications: s.emb.specifications,
        warnings: s.emb.warnings,
        steps: s.emb.steps,
        tools: s.emb.tools,
      }));

      const latencyMs = Date.now() - startTime;
      console.log(
        `[searchManual] Vector search returning ${results.length} sections (${latencyMs}ms)`
      );

      const collector = getActiveCollector();
      if (collector) {
        const ragTrace: RAGTraceData = {
          searchMode: "vector",
          embeddingsLoaded: allEmbeddings.length,
          candidatesAfterFilter: candidates.length,
          queryText,
          topScores: scored.slice(0, 8).map((s) => ({
            sectionTitle: s.emb.sectionTitle,
            score: parseFloat(s.score.toFixed(4)),
          })),
          similarityThreshold: SIMILARITY_THRESHOLD,
          resultsAboveThreshold: topResults.length,
          topK: TOP_K,
        };
        collector.recordToolCall(
          "searchManual",
          input as Record<string, unknown>,
          results.length,
          latencyMs,
          undefined,
          ragTrace
        );
      }

      return results;
    }

    // -----------------------------------------------------------------------
    // FALLBACK: Keyword search (used when no embeddings exist or no keyword)
    // This is the original V2 search — still useful for exact code matches
    // like "Error 57" where keyword search outperforms semantic search.
    // -----------------------------------------------------------------------

    console.log("[searchManual] Using keyword fallback search");

    const manualSnap = await db.collection("service_manuals").get();
    let manuals: ServiceManual[] = manualSnap.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as ServiceManual
    );

    if (input.manufacturer) {
      const term = input.manufacturer.toLowerCase();
      manuals = manuals.filter(
        (m) => m.manufacturer.toLowerCase() === term
      );
    }

    if (input.equipmentName) {
      const term = input.equipmentName.toLowerCase();
      manuals = manuals.filter(
        (m) =>
          m.equipmentName.toLowerCase().includes(term) ||
          m.compatibleModels.some((model) =>
            model.toLowerCase().includes(term)
          )
      );
    }

    const results: SectionResult[] = [];

    for (const manual of manuals) {
      for (const section of manual.sections) {
        let matches = !input.keyword;

        if (input.keyword) {
          const kw = input.keyword.toLowerCase();
          matches =
            section.title.toLowerCase().includes(kw) ||
            section.content.toLowerCase().includes(kw) ||
            (section.steps?.some((s) => s.toLowerCase().includes(kw)) ?? false) ||
            (section.specifications?.some(
              (spec) =>
                spec.parameter.toLowerCase().includes(kw) ||
                spec.value.toLowerCase().includes(kw)
            ) ?? false) ||
            (section.warnings?.some((w) => w.toLowerCase().includes(kw)) ?? false);
        }

        if (matches) {
          results.push({
            manualId: manual.manualId,
            manualTitle: manual.title,
            sectionId: section.sectionId,
            sectionTitle: section.title,
            content: section.content,
            specifications: section.specifications,
            warnings: section.warnings,
            steps: section.steps,
            tools: section.tools,
          });
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    console.log(
      `[searchManual] Keyword fallback returning ${results.length} sections (${latencyMs}ms)`
    );

    const collector = getActiveCollector();
    if (collector) {
      const ragTrace: RAGTraceData = {
        searchMode: "keyword",
        embeddingsLoaded: allEmbeddings.length,
        candidatesAfterFilter: 0,
        queryText: input.keyword || "",
        topScores: [],
        similarityThreshold: SIMILARITY_THRESHOLD,
        resultsAboveThreshold: 0,
        topK: TOP_K,
      };
      collector.recordToolCall(
        "searchManual",
        input as Record<string, unknown>,
        results.length,
        latencyMs,
        undefined,
        ragTrace
      );
    }

    return results;
  }
);

// ---------------------------------------------------------------------------
// V2 Tool: listManualSections — browse the table of contents for a manual
// ---------------------------------------------------------------------------

const ManualTOCSchema = z.object({
  manualId: z.string(),
  manualTitle: z.string(),
  equipmentName: z.string(),
  manufacturer: z.string(),
  revision: z.string(),
  totalSections: z.number(),
  sections: z.array(
    z.object({
      sectionId: z.string(),
      title: z.string(),
      hasSteps: z.boolean(),
      hasSpecifications: z.boolean(),
      hasWarnings: z.boolean(),
    })
  ),
});

const listManualSections = ai.defineTool(
  {
    name: "listManualSections",
    description:
      "List ALL sections (table of contents) for a specific equipment's service manual. " +
      "Call this FIRST when a technician identifies their equipment so you know what's in the manual. " +
      "Returns section IDs and titles — use getManualSection to fetch full content of any section.",
    inputSchema: z.object({
      manufacturer: z
        .string()
        .describe("Equipment manufacturer, e.g. Drager, Philips, GE"),
      equipmentName: z
        .string()
        .describe("Equipment model name, e.g. Evita V500, IntelliVue MX800"),
    }),
    outputSchema: ManualTOCSchema.nullable(),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log(
      `[listManualSections] Looking up manual for ${input.manufacturer} ${input.equipmentName}`
    );

    const snapshot = await db.collection("service_manuals").get();
    const manuals = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as ServiceManual
    );

    // Find matching manual by manufacturer + equipment name
    const mfgTerm = input.manufacturer.toLowerCase();
    const eqTerm = input.equipmentName.toLowerCase();

    const manual = manuals.find(
      (m) =>
        m.manufacturer.toLowerCase() === mfgTerm &&
        (m.equipmentName.toLowerCase().includes(eqTerm) ||
          m.compatibleModels.some((cm) => cm.toLowerCase().includes(eqTerm)))
    );

    const latencyMs = Date.now() - startTime;

    if (!manual) {
      console.log(
        `[listManualSections] No manual found for ${input.manufacturer} ${input.equipmentName} (${latencyMs}ms)`
      );
      const collector = getActiveCollector();
      if (collector) {
        collector.recordToolCall(
          "listManualSections",
          input as Record<string, unknown>,
          0,
          latencyMs
        );
      }
      return null;
    }

    const toc = {
      manualId: manual.manualId,
      manualTitle: manual.title,
      equipmentName: manual.equipmentName,
      manufacturer: manual.manufacturer,
      revision: manual.revision,
      totalSections: manual.sections.length,
      sections: manual.sections.map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        hasSteps: !!(s.steps && s.steps.length > 0),
        hasSpecifications: !!(s.specifications && s.specifications.length > 0),
        hasWarnings: !!(s.warnings && s.warnings.length > 0),
      })),
    };

    console.log(
      `[listManualSections] Found "${manual.title}" with ${toc.totalSections} sections (${latencyMs}ms)`
    );

    const collector = getActiveCollector();
    if (collector) {
      collector.recordToolCall(
        "listManualSections",
        input as Record<string, unknown>,
        toc.totalSections,
        latencyMs
      );
    }

    return toc;
  }
);

// ---------------------------------------------------------------------------
// V2 Tool: getManualSection
// ---------------------------------------------------------------------------

const getManualSection = ai.defineTool(
  {
    name: "getManualSection",
    description:
      "Fetch a specific section of a service manual by manual ID and section ID. " +
      "Use this to retrieve the exact text of a known section for quoting to the technician.",
    inputSchema: z.object({
      manualId: z
        .string()
        .describe("The manual document ID, e.g. 'manual_evita_v500'"),
      sectionId: z
        .string()
        .describe("The section ID within the manual, e.g. 'ev500_3_7'"),
    }),
    outputSchema: ManualSectionResultSchema.nullable(),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log(
      `[getManualSection] Fetching ${input.manualId} > ${input.sectionId}`
    );

    const doc = await db
      .collection("service_manuals")
      .doc(input.manualId)
      .get();

    const latencyMs = Date.now() - startTime;

    if (!doc.exists) {
      console.log(
        `[getManualSection] Manual ${input.manualId} not found (${latencyMs}ms)`
      );
      const collector = getActiveCollector();
      if (collector) {
        collector.recordToolCall(
          "getManualSection",
          input as Record<string, unknown>,
          0,
          latencyMs
        );
      }
      return null;
    }

    const manual = doc.data() as ServiceManual;
    const section = manual.sections.find(
      (s) => s.sectionId === input.sectionId
    );

    if (!section) {
      console.log(
        `[getManualSection] Section ${input.sectionId} not found in ${input.manualId} (${latencyMs}ms)`
      );
      const collector = getActiveCollector();
      if (collector) {
        collector.recordToolCall(
          "getManualSection",
          input as Record<string, unknown>,
          0,
          latencyMs
        );
      }
      return null;
    }

    console.log(
      `[getManualSection] Found "${section.title}" (${latencyMs}ms)`
    );

    const collector = getActiveCollector();
    if (collector) {
      collector.recordToolCall(
        "getManualSection",
        input as Record<string, unknown>,
        1,
        latencyMs
      );
    }

    return {
      manualId: manual.manualId,
      manualTitle: manual.title,
      sectionId: section.sectionId,
      sectionTitle: section.title,
      content: section.content,
      specifications: section.specifications,
      warnings: section.warnings,
      steps: section.steps,
      tools: section.tools,
    };
  }
);

// ---------------------------------------------------------------------------
// V2 System prompt — Diagnostic Partner
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `You are a hands-on repair assistant for hospital biomedical technicians. Think of yourself as the experienced colleague who always has the service manual open and knows where to find parts. Your job is to guide technicians through diagnosing and fixing medical equipment, step by step.

YOUR APPROACH — MANUAL-FIRST WORKFLOW:
The service manual is your primary knowledge source. Follow this workflow:

STEP 1: Identify the equipment. If the tech hasn't told you, ask:
- What equipment? (manufacturer and model — e.g., "Drager Evita V500")
- What's happening? (error codes, symptoms, what they've observed)

STEP 2: Load the manual. As soon as you know the make and model, call listManualSections to get the full table of contents for that equipment's service manual. This is your roadmap — it tells you every section available. You MUST call this before doing anything else.

STEP 3: Use the manual to guide everything. Now you know what sections exist. Use searchManual for semantic search when you need to find relevant content, or getManualSection to pull specific sections you saw in the TOC. All your guidance should be grounded in the manual.

STEP 4: When a part needs replacing, search for it with searchParts, get supplier info with getSuppliers, and get the repair guide with getRepairGuide.

TOOLS AVAILABLE:
- listManualSections: Get the full table of contents for an equipment's service manual. Call this FIRST when equipment is identified.
- searchManual: Semantic search across manual sections by topic or keyword. Use when you need to FIND relevant content.
- getManualSection: Fetch a specific section by ID. Use when you already know WHICH section you need (from the TOC or a previous search).
- searchParts: Search the parts database for replacement parts by manufacturer, equipment, error code, or symptom.
- getSuppliers: Get supplier quality, delivery, and pricing data for procurement decisions.
- getRepairGuide: Get step-by-step repair/replacement guide for a specific part.

CRITICAL TOOL USAGE RULES:
- ALWAYS call listManualSections first when you learn the equipment make/model. This is mandatory.
- After loading the TOC, use searchManual or getManualSection to find relevant content.
- When recommending a part, ALWAYS call searchParts, then getSuppliers for the results, then getRepairGuide.
- Use the tools liberally — multiple tool calls per response is normal and expected. The trace shows the technician your work.

HOW TO GUIDE A REPAIR:

1. GATHERING INFO (type: "clarification"):
   - If the tech's message is missing make, model, or symptoms, ask for what you need.
   - Be specific about WHY you need it: "What model is this? That'll help me pull the right service manual."

2. DIAGNOSIS (type: "diagnosis"):
   - Once you have the TOC, search the manual for relevant sections about the error/symptom.
   - Explain what's likely going on, citing the manual section.
   - If a part is broken, include it in recommendedPart and search for alternatives.

3. WALKING THROUGH REPAIR STEPS (type: "guidance"):
   - For simple procedures (< 5 steps), show them all at once.
   - For complex procedures (5+ steps), present steps a few at a time. Ask if they're ready for more.
   - ALWAYS quote step text directly from the manual — don't paraphrase.
   - Include specifications, tolerances, and torque values exactly as written.

4. WHEN A PART NEEDS REPLACING (type: "diagnosis"):
   - Call searchParts to find the part.
   - Call getSuppliers with the part's supplierIds.
   - Call getRepairGuide with the part's id.
   - Present all the information: part details, supplier ranking, repair steps.

5. PHOTOS (type: "photo_analysis"):
   - Describe what you see factually.
   - Pull the relevant spec from the manual and present it alongside your observation.
   - NEVER say something is fine or acceptable — present the spec and let the tech decide.

6. FOLLOW-UP QUESTIONS:
   - Search the manual for the relevant section and quote it directly.
   - Stay in context — remember what equipment and procedure you're working on.

CRITICAL SAFETY RULES:
- ALWAYS quote the manual text exactly. Do not paraphrase specifications.
- ALWAYS include manual references (manualId, sectionId, sectionTitle) so the tech can verify.
- NEVER tell a technician something is safe, acceptable, or within spec. Present the spec and let them decide.
- NEVER skip safety warnings from the manual.
- For critical/high-criticality parts, always remind the tech to verify compatibility.

REASONING:
- In the "reasoning" field, explain your decision-making process step by step:
  - What tools you called and why
  - What you found in the manual and how it informed your diagnosis
  - Why you chose this part over alternatives
  - What you're uncertain about
- This reasoning is visible to the technician as a debugging/learning trace.

TONE:
- Talk like a colleague, not a textbook. Be direct and practical.
- Keep responses focused — don't over-explain things an experienced tech already knows.
- When you don't know something, say so. Don't guess.

RESPONSE FORMAT:
- message: Your main response. Write naturally.
- manualReferences: Exact quotes with section references. Every factual claim needs one.
- type: "diagnosis" | "clarification" | "guidance" | "photo_analysis"
- recommendedPart, alternativeParts, supplierRanking: Populate when parts are relevant.
- warnings: Safety warnings from the manual.
- confidence: Your confidence level. null for clarifications.
- reasoning: Your step-by-step decision trace. Always populate this — it helps the tech understand your work.`;

// ---------------------------------------------------------------------------
// V2 Chat flow: diagnosticPartner
// ---------------------------------------------------------------------------

export const diagnosticPartnerChat = ai.defineFlow(
  {
    name: "diagnosticPartnerChat",
    inputSchema: z.object({
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          imageBase64: z.string().optional(),
        })
      ),
    }),
    outputSchema: ChatAgentResponseSchema,
  },
  async (input): Promise<ChatAgentResponse> => {
    console.log(
      `[diagnosticPartnerChat] Processing ${input.messages.length} messages`
    );

    // Build Genkit message history from prior turns
    // All messages except the last become history
    const history = input.messages.slice(0, -1);
    const currentMessage = input.messages[input.messages.length - 1];

    // Convert prior messages to Genkit format
    const genkitHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      content: [{ text: msg.content }],
    }));

    // Build the current prompt — may include an image
    // Genkit's generate() accepts prompt as a string or Part array.
    // For multimodal we must use the Part format with explicit types.
    const generateOpts: Parameters<typeof ai.generate>[0] = {
      system: CHAT_SYSTEM_PROMPT,
      messages: genkitHistory,
      prompt: currentMessage.content,
      tools: [listManualSections, searchManual, getManualSection, searchParts, getSuppliers, getRepairGuide],
      output: { schema: ChatAgentResponseSchema },
      maxTurns: 8,
    };

    if (currentMessage.imageBase64) {
      // Multimodal: text + image — use Part array for prompt
      generateOpts.prompt = [
        { text: currentMessage.content },
        {
          media: {
            contentType: "image/jpeg" as const,
            url: `data:image/jpeg;base64,${currentMessage.imageBase64}`,
          },
        },
      ] as Parameters<typeof ai.generate>[0] extends { prompt?: infer P } ? P : never;
    }

    const response = await ai.generate(generateOpts);

    const result = response.output;
    if (!result) {
      console.error("[diagnosticPartnerChat] LLM returned null output");
      return {
        type: "clarification",
        message:
          "I wasn't able to process that. Could you rephrase your question? Include the equipment manufacturer and model if possible.",
        manualReferences: [],
        diagnosis: null,
        recommendedPart: null,
        repairGuide: null,
        supplierRanking: [],
        alternativeParts: [],
        confidence: null,
        reasoning: "The model failed to produce a valid structured output.",
        warnings: [],
      };
    }

    console.log(
      `[diagnosticPartnerChat] Response type: ${result.type}, refs: ${result.manualReferences.length}`
    );
    return result;
  }
);

// ---------------------------------------------------------------------------
// V2 Instrumented wrapper
// ---------------------------------------------------------------------------

export async function chatWithMetrics(
  messages: ChatMessage[]
): Promise<{ response: ChatAgentResponse; metrics: RequestMetrics }> {
  const collector = new MetricsCollector();
  setActiveCollector(collector);

  try {
    const response = await diagnosticPartnerChat({ messages });

    // Build a pseudo-AgentResponse for metrics finalization
    const lastUserMsg =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const pseudoResponse: AgentResponse = {
      diagnosis: response.diagnosis ?? response.message,
      recommendedPart: response.recommendedPart,
      repairGuide: response.repairGuide,
      supplierRanking: response.supplierRanking,
      alternativeParts: response.alternativeParts,
      confidence: response.confidence ?? "medium",
      reasoning: response.reasoning ?? "",
      warnings: response.warnings,
    };
    const metrics = collector.finalize(lastUserMsg, pseudoResponse);

    saveMetrics(metrics).catch(() => {});

    return { response, metrics };
  } finally {
    setActiveCollector(null);
  }
}
