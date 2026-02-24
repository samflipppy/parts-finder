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
// Service manuals
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
// Section embeddings
// ---------------------------------------------------------------------------

export interface SectionEmbedding {
  manualId: string;
  sectionId: string;
  manualTitle: string;
  sectionTitle: string;
  manufacturer: string;
  equipmentName: string;
  embeddedText: string;
  embedding: number[];
  content: string;
  specifications?: ManualSpecification[];
  warnings?: string[];
  steps?: string[];
  tools?: string[];
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageBase64?: string;
}

// ---------------------------------------------------------------------------
// Agent responses
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
  pageHint?: string | null;    // e.g. "Section 3.7, p. 42"
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
  reasoning: string | null;
  warnings: string[];
}

