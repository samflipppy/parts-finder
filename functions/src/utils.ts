import type { Part } from "./types";

export function cosineSimilarity(a: number[], b: number[]): number {
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

export function filterParts(
  parts: Part[],
  input: {
    manufacturer?: string;
    equipmentName?: string;
    errorCode?: string;
    symptom?: string;
    category?: string;
  }
): Part[] {
  let results = [...parts];

  if (input.category) {
    const term = input.category.toLowerCase();
    results = results.filter((p) => p.category.toLowerCase() === term);
  }
  if (input.manufacturer) {
    const term = input.manufacturer.toLowerCase();
    results = results.filter((p) => p.manufacturer.toLowerCase() === term);
  }
  if (input.equipmentName) {
    const term = input.equipmentName.toLowerCase();
    results = results.filter((p) =>
      p.compatibleEquipment.some((eq) => eq.toLowerCase().includes(term))
    );
  }
  if (input.errorCode) {
    const term = input.errorCode.toLowerCase();
    results = results.filter((p) =>
      p.relatedErrorCodes.some((code) => code.toLowerCase().includes(term))
    );
  }
  if (input.symptom) {
    const term = input.symptom.toLowerCase();
    results = results.filter(
      (p) =>
        p.description.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)
    );
  }

  return results;
}
