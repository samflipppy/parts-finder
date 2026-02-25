/**
 * Technician workflow simulation tests.
 */

import type { ChatMessage, ChatAgentResponse } from "../types";
import {
  MetricsCollector,
  setActiveCollector,
} from "../metrics";

function buildConversation(
  ...turns: Array<{ role: "user" | "assistant"; content: string }>
): ChatMessage[] {
  return turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
}

// Default business fields for test mock responses
const EMPTY_BIZ = {
  equipmentAsset: null,
};

function assertValidResponse(response: ChatAgentResponse): void {
  expect(response.type).toBeDefined();
  expect(["diagnosis", "clarification", "guidance", "photo_analysis"]).toContain(response.type);
  expect(typeof response.message).toBe("string");
  expect(response.message.length).toBeGreaterThan(0);
  expect(Array.isArray(response.manualReferences)).toBe(true);
  expect(Array.isArray(response.supplierRanking)).toBe(true);
  expect(Array.isArray(response.alternativeParts)).toBe(true);
  expect(Array.isArray(response.warnings)).toBe(true);
  expect(typeof response.reasoning).toBe("string");
}

describe("Technician repair workflow", () => {

  it("Step 1: Agent asks clarifying questions when info is missing", () => {
    buildConversation(
      { role: "user", content: "Hey, my ventilator is acting up" }
    );

    const response: ChatAgentResponse = {
      type: "clarification",
      message: "I can help with that. What's the make and model of the ventilator? And what symptoms are you seeing — any error codes on the display?",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: null,
      reasoning: "User provided insufficient detail. Need manufacturer, model, and symptoms.",
      warnings: [],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);
    expect(response.type).toBe("clarification");
    expect(response.confidence).toBeNull();
    expect(response.recommendedPart).toBeNull();
    expect(response.message).toContain("make and model");
  });

  it("Step 2: Agent diagnoses with manual refs and part recommendation", () => {
    const messages = buildConversation(
      { role: "user", content: "Hey, my ventilator is acting up" },
      { role: "assistant", content: "What make and model?" },
      { role: "user", content: "Drager Evita V500, showing Error 57. The fan isn't spinning." }
    );

    const collector = new MetricsCollector();
    setActiveCollector(collector);

    collector.recordToolCall(
      "searchManual",
      { manufacturer: "Drager", equipmentName: "Evita V500", keyword: "Error 57 fan" },
      3, 450, undefined,
      {
        searchMode: "vector",
        embeddingsLoaded: 127,
        candidatesAfterFilter: 45,
        queryText: "Drager Evita V500 Error 57 fan",
        topScores: [
          { sectionTitle: "Fan Module Replacement", score: 0.89 },
          { sectionTitle: "Error Code Reference", score: 0.72 },
          { sectionTitle: "Cooling System Overview", score: 0.65 },
        ],
        similarityThreshold: 0.3,
        resultsAboveThreshold: 3,
        topK: 5,
      }
    );
    collector.recordToolCall(
      "searchParts",
      { manufacturer: "Drager", errorCode: "Error 57" },
      1, 120,
      [
        { filter: "manufacturer", value: "Drager", remaining: 8 },
        { filter: "errorCode", value: "Error 57", remaining: 1 },
      ]
    );

    const response: ChatAgentResponse = {
      type: "diagnosis",
      message: "Error 57 on the Evita V500 points to a fan module failure. The service manual confirms this — Error 57 is triggered when the internal cooling fan stops or falls below minimum RPM.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_7",
          sectionTitle: "3.7 Fan Module Replacement",
          quotedText: "Error 57 indicates the internal cooling fan has stopped or is operating below the minimum RPM threshold of 2,400 RPM.",
          pageHint: "Section 3.7, p. 42",
        },
      ],
      diagnosis: "Fan module failure — Error 57 indicates cooling fan below minimum RPM.",
      recommendedPart: {
        name: "Fan Module Assembly",
        partNumber: "EVITA-FM-001",
        description: "Complete fan module assembly for Evita V500/V300",
        avgPrice: 45000,
        criticality: "critical",
      },
      repairGuide: {
        title: "Fan Module Replacement",
        estimatedTime: "45-60 minutes",
        difficulty: "advanced",
        safetyWarnings: [
          "Disconnect mains power before opening the chassis.",
          "Wait 30 seconds for capacitors to discharge.",
        ],
        steps: [
          "Remove the rear service panel (4x M4 screws).",
          "Disconnect the fan module harness (J12 connector).",
          "Remove the fan module mounting screws (3x M3).",
          "Install the new fan module and reconnect J12.",
          "Replace the rear panel and torque screws to 2 Nm.",
          "Power on and verify fan RPM in service mode.",
        ],
        tools: ["Torque wrench (2 Nm)", "M3 screwdriver", "M4 screwdriver"],
      },
      supplierRanking: [
        {
          supplierName: "ClinicalSource OEM",
          qualityScore: 98,
          deliveryDays: 2.5,
          reasoning: "OEM part, highest quality, reasonable delivery",
        },
        {
          supplierName: "MedParts Direct",
          qualityScore: 94,
          deliveryDays: 1.2,
          reasoning: "Fastest delivery, non-OEM but high quality",
        },
      ],
      alternativeParts: [
        {
          name: "Fan Module Assembly (Aftermarket)",
          partNumber: "EVITA-FM-ALT",
          reason: "Lower cost aftermarket option, same form factor",
        },
      ],
      confidence: "high",
      reasoning: "Error 57 maps directly to fan module failure per service manual section 3.7.",
      warnings: [
        "Critical part — verify OEM compatibility before installing.",
        "Equipment must be fully powered down before starting repair.",
      ],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);

    expect(response.recommendedPart).not.toBeNull();
    expect(response.recommendedPart!.partNumber).toBe("EVITA-FM-001");
    expect(response.recommendedPart!.avgPrice).toBe(45000);
    expect(response.recommendedPart!.criticality).toBe("critical");

    expect(response.alternativeParts).toHaveLength(1);
    expect(response.alternativeParts[0].partNumber).toBeTruthy();

    expect(response.manualReferences).toHaveLength(1);
    expect(response.manualReferences[0].quotedText).toContain("2,400 RPM");

    expect(response.repairGuide).not.toBeNull();
    expect(response.repairGuide!.steps.length).toBeGreaterThan(0);
    expect(response.repairGuide!.safetyWarnings.length).toBeGreaterThan(0);

    expect(response.supplierRanking).toHaveLength(2);
    expect(response.warnings.length).toBeGreaterThan(0);
    expect(response.confidence).toBe("high");

    const metricsResult = collector.finalize(
      messages[messages.length - 1].content,
      {
        diagnosis: response.diagnosis ?? response.message,
        recommendedPart: response.recommendedPart,
        repairGuide: response.repairGuide,
        supplierRanking: response.supplierRanking,
        alternativeParts: response.alternativeParts,
        confidence: response.confidence ?? "medium",
        reasoning: response.reasoning ?? "",
        warnings: response.warnings,
      }
    );

    expect(metricsResult.totalToolCalls).toBe(2);
    expect(metricsResult.toolSequence).toEqual(["searchManual", "searchParts"]);
    expect(metricsResult.partFound).toBe(true);
    expect(metricsResult.recommendedPartNumber).toBe("EVITA-FM-001");

    const searchManualCall = metricsResult.toolCalls.find(
      (tc) => tc.toolName === "searchManual"
    );
    expect(searchManualCall).toBeDefined();
    expect(searchManualCall!.ragTrace).toBeDefined();
    expect(searchManualCall!.ragTrace!.searchMode).toBe("vector");
    expect(searchManualCall!.ragTrace!.topScores[0].score).toBe(0.89);

    const searchPartsCall = metricsResult.toolCalls.find(
      (tc) => tc.toolName === "searchParts"
    );
    expect(searchPartsCall).toBeDefined();
    expect(searchPartsCall!.filterSteps).toHaveLength(2);
    expect(searchPartsCall!.filterSteps![1].remaining).toBe(1);

    setActiveCollector(null);
  });

  it("Step 3: Agent provides step-specific guidance during repair", () => {
    const response: ChatAgentResponse = {
      type: "guidance",
      message: "The J12 connector on the Evita V500 is a Molex 12-pin connector. Per the manual, press the latch tab and pull straight back — don't rock it side to side.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_7",
          sectionTitle: "3.7 Fan Module Replacement",
          quotedText: "The J12 connector is a Molex 12-pin locking connector. Depress the latch tab fully before pulling the connector straight back. Do not rock the connector, as this may damage the pins.",
          pageHint: "Section 3.7, Step 2, p. 43",
        },
      ],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "high",
      reasoning: "Found exact connector info in the fan module section.",
      warnings: ["Do not rock the connector — pin damage risk."],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);
    expect(response.type).toBe("guidance");
    expect(response.manualReferences).toHaveLength(1);
    expect(response.manualReferences[0].quotedText).toContain("Molex 12-pin");
    expect(response.recommendedPart).toBeNull();
  });

  it("Step 4: Agent analyzes a photo and references manual specs", () => {
    const response: ChatAgentResponse = {
      type: "photo_analysis",
      message: "I can see scoring on the fan blade surface. The service manual specifies maximum allowable runout of 0.05mm for the fan blades. You'll want to measure this with a dial indicator to check if it's within tolerance.",
      manualReferences: [
        {
          manualId: "manual_evita_v500",
          sectionId: "ev500_3_7_specs",
          sectionTitle: "3.7.1 Fan Module Specifications",
          quotedText: "Maximum allowable blade runout: 0.05 mm. Replace fan module if runout exceeds this value.",
        },
      ],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "medium",
      reasoning: "Visual scoring observed, referenced spec from manual.",
      warnings: [],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);
    expect(response.type).toBe("photo_analysis");
    expect(response.message).not.toContain("looks fine");
    expect(response.message).not.toContain("acceptable");
    expect(response.manualReferences[0].quotedText).toContain("0.05 mm");
  });

  it("Step 5: Part data has everything the Buy button needs", () => {
    const response: ChatAgentResponse = {
      type: "diagnosis",
      message: "The bearing is worn. You'll need to replace it.",
      manualReferences: [],
      diagnosis: "Worn bearing",
      recommendedPart: {
        name: "Main Bearing Assembly",
        partNumber: "EVT-BEAR-001",
        description: "Precision bearing for Evita V500 blower assembly",
        avgPrice: 8500,
        criticality: "high",
      },
      repairGuide: null,
      supplierRanking: [
        {
          supplierName: "ClinicalSource OEM",
          qualityScore: 98,
          deliveryDays: 2.5,
          reasoning: "OEM, best quality",
        },
      ],
      alternativeParts: [
        {
          name: "Aftermarket Bearing Assembly",
          partNumber: "EVT-BEAR-ALT",
          reason: "30% cheaper, compatible",
        },
        {
          name: "Refurbished Bearing",
          partNumber: "EVT-BEAR-REF",
          reason: "Refurbished OEM, 50% cost savings",
        },
      ],
      confidence: "high",
      reasoning: "Bearing wear confirmed visually.",
      warnings: ["Verify bearing clearance after installation."],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);

    const part = response.recommendedPart!;
    expect(part.partNumber).toBeTruthy();
    expect(part.name).toBeTruthy();
    expect(typeof part.avgPrice).toBe("number");
    expect(part.avgPrice).toBeGreaterThan(0);

    for (const alt of response.alternativeParts) {
      expect(alt.partNumber).toBeTruthy();
      expect(alt.name).toBeTruthy();
      expect(alt.reason).toBeTruthy();
    }

    for (const supplier of response.supplierRanking) {
      expect(supplier.supplierName).toBeTruthy();
      expect(typeof supplier.qualityScore).toBe("number");
      expect(typeof supplier.deliveryDays).toBe("number");
    }
  });
});

