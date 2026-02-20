export interface Part {
  id: string;
  name: string;
  partNumber: string;
  category: string;
  manufacturer: string;
  compatibleEquipment: string[];
  relatedErrorCodes: string[];
  description: string;
  avgPrice: number;
  criticality: "low" | "medium" | "high" | "critical";
  supplierIds: string[];
}

export interface Supplier {
  id: string;
  name: string;
  qualityScore: number;
  avgDeliveryDays: number;
  returnRate: number;
  specialties: string[];
  isOEM: boolean;
  inStock: boolean;
}

export interface RepairGuide {
  partId: string;
  partNumber: string;
  title: string;
  estimatedTime: string;       // e.g. "45–60 minutes"
  difficulty: "easy" | "moderate" | "advanced";
  safetyWarnings: string[];
  steps: string[];
  tools: string[];             // tools/equipment needed
}

export interface AgentResponse {
  diagnosis: string;
  recommendedPart: {
    name: string;
    partNumber: string;
    description: string;
    avgPrice: number;
    criticality: string;
  } | null;
  repairGuide: {
    title: string;
    estimatedTime: string;
    difficulty: string;
    safetyWarnings: string[];
    steps: string[];
    tools: string[];
  } | null;
  supplierRanking: Array<{
    supplierName: string;
    qualityScore: number;
    deliveryDays: number;
    reasoning: string;
  }>;
  alternativeParts: Array<{
    name: string;
    partNumber: string;
    reason: string;
  }>;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Eval types
// ---------------------------------------------------------------------------

export interface EvalTestCase {
  id: string;
  name: string;
  input: string;
  expectedPartNumber: string | null; // null = no match expected
  expectedConfidence: "high" | "medium" | "low";
  mustCallTools: string[];
  tags: string[];
}

export interface EvalCaseResult {
  testCase: EvalTestCase;
  passed: boolean;
  partMatch: boolean;
  confidenceMatch: boolean;
  toolsCompliant: boolean;
  actualPartNumber: string | null;
  actualConfidence: string;
  actualToolSequence: string[];
  latencyMs: number;
  error: string | null;
}

export interface EvalRunSummary {
  runId: string;
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  partAccuracy: number;
  confidenceAccuracy: number;
  avgLatencyMs: number;
  results: EvalCaseResult[];
}
