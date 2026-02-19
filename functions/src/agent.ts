import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { getFirestore } from "firebase-admin/firestore";
import type { Part, Supplier, AgentResponse } from "./types";

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
// Tool 1: searchParts
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
    const db = getFirestore();
    console.log("[searchParts] Query params:", JSON.stringify(input));

    let query: FirebaseFirestore.Query = db.collection("parts");

    // Apply Firestore where() filters for manufacturer and category
    if (input.manufacturer) {
      query = query.where("manufacturer", "==", input.manufacturer);
    }
    if (input.category) {
      query = query.where("category", "==", input.category);
    }

    const snapshot = await query.get();
    let results: Part[] = snapshot.docs.map(
      (doc) => doc.data() as Part
    );

    console.log(
      `[searchParts] Firestore returned ${results.length} docs after where() filters`
    );

    // In-memory filters for array/text fields
    if (input.equipmentName) {
      const searchTerm = input.equipmentName.toLowerCase();
      results = results.filter((part) =>
        part.compatibleEquipment.some((eq) =>
          eq.toLowerCase().includes(searchTerm)
        )
      );
    }

    if (input.errorCode) {
      const searchTerm = input.errorCode.toLowerCase();
      results = results.filter((part) =>
        part.relatedErrorCodes.some((code) =>
          code.toLowerCase().includes(searchTerm)
        )
      );
    }

    if (input.symptom) {
      const searchTerm = input.symptom.toLowerCase();
      results = results.filter(
        (part) =>
          part.description.toLowerCase().includes(searchTerm) ||
          part.name.toLowerCase().includes(searchTerm)
      );
    }

    console.log(
      `[searchParts] Returning ${results.length} parts after all filters`
    );
    return results;
  }
);

// ---------------------------------------------------------------------------
// Tool 2: getSuppliers
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

    console.log(`[getSuppliers] Returning ${suppliers.length} suppliers`);
    return suppliers;
  }
);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert healthcare technology management (HTM) procurement assistant for a hospital equipment parts marketplace. You help biomedical technicians quickly identify the correct replacement part for broken medical equipment and recommend the best supplier.

When a technician describes a problem:

1. Parse the input to extract: equipment manufacturer, model, error codes, and symptoms
2. Use the searchParts tool to find matching parts. Try the most specific search first (manufacturer + error code). If no results, broaden the search (manufacturer + equipment name, then just category + symptom).
3. If multiple parts match, evaluate which is most likely based on the error codes and symptoms described. List alternatives.
4. Use the getSuppliers tool to get quality and delivery data for the recommended part's suppliers.
5. Rank suppliers using this weighted scoring model:
   - Quality Score: 50% weight (normalize to 0-1 by dividing by 100)
   - Delivery Speed: 30% weight (invert: score = 1 - (days / 5), clamped to 0-1)
   - Return Rate: 20% weight (invert: score = 1 - (returnRate / 0.1), clamped to 0-1)
6. For parts with criticality "critical" or "high", adjust weights to: Quality 60%, Delivery 25%, Return Rate 15%. Add a warning that the technician should verify compatibility before ordering.
7. If no matching parts are found, set confidence to "low" and explain that the part may not be in the database.

Always respond with the full structured JSON output. Be specific in your diagnosis and reasoning. Think step by step.`;

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
      tools: [searchParts, getSuppliers],
      output: { schema: AgentResponseSchema },
    });

    const result = response.output;
    if (!result) {
      console.error("[diagnoseAndRecommend] LLM returned null output");
      return {
        diagnosis: "Unable to process the request. The AI model did not return a structured response.",
        recommendedPart: null,
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