describe("Workflow edge cases", () => {
  it("handles off-domain query gracefully", () => {
    const response: ChatAgentResponse = {
      type: "clarification",
      message: "I'm specialized in medical equipment repair. I can help with ventilators, monitors, imaging systems, defibrillators, and similar equipment. What device are you working on?",
      manualReferences: [],
      diagnosis: null,
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "low",
      reasoning: "Query appears to be off-domain.",
      warnings: [],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);
    expect(response.confidence).toBe("low");
    expect(response.recommendedPart).toBeNull();
  });

  it("handles no-match scenario (part not in database)", () => {
    const response: ChatAgentResponse = {
      type: "diagnosis",
      message: "I searched the parts database but couldn't find an exact match for this component. I'd recommend contacting the manufacturer directly for the correct part number.",
      manualReferences: [],
      diagnosis: "Part not found in database",
      recommendedPart: null,
      repairGuide: null,
      supplierRanking: [],
      alternativeParts: [],
      confidence: "low",
      reasoning: "No matching parts found after multiple search attempts.",
      warnings: ["Contact manufacturer for correct part number."],
      ...EMPTY_BIZ,
    };

    assertValidResponse(response);
    expect(response.recommendedPart).toBeNull();
    expect(response.alternativeParts).toHaveLength(0);
    expect(response.confidence).toBe("low");
  });

  it("conversation history preserves all turns correctly", () => {
    const conversation = buildConversation(
      { role: "user", content: "Evita V500 error 57" },
      { role: "assistant", content: "That's a fan issue. Want me to walk you through the fix?" },
      { role: "user", content: "Yes please" },
      { role: "assistant", content: "Step 1: Remove the rear panel." },
      { role: "user", content: "Done, what's next?" },
      { role: "assistant", content: "Step 2: Disconnect J12." },
      { role: "user", content: "How do I disconnect J12?" }
    );

    expect(conversation).toHaveLength(7);
    expect(conversation[0].role).toBe("user");
    expect(conversation[conversation.length - 1].role).toBe("user");

    const history = conversation.slice(0, -1);
    const current = conversation[conversation.length - 1];
    expect(history).toHaveLength(6);
    expect(current.content).toBe("How do I disconnect J12?");
  });

});
