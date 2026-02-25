import { z } from "genkit";
import { getFirestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { trace } from "@opentelemetry/api";
import { ai } from "./ai";
import { getActiveCollector, type FilterStep, type RAGTraceData } from "./metrics";
import { cosineSimilarity } from "./utils";
import type { Part, Supplier, RepairGuide, ServiceManual, SectionEmbedding, EquipmentAsset, WorkOrder } from "./types";

// Re-export for external consumers
export { cosineSimilarity, filterParts } from "./utils";

// ---------------------------------------------------------------------------
// Schemas
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

export const ManualSectionResultSchema = z.object({
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

// ---------------------------------------------------------------------------
// Vector search helpers
// ---------------------------------------------------------------------------

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;

async function embedQuery(text: string): Promise<number[]> {
  const result = await ai.embed({
    embedder: "vertexai/text-embedding-004",
    content: text,
  });
  return result[0].embedding;
}

// ---------------------------------------------------------------------------
// searchParts
// ---------------------------------------------------------------------------

export const searchParts = ai.defineTool(
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

    // Sanitize LLM outputs — models sometimes return the string "null" instead of omitting the field
    const clean = (v: string | undefined): string | undefined =>
      v && v !== "null" && v !== "none" && v !== "N/A" ? v : undefined;

    const manufacturer = clean(input.manufacturer);
    const equipmentName = clean(input.equipmentName);
    const errorCode = clean(input.errorCode);
    const symptom = clean(input.symptom);
    const category = clean(input.category);

    // Push exact-match filters to Firestore where possible
    let query: FirebaseFirestore.Query = db.collection("parts");
    if (category) {
      query = query.where("category", "==", category.toLowerCase());
    }
    if (manufacturer) {
      query = query.where("manufacturer", "==", manufacturer);
    }

    const snapshot = await query.get();
    let results: Part[] = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as Part
    );

    const filterSteps: FilterStep[] = [];

    // Server-side filters already applied — record them for tracing
    if (category) {
      filterSteps.push({ filter: "category", value: category, remaining: results.length });
    }
    if (manufacturer) {
      filterSteps.push({ filter: "manufacturer", value: manufacturer, remaining: results.length });
    }

    if (equipmentName) {
      const searchTerm = equipmentName.toLowerCase();
      results = results.filter((part) =>
        part.compatibleEquipment.some((eq) => eq.toLowerCase().includes(searchTerm))
      );
      filterSteps.push({ filter: "equipmentName", value: equipmentName, remaining: results.length });
    }

    if (errorCode) {
      const searchTerm = errorCode.toLowerCase();
      results = results.filter((part) =>
        part.relatedErrorCodes.some((code) => code.toLowerCase().includes(searchTerm))
      );
      filterSteps.push({ filter: "errorCode", value: errorCode, remaining: results.length });
    }

    if (symptom) {
      const words = symptom.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const filtered = results.filter(
        (part) => {
          const haystack = (part.description + " " + part.name).toLowerCase();
          return words.some((w) => haystack.includes(w));
        }
      );
      // Only apply symptom filter if it doesn't eliminate all previous matches
      if (filtered.length > 0) {
        results = filtered;
      }
      filterSteps.push({ filter: "symptom", value: symptom, remaining: results.length });
    }

    const latencyMs = Date.now() - startTime;
    trace.getActiveSpan()?.setAttributes({
      "tool.resultCount": results.length,
      "tool.filterCount": filterSteps.length,
      "tool.latencyMs": latencyMs,
    });
    console.log(`[searchParts] ${results.length} results (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("searchParts", input as Record<string, unknown>, results.length, latencyMs, filterSteps);
    return results;
  }
);

// ---------------------------------------------------------------------------
// getSuppliers
// ---------------------------------------------------------------------------

export const getSuppliers = ai.defineTool(
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
    const refs = input.supplierIds.map((id) => db.collection("suppliers").doc(id));
    const docs = refs.length > 0 ? await db.getAll(...refs) : [];
    const suppliers: Supplier[] = docs
      .filter((doc) => doc.exists)
      .map((doc) => doc.data() as Supplier);
    const latencyMs = Date.now() - startTime;
    trace.getActiveSpan()?.setAttributes({
      "tool.resultCount": suppliers.length,
      "tool.latencyMs": latencyMs,
    });
    console.log(`[getSuppliers] ${suppliers.length} results (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("getSuppliers", input as Record<string, unknown>, suppliers.length, latencyMs);
    return suppliers;
  }
);

// ---------------------------------------------------------------------------
// getRepairGuide
// ---------------------------------------------------------------------------

export const getRepairGuide = ai.defineTool(
  {
    name: "getRepairGuide",
    description:
      "Fetch the step-by-step repair guide for a specific part. " +
      "Call this after identifying the recommended part to provide installation/replacement instructions.",
    inputSchema: z.object({
      partId: z.string().describe("The part document ID, e.g. 'part_001'"),
    }),
    outputSchema: z.union([RepairGuideSchema, z.object({ notFound: z.literal(true), message: z.string() })]),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log("[getRepairGuide] Looking up guide for:", input.partId);

    const doc = await db.collection("repair_guides").doc(input.partId).get();
    const latencyMs = Date.now() - startTime;

    if (!doc.exists) {
      getActiveCollector()?.recordToolCall("getRepairGuide", input as Record<string, unknown>, 0, latencyMs);
      return { notFound: true as const, message: `No repair guide found for part ${input.partId}` };
    }

    const guide = doc.data() as RepairGuide;
    trace.getActiveSpan()?.setAttributes({
      "tool.resultCount": 1,
      "tool.latencyMs": latencyMs,
      "tool.guideTitle": guide.title,
    });
    console.log(`[getRepairGuide] "${guide.title}" (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("getRepairGuide", input as Record<string, unknown>, 1, latencyMs);
    return guide;
  }
);

// ---------------------------------------------------------------------------
// searchManual
// ---------------------------------------------------------------------------

export const searchManual = ai.defineTool(
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

    // Push manufacturer filter to Firestore to avoid loading all embeddings
    let embQuery: FirebaseFirestore.Query = db.collection("section_embeddings");
    if (input.manufacturer) {
      embQuery = embQuery.where("manufacturer", "==", input.manufacturer);
    }

    const embSnap = await embQuery.get();
    const allEmbeddings = embSnap.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as SectionEmbedding
    );

    const useVectorSearch = allEmbeddings.length > 0 && !!input.keyword;
    let candidates = useVectorSearch ? allEmbeddings : [];

    if (useVectorSearch) {
      // manufacturer already filtered server-side; only equipmentName needs client-side (substring match)
      if (input.equipmentName) {
        const term = input.equipmentName.toLowerCase();
        candidates = candidates.filter((e) => e.equipmentName.toLowerCase().includes(term));
      }
    }

    type SectionResult = z.infer<typeof ManualSectionResultSchema>;

    if (useVectorSearch && candidates.length > 0) {
      const queryText = [input.manufacturer, input.equipmentName, input.keyword]
        .filter(Boolean)
        .join(" ");

      const queryEmbedding = await embedQuery(queryText);

      const scored = candidates.map((emb) => ({
        emb,
        score: cosineSimilarity(queryEmbedding, emb.embedding),
      }));

      scored.sort((a, b) => b.score - a.score);

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
      trace.getActiveSpan()?.setAttributes({
        "tool.searchMode": "vector",
        "tool.resultCount": results.length,
        "tool.embeddingsLoaded": allEmbeddings.length,
        "tool.candidatesAfterFilter": candidates.length,
        "tool.latencyMs": latencyMs,
      });
      console.log(`[searchManual] vector ${results.length} results (${latencyMs}ms)`);

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
      getActiveCollector()?.recordToolCall("searchManual", input as Record<string, unknown>, results.length, latencyMs, undefined, ragTrace);
      return results;
    }

    console.log("[searchManual] Using keyword fallback search");

    // Push manufacturer filter to Firestore to avoid loading all manuals
    let manualQuery: FirebaseFirestore.Query = db.collection("service_manuals");
    if (input.manufacturer) {
      manualQuery = manualQuery.where("manufacturer", "==", input.manufacturer);
    }

    const manualSnap = await manualQuery.get();
    let manuals: ServiceManual[] = manualSnap.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as ServiceManual
    );

    if (input.equipmentName) {
      const term = input.equipmentName.toLowerCase();
      manuals = manuals.filter(
        (m) =>
          m.equipmentName.toLowerCase().includes(term) ||
          m.compatibleModels.some((model) => model.toLowerCase().includes(term))
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
    trace.getActiveSpan()?.setAttributes({
      "tool.searchMode": "keyword",
      "tool.resultCount": results.length,
      "tool.latencyMs": latencyMs,
    });
    console.log(`[searchManual] keyword ${results.length} results (${latencyMs}ms)`);

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
    getActiveCollector()?.recordToolCall("searchManual", input as Record<string, unknown>, results.length, latencyMs, undefined, ragTrace);
    return results;
  }
);

// ---------------------------------------------------------------------------
// listManualSections
// ---------------------------------------------------------------------------

export const listManualSections = ai.defineTool(
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
    outputSchema: z.union([ManualTOCSchema, z.object({ notFound: z.literal(true), message: z.string() })]),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();

    // Push manufacturer filter to Firestore to avoid loading all manuals
    const snapshot = await db.collection("service_manuals")
      .where("manufacturer", "==", input.manufacturer)
      .get();
    const manuals = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as ServiceManual
    );

    // equipmentName needs client-side filter (substring/compatible model matching)
    const eqTerm = input.equipmentName.toLowerCase();

    const manual = manuals.find(
      (m) =>
        m.equipmentName.toLowerCase().includes(eqTerm) ||
        m.compatibleModels.some((cm) => cm.toLowerCase().includes(eqTerm))
    );

    const latencyMs = Date.now() - startTime;

    if (!manual) {
      getActiveCollector()?.recordToolCall("listManualSections", input as Record<string, unknown>, 0, latencyMs);
      return { notFound: true as const, message: `No service manual found for ${input.manufacturer} ${input.equipmentName}` };
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

    console.log(`[listManualSections] "${manual.title}" ${toc.totalSections} sections (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("listManualSections", input as Record<string, unknown>, toc.totalSections, latencyMs);
    return toc;
  }
);

// ---------------------------------------------------------------------------
// getManualSection
// ---------------------------------------------------------------------------

export const getManualSection = ai.defineTool(
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
    outputSchema: z.union([ManualSectionResultSchema, z.object({ notFound: z.literal(true), message: z.string() })]),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    console.log(`[getManualSection] Fetching ${input.manualId} > ${input.sectionId}`);

    const doc = await db.collection("service_manuals").doc(input.manualId).get();
    const latencyMs = Date.now() - startTime;

    if (!doc.exists) {
      getActiveCollector()?.recordToolCall("getManualSection", input as Record<string, unknown>, 0, latencyMs);
      return { notFound: true as const, message: `Manual ${input.manualId} not found` };
    }

    const manual = doc.data() as ServiceManual;
    const section = manual.sections.find((s) => s.sectionId === input.sectionId);

    if (!section) {
      getActiveCollector()?.recordToolCall("getManualSection", input as Record<string, unknown>, 0, latencyMs);
      return { notFound: true as const, message: `Section ${input.sectionId} not found in manual ${input.manualId}` };
    }

    console.log(`[getManualSection] "${section.title}" (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("getManualSection", input as Record<string, unknown>, 1, latencyMs);

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
// lookupAsset
// ---------------------------------------------------------------------------

const AssetSchema = z.object({
  assetId: z.string(),
  assetTag: z.string(),
  equipmentName: z.string(),
  manufacturer: z.string(),
  serialNumber: z.string(),
  department: z.string(),
  location: z.string(),
  installDate: z.string(),
  warrantyExpiry: z.string(),
  hoursLogged: z.number(),
  status: z.enum(["active", "down", "maintenance", "retired"]),
  lastPmDate: z.string(),
  nextPmDue: z.string(),
});

export const lookupAsset = ai.defineTool(
  {
    name: "lookupAsset",
    description:
      "Look up a hospital equipment asset by asset tag, serial number, or equipment name + department. " +
      "Returns the asset record including location, operating hours, warranty status, and maintenance schedule. " +
      "Call this when the technician identifies a specific unit (e.g. 'unit 4302 in ICU' or 'serial SN-V500-2847').",
    inputSchema: z.object({
      assetTag: z
        .string()
        .optional()
        .describe("Physical asset tag on the unit, e.g. 'ASSET-4302'"),
      serialNumber: z
        .string()
        .optional()
        .describe("Equipment serial number, e.g. 'SN-V500-2847'"),
      equipmentName: z
        .string()
        .optional()
        .describe("Equipment model name, e.g. 'Evita V500'"),
      department: z
        .string()
        .optional()
        .describe("Hospital department, e.g. 'ICU-3', 'OR-7'"),
    }),
    outputSchema: z.array(AssetSchema),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();

    // Push exact-match filters to Firestore where possible
    let assetQuery: FirebaseFirestore.Query = db.collection("equipment_assets");
    if (input.assetTag) {
      assetQuery = assetQuery.where("assetTag", "==", input.assetTag);
    }
    if (input.department) {
      assetQuery = assetQuery.where("department", "==", input.department);
    }

    const snapshot = await assetQuery.get();
    let results: EquipmentAsset[] = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as EquipmentAsset
    );

    // Remaining filters need client-side matching (substring/case-insensitive)
    if (input.serialNumber) {
      const term = input.serialNumber.toUpperCase();
      results = results.filter((a) => a.serialNumber.toUpperCase().includes(term));
    }
    if (input.equipmentName) {
      const term = input.equipmentName.toLowerCase();
      results = results.filter((a) => a.equipmentName.toLowerCase().includes(term));
    }

    const latencyMs = Date.now() - startTime;
    console.log(`[lookupAsset] ${results.length} results (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("lookupAsset", input as Record<string, unknown>, results.length, latencyMs);
    return results;
  }
);

// ---------------------------------------------------------------------------
// getRepairHistory
// ---------------------------------------------------------------------------

const WorkOrderSummarySchema = z.object({
  workOrderId: z.string(),
  assetId: z.string(),
  equipmentName: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  diagnosis: z.string(),
  rootCause: z.string().nullable(),
  partsUsed: z.array(
    z.object({
      partNumber: z.string(),
      partName: z.string(),
      quantity: z.number(),
    })
  ),
  laborHours: z.number(),
  totalCost: z.number(),
});

export const getRepairHistory = ai.defineTool(
  {
    name: "getRepairHistory",
    description:
      "Fetch past work orders and repair history for a specific equipment asset or equipment model. " +
      "Use this to identify recurring failures, past diagnoses, and what parts were previously used. " +
      "Helps technicians understand if this is a known issue and what worked before.",
    inputSchema: z.object({
      assetId: z
        .string()
        .optional()
        .describe("Equipment asset ID, e.g. 'ASSET-4302'"),
      equipmentName: z
        .string()
        .optional()
        .describe("Equipment model name to find history across all units"),
      manufacturer: z
        .string()
        .optional()
        .describe("Equipment manufacturer"),
    }),
    outputSchema: z.array(WorkOrderSummarySchema),
  },
  async (input) => {
    const startTime = Date.now();
    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection("work_orders");

    if (input.assetId) {
      query = query.where("assetId", "==", input.assetId);
    }

    const snapshot = await query.get();
    let results: WorkOrder[] = snapshot.docs.map(
      (doc: QueryDocumentSnapshot) => doc.data() as WorkOrder
    );

    // Substring filters must stay client-side
    if (input.equipmentName) {
      const term = input.equipmentName.toLowerCase();
      results = results.filter((wo) => wo.equipmentName.toLowerCase().includes(term));
    }
    if (input.manufacturer) {
      const term = input.manufacturer.toLowerCase();
      results = results.filter((wo) => wo.manufacturer.toLowerCase().includes(term));
    }

    // Sort client-side to avoid requiring a composite Firestore index
    results.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    results = results.slice(0, 10);

    const latencyMs = Date.now() - startTime;
    console.log(`[getRepairHistory] ${results.length} work orders (${latencyMs}ms)`);
    getActiveCollector()?.recordToolCall("getRepairHistory", input as Record<string, unknown>, results.length, latencyMs);
    return results;
  }
);

