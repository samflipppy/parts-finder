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

// ---------------------------------------------------------------------------
// V2: Service manuals for diagnostic partner
// ---------------------------------------------------------------------------

export interface ManualSpecification {
  parameter: string;           // e.g. "Bearing clearance"
  value: string;               // e.g. "0.003 inches"
  tolerance?: string;          // e.g. "+/- 0.001 inches"
  unit: string;                // e.g. "inches"
}

export interface ManualFigure {
  figureId: string;            // e.g. "fig_3_2"
  description: string;         // alt text describing the diagram
}

export interface ManualSection {
  sectionId: string;           // e.g. "sec_3_7"
  title: string;               // e.g. "3.7 Fan Module Replacement"
  content: string;             // full text of the section
  specifications?: ManualSpecification[];
  warnings?: string[];
  steps?: string[];
  tools?: string[];
  figures?: ManualFigure[];
  parentSection?: string;      // sectionId of parent (for nesting)
}

export interface ServiceManual {
  manualId: string;            // e.g. "manual_evita_v500"
  title: string;               // e.g. "Drager Evita V500 Service Manual"
  equipmentName: string;       // e.g. "Evita V500"
  manufacturer: string;
  compatibleModels: string[];
  revision: string;            // e.g. "Rev 4.2, 2023-06"
  totalPages: number;
  sections: ManualSection[];
}

// ---------------------------------------------------------------------------
// V2: Chat messages for multi-turn conversation
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageBase64?: string;        // optional base64-encoded image (JPEG/PNG)
}

// ---------------------------------------------------------------------------
// Agent responses (V1 + V2)
// ---------------------------------------------------------------------------

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

export interface ManualReference {
  manualId: string;
  sectionId: string;
  sectionTitle: string;
  quotedText: string;          // exact quote from the manual
  pageHint?: string;           // e.g. "Section 3.7, p. 42"
}

export interface ChatAgentResponse {
  type: "diagnosis" | "clarification" | "guidance" | "photo_analysis";
  message: string;             // main response text — always present
  manualReferences: ManualReference[];
  diagnosis: string | null;
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
  confidence: "high" | "medium" | "low" | null;
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
