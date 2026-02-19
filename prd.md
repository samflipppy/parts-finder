# PRD: PartsFinder Agent — Healthcare Equipment Diagnostic & Procurement Assistant

## Context

This is a **portfolio/interview demo project** for a PartsSource AI Application Engineer role. PartsSource is the largest B2B healthcare marketplace in the US (5,000+ hospitals, 10,000+ suppliers, 4M+ products). Their core product, PartsSource PRO, uses a decision-support engine called PRECISION Procurement that analyzes 3B+ data points to help hospital biomedical technicians find the right replacement parts for broken medical equipment.

This project demonstrates what an AI orchestration layer on top of that kind of system could look like.

## Problem Statement

Today, when a hospital biomedical technician (HTM tech) encounters broken equipment, they must:

1. Identify the equipment model and interpret error codes
2. Manually search a parts catalog for compatible replacement parts
3. Evaluate multiple suppliers on quality, price, and delivery speed
4. Place an order

This process is slow, manual, and depends heavily on the technician's experience. Junior techs often order wrong parts, causing delays that take mission-critical equipment offline longer.

## Solution

An AI-powered diagnostic agent that:

1. Accepts a natural language description of an equipment problem (e.g., "Drager Evita V500 showing error 57, fan isn't spinning")
2. Parses the equipment type, manufacturer, model, error codes, and symptoms
3. Searches a parts database for matching replacement parts
4. Retrieves supplier quality scores and delivery data
5. Returns a ranked recommendation with reasoning

## Architecture

```
[Technician Input] 
    → [Genkit Flow: diagnoseAndRecommend]
        → [LLM parses input into structured query]
        → [Tool Call: searchParts] → Firestore `parts` collection
        → [Tool Call: getSuppliers] → Firestore `suppliers` collection
        → [LLM ranks suppliers using weighted scoring]
        → [Structured JSON response]
    → [Frontend displays recommendation]
```

## Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Runtime | TypeScript / Node.js | JD requirement |
| LLM Orchestration | Genkit | JD requirement, Google's agent framework |
| LLM | Gemini 2.0 Flash via Google AI | Fast, cheap, good enough for demo. Vertex AI for production |
| Database | Firebase Firestore | JD requirement, real-time, easy to seed |
| API Layer | Firebase Cloud Functions (v2) | Matches their stack, serverless |
| Frontend | Single HTML page with vanilla JS | Keep it simple, demo focus is the agent |
| Deployment | Firebase Hosting + Functions | One deploy command |

## Data Model

### `parts` collection

```typescript
interface Part {
  id: string;                    // e.g., "part_001"
  name: string;                  // e.g., "Fan Module Assembly"
  partNumber: string;            // e.g., "DRG-8306750"
  category: string;              // e.g., "ventilators"
  manufacturer: string;          // e.g., "Drager"
  compatibleEquipment: string[]; // e.g., ["Evita V500", "Evita V800"]
  relatedErrorCodes: string[];   // e.g., ["Error 57", "Error 58", "Fan Failure"]
  description: string;           // Human-readable description
  avgPrice: number;              // USD
  criticality: "low" | "medium" | "high" | "critical";
  supplierIds: string[];         // References to suppliers collection
}
```

Seed 25-30 parts across these equipment categories:
- Ventilators (Drager, Medtronic, Hamilton)
- Patient Monitors (Philips, GE)
- CT/MRI Imaging (GE, Siemens)
- Defibrillators (Zoll, Philips, Physio-Control)
- Infusion Pumps (Baxter, BD Alaris)
- Anesthesia Machines (Drager, GE)

### `suppliers` collection

```typescript
interface Supplier {
  id: string;                  // e.g., "sup_001"
  name: string;                // e.g., "MedParts Direct"
  qualityScore: number;        // 0-100, based on historical quality acceptance rate
  avgDeliveryDays: number;     // Average days to deliver
  returnRate: number;          // 0-1, percentage of parts returned
  specialties: string[];       // Equipment categories they're strong in
  isOEM: boolean;              // Whether they sell OEM or aftermarket
  inStock: boolean;            // Simplified: whether they generally have stock
}
```

Seed 6-8 suppliers with varying quality/speed/price tradeoffs:
- 1-2 premium OEM suppliers (high quality, slower, expensive)
- 2-3 reliable aftermarket (good quality, fast)
- 1-2 budget options (lower quality, cheapest, fastest)
- 1 specialist (only certain categories, very high quality in those)

## Agent Design

### Genkit Tools

**Tool 1: `searchParts`**
- Input: manufacturer (optional), equipmentName (optional), errorCode (optional), symptom (optional), category (optional)
- Behavior: Query Firestore `parts` collection. Apply filters for manufacturer and category directly. For equipmentName, match against `compatibleEquipment` array. For errorCode, match against `relatedErrorCodes`. For symptom, do a basic string match against `description` and `name`.
- Output: Array of matching Part objects

