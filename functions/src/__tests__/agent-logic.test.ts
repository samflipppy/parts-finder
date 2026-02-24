/**
 * Unit tests for core agent logic: cosine similarity, parts filtering,
 * and response schema validation. Imports production code from utils.ts.
 */

import { z } from "zod";
import { cosineSimilarity, filterParts } from "../utils";
import type { Part, SectionEmbedding } from "../types";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6);
  });

  it("is scale-invariant (magnitude doesn't matter)", () => {
    const a = [1, 2, 3];
    const b = [10, 20, 30]; // same direction, 10x magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 6);
  });

  it("works with high-dimensional vectors (like real embeddings)", () => {
    // Simulate 3072-dim embeddings with random-ish values
    const dim = 3072;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.sin(i + 0.1));
    const score = cosineSimilarity(a, b);

    // Similar but not identical — should be high but not 1.0
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1.0);
  });

  it("scores dissimilar high-dim vectors lower", () => {
    const dim = 3072;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i * 7));

    const score = cosineSimilarity(a, b);
    // Very different vectors — score should be near 0
    expect(Math.abs(score)).toBeLessThan(0.3);
  });
});

const testParts: Part[] = [
  {
    id: "part_001",
    name: "Fan Module Assembly",
    partNumber: "EVITA-FM-001",
    category: "ventilators",
    manufacturer: "Drager",
    compatibleEquipment: ["Evita V500", "Evita V300"],
    relatedErrorCodes: ["Error 57", "Error 58"],
    description: "Complete fan module assembly for Evita series ventilators. Replaces internal cooling fan.",
    avgPrice: 45000,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_002"],
  },
  {
    id: "part_002",
    name: "LCD Display Panel",
    partNumber: "MX800-LCD-001",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800", "IntelliVue MX700"],
    relatedErrorCodes: ["Display Fault", "CRIT: No Video"],
    description: "15-inch LCD panel for IntelliVue MX series monitors. Screen black, no display output.",
    avgPrice: 32000,
    criticality: "high",
    supplierIds: ["sup_001", "sup_003"],
  },
  {
    id: "part_003",
    name: "X-Ray Tube Insert",
    partNumber: "CT660-XT-001",
    category: "imaging",
    manufacturer: "GE",
    compatibleEquipment: ["Optima CT660"],
    relatedErrorCodes: ["Arc Fault", "mA Cal Error"],
    description: "Replacement X-ray tube insert for GE Optima CT660 scanner.",
    avgPrice: 185000,
    criticality: "critical",
    supplierIds: ["sup_004", "sup_005"],
  },
  {
    id: "part_004",
    name: "Battery Pack",
    partNumber: "ZOLL-BAT-001",
    category: "defibrillators",
    manufacturer: "Zoll",
    compatibleEquipment: ["R Series"],
    relatedErrorCodes: ["Battery Fault"],
    description: "Lithium-ion battery pack for Zoll R Series defibrillator. Fixes charge hold failure.",
    avgPrice: 1200,
    criticality: "high",
    supplierIds: ["sup_004", "sup_006"],
  },
];

