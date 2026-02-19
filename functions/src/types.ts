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

export interface AgentResponse {
  diagnosis: string;
  recommendedPart: {
    name: string;
    partNumber: string;
    description: string;
    avgPrice: number;
    criticality: string;
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