**Tool 2: `getSuppliers`**
- Input: supplierIds (string array)
- Behavior: Fetch supplier documents from Firestore
- Output: Array of Supplier objects with quality scores and delivery data

### Agent System Prompt

The agent should:
1. Parse the technician's natural language input to extract equipment details
2. Call searchParts with extracted parameters
3. If multiple parts match, reason about which is most likely based on the symptoms described
4. Call getSuppliers for the matching part's supplier list
5. Rank suppliers using a weighted score:
   - Quality Score: 50% weight
   - Delivery Speed: 30% weight (lower days = better)
   - Return Rate: 20% weight (lower = better)
6. For critical/high criticality equipment, bias toward higher quality over speed
7. Return structured JSON with diagnosis, recommendation, supplier ranking, confidence level, and reasoning

### Output Schema

```typescript
interface AgentResponse {
  diagnosis: string;              // What the agent thinks is wrong
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
    estimatedPrice: number;
    reasoning: string;            // Why this supplier is ranked here
  }>;
  alternativeParts: Array<{       // Other parts that could be the issue
    name: string;
    partNumber: string;
    reason: string;
  }>;
  confidence: "high" | "medium" | "low";
  reasoning: string;              // Full chain of thought
  warnings: string[];             // Safety warnings, e.g., "Critical equipment - verify part compatibility before ordering"
}
```

## Frontend

Single page with:

1. **Input area**: Text field where technician describes the problem. Include 3-4 example prompts as clickable chips:
   - "Drager Evita V500 error 57, fan not spinning"
   - "Philips IntelliVue MX800 screen is black, no display output"
   - "GE Optima CT660 tube arc fault during scan"
   - "Zoll R Series won't hold a charge, battery light flashing"

2. **Results panel**: 
   - Diagnosis card (what the agent thinks is wrong)
   - Recommended part card (name, part number, price, criticality badge)
   - Supplier ranking table (ranked list with scores and reasoning)
   - Alternative parts section (other possibilities)
   - Confidence indicator (high/medium/low with color)
   
3. **Agent trace panel** (collapsible):
   - Show each tool call the agent made
   - What it searched for
   - What it found
   - How it scored suppliers
   - This demonstrates auditability, which matters in healthcare

4. **Design**: Clean, professional, healthcare-appropriate. White background, blue accent (#0066CC), clear typography. No flashy animations. This is a medical tool, not a consumer app.

## File Structure

```
partsfinder-agent/
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── package.json
├── README.md
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Firebase Functions entry, API endpoint
│       ├── agent.ts              # Genkit agent definition, tools, flow
│       ├── seed.ts               # Firestore seeder script
│       └── types.ts              # Shared TypeScript interfaces
├── public/
│   ├── index.html                # Single page frontend
│   ├── style.css                 # Styles
│   └── app.js                    # Frontend JS (fetch API, render results)
```

## Test Cases

The agent should handle these scenarios correctly:

1. **Exact match**: "Drager Evita V500 error 57" → Fan Module Assembly from best supplier
2. **Symptom-based (no error code)**: "The patient monitor screen went dark, it's a Philips MX800" → Display Panel LCD
3. **Multiple possible parts**: "GE CT scanner making a grinding noise during rotation" → Should suggest tube assembly but flag alternatives
4. **Critical equipment prioritization**: Defibrillator battery failure should prioritize quality score over delivery speed in supplier ranking
5. **No match found**: "Broken coffee machine in the break room" → Graceful failure with message that this is outside the system's scope
6. **Ambiguous input**: "Ventilator isn't working" → Should ask for more details or return multiple possibilities with lower confidence

## Success Criteria

For the interview demo, this project succeeds if:

1. The agent correctly identifies parts from natural language input in 4/6 test cases
2. Supplier ranking is explainable and consistent with the weighted scoring model
3. The agent trace shows clear, auditable reasoning
4. The system responds in under 5 seconds
5. The code is clean, typed, and demonstrates production-grade patterns (error handling, input validation, structured logging)
6. You can articulate what would change for production: real data, Vertex AI with HIPAA compliance, rate limiting, human-in-the-loop for critical orders, integration with CMMS systems

## Out of Scope (but good to mention in interview)

- Real parts data (would integrate with PartsSource's actual catalog API)
- Authentication / RBAC (hospital techs vs. managers vs. admins)
- Order placement flow (this just recommends, doesn't buy)
- Photo/image input (technician takes a photo of the error screen)
- HIPAA compliance considerations
- Integration with hospital CMMS (Computerized Maintenance Management System)
- Predictive maintenance (recommending parts before equipment fails)
- Multi-turn conversation (follow-up questions)