describe("searchParts filtering logic", () => {
  it("returns all parts with no filters", () => {
    const results = filterParts(testParts, {});
    expect(results).toHaveLength(4);
  });

  it("filters by manufacturer (case-insensitive)", () => {
    const results = filterParts(testParts, { manufacturer: "drager" });
    expect(results).toHaveLength(1);
    expect(results[0].partNumber).toBe("EVITA-FM-001");
  });

  it("filters by category", () => {
    const results = filterParts(testParts, { category: "monitors" });
    expect(results).toHaveLength(1);
    expect(results[0].manufacturer).toBe("Philips");
  });

  it("filters by equipment name (partial match)", () => {
    const results = filterParts(testParts, { equipmentName: "evita" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Fan Module Assembly");
  });

  it("filters by error code", () => {
    const results = filterParts(testParts, { errorCode: "error 57" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("part_001");
  });

  it("filters by symptom (matches description)", () => {
    const results = filterParts(testParts, { symptom: "screen black" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("part_002");
  });

  it("narrows with multiple filters (manufacturer + error code)", () => {
    const results = filterParts(testParts, {
      manufacturer: "Drager",
      errorCode: "Error 57",
    });
    expect(results).toHaveLength(1);
    expect(results[0].partNumber).toBe("EVITA-FM-001");
  });

  it("returns empty when no match", () => {
    const results = filterParts(testParts, { manufacturer: "Siemens" });
    expect(results).toHaveLength(0);
  });

  it("returns empty when filters conflict", () => {
    const results = filterParts(testParts, {
      manufacturer: "Drager",
      category: "monitors", // Drager makes ventilators, not monitors
    });
    expect(results).toHaveLength(0);
  });
});

describe("RAG pipeline — threshold and top-K logic", () => {
  const SIMILARITY_THRESHOLD = 0.3;
  const TOP_K = 5;

  interface ScoredSection {
    sectionTitle: string;
    score: number;
  }

  function applyThresholdAndTopK(scored: ScoredSection[]): ScoredSection[] {
    return scored
      .sort((a, b) => b.score - a.score)
      .filter((s) => s.score >= SIMILARITY_THRESHOLD)
      .slice(0, TOP_K);
  }

  it("filters out scores below threshold", () => {
    const scored: ScoredSection[] = [
      { sectionTitle: "Good Match", score: 0.85 },
      { sectionTitle: "Decent Match", score: 0.45 },
      { sectionTitle: "Below Threshold", score: 0.25 },
      { sectionTitle: "Way Below", score: 0.1 },
    ];

    const results = applyThresholdAndTopK(scored);
    expect(results).toHaveLength(2);
    expect(results[0].sectionTitle).toBe("Good Match");
    expect(results[1].sectionTitle).toBe("Decent Match");
  });

  it("limits to TOP_K results", () => {
    const scored: ScoredSection[] = Array.from({ length: 10 }, (_, i) => ({
      sectionTitle: `Section ${i}`,
      score: 0.9 - i * 0.05,
    }));

    const results = applyThresholdAndTopK(scored);
    expect(results).toHaveLength(TOP_K);
    expect(results[0].score).toBe(0.9);
  });

  it("returns empty when all scores below threshold", () => {
    const scored: ScoredSection[] = [
      { sectionTitle: "Bad", score: 0.1 },
      { sectionTitle: "Worse", score: 0.05 },
    ];

    const results = applyThresholdAndTopK(scored);
    expect(results).toHaveLength(0);
  });

  it("sorts by score descending", () => {
    const scored: ScoredSection[] = [
      { sectionTitle: "C", score: 0.5 },
      { sectionTitle: "A", score: 0.9 },
      { sectionTitle: "B", score: 0.7 },
    ];

    const results = applyThresholdAndTopK(scored);
    expect(results.map((r) => r.sectionTitle)).toEqual(["A", "B", "C"]);
  });

  it("handles exact threshold boundary (>= 0.3)", () => {
    const scored: ScoredSection[] = [
      { sectionTitle: "At Threshold", score: 0.3 },
      { sectionTitle: "Just Below", score: 0.2999 },
    ];

    const results = applyThresholdAndTopK(scored);
    expect(results).toHaveLength(1);
    expect(results[0].sectionTitle).toBe("At Threshold");
  });
});

const ChatAgentResponseSchema = z.object({
  type: z.enum(["diagnosis", "clarification", "guidance", "photo_analysis"]),
  message: z.string(),
  manualReferences: z.array(
    z.object({
      manualId: z.string(),
      sectionId: z.string(),
      sectionTitle: z.string(),
      quotedText: z.string(),
      pageHint: z.string().nullable().optional(),
    })
  ),
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
  reasoning: z.string().nullable(),
  warnings: z.array(z.string()),
});

describe("ChatAgentResponse schema validation", () => {
  it("accepts a valid diagnosis response", () => {
    const response = {
      type: "diagnosis",
      message: "This looks like a fan module failure.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_7",
          sectionTitle: "Fan Module Replacement",
          quotedText: "Error 57 indicates fan failure.",
          pageHint: "Section 3.7, p. 42",
        },
      ],
      diagnosis: "Fan module failure based on Error 57",
      recommendedPart: {
        name: "Fan Module Assembly",
        partNumber: "EVITA-FM-001",
        description: "Complete fan module",
        avgPrice: 45000,
        criticality: "critical",
      },
      repairGuide: null,
      supplierRanking: [
        {
          supplierName: "MedParts Direct",
          qualityScore: 94,
          deliveryDays: 1.2,
          reasoning: "Best combination of quality and speed",
        },
      ],
      alternativeParts: [
        {
          name: "Fan Module v2",
          partNumber: "EVITA-FM-002",
          reason: "Newer revision, same fit",
        },
      ],
      confidence: "high",
      reasoning: "Error 57 maps directly to fan module.",
      warnings: ["Verify compatibility before ordering."],
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("accepts a valid clarification response", () => {
    const response = {
      type: "clarification",
      message: "What equipment are you working on? Make and model would help.",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "Need more info to proceed.",
      warnings: [],
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("accepts a valid guidance response", () => {
    const response = {
      type: "guidance",
      message: "The ZIF latch requires gentle upward pressure.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_2",
          sectionTitle: "Display Assembly Removal",
          quotedText: "Apply 1-2mm of upward deflection.",
        },
      ],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "high",
      reasoning: "Found exact manual section.",
      warnings: ["Do not use metal tools."],
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid response type", () => {
    const response = {
      type: "invalid_type",
      message: "test",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "",
      warnings: [],
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("rejects when required fields are missing", () => {
    const response = {
      type: "diagnosis",
      // missing message
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("rejects invalid part structure", () => {
    const response = {
      type: "diagnosis",
      message: "test",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: {
        name: "Fan Module",
        // missing partNumber, description, avgPrice, criticality
      },
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "high",
      reasoning: "",
      warnings: [],
    };

    const result = ChatAgentResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});

describe("searchManual metadata filtering", () => {
  const testEmbeddings: Omit<SectionEmbedding, "embedding" | "embeddedText">[] = [
    { manualId: "manual_evita_v500", sectionId: "s1", manualTitle: "Evita V500", sectionTitle: "Fan Module", manufacturer: "Drager", equipmentName: "Evita V500", content: "...", warnings: [] },
    { manualId: "manual_evita_v500", sectionId: "s2", manualTitle: "Evita V500", sectionTitle: "Display", manufacturer: "Drager", equipmentName: "Evita V500", content: "...", warnings: [] },
    { manualId: "manual_mx800", sectionId: "s3", manualTitle: "MX800", sectionTitle: "LCD Panel", manufacturer: "Philips", equipmentName: "IntelliVue MX800", content: "...", warnings: [] },
    { manualId: "manual_mx800", sectionId: "s4", manualTitle: "MX800", sectionTitle: "Power Supply", manufacturer: "Philips", equipmentName: "IntelliVue MX800", content: "...", warnings: [] },
    { manualId: "manual_ct660", sectionId: "s5", manualTitle: "CT660", sectionTitle: "X-Ray Tube", manufacturer: "GE", equipmentName: "Optima CT660", content: "...", warnings: [] },
  ];

  function filterEmbeddings(
    embs: typeof testEmbeddings,
    manufacturer?: string,
    equipmentName?: string
  ) {
    let candidates = [...embs];
    if (manufacturer) {
      const term = manufacturer.toLowerCase();
      candidates = candidates.filter((e) => e.manufacturer.toLowerCase() === term);
    }
    if (equipmentName) {
      const term = equipmentName.toLowerCase();
      candidates = candidates.filter((e) => e.equipmentName.toLowerCase().includes(term));
    }
    return candidates;
  }

  it("filters by manufacturer", () => {
    const result = filterEmbeddings(testEmbeddings, "Drager");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.manufacturer === "Drager")).toBe(true);
  });

  it("filters by equipment name", () => {
    const result = filterEmbeddings(testEmbeddings, undefined, "MX800");
    expect(result).toHaveLength(2);
  });

  it("combines manufacturer + equipment", () => {
    const result = filterEmbeddings(testEmbeddings, "Philips", "MX800");
    expect(result).toHaveLength(2);
  });

  it("returns all with no filters", () => {
    const result = filterEmbeddings(testEmbeddings);
    expect(result).toHaveLength(5);
  });

  it("returns empty for non-existent manufacturer", () => {
    const result = filterEmbeddings(testEmbeddings, "Siemens");
    expect(result).toHaveLength(0);
  });
});
