/**
 * PartsFinder Agent — Evaluation Framework
 *
 * Runs a suite of test cases against the agent, scores accuracy,
 * and produces a summary report. Stores results in Firestore for
 * trend tracking across prompt/model changes.
 *
 * Usage:
 *   npm run eval              (requires emulators + seed data running)
 */

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import type { EvalTestCase, EvalCaseResult, EvalRunSummary } from "./types";
import { diagnoseWithMetrics } from "./agent";

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

initializeApp();

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const TEST_CASES: EvalTestCase[] = [
  // ---- High-confidence exact matches ----
  {
    id: "eval_001",
    name: "Drager Evita V500 Error 57 — Fan Module",
    input: "Drager Evita V500 showing error 57, fan module is not spinning",
    expectedPartNumber: "DRG-8306750",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["ventilators", "specific", "error-code"],
  },
  {
    id: "eval_002",
    name: "Philips MX800 screen black — LCD Assembly",
    input: "Philips IntelliVue MX800 screen went black, no display output",
    expectedPartNumber: "PHI-453564243681",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["monitors", "specific", "symptom"],
  },
  {
    id: "eval_003",
    name: "GE CT660 tube arc fault — X-Ray Tube",
    input: "GE Optima CT660 tube arc fault during scan, mA calibration error",
    expectedPartNumber: "GE-2350400-2",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["imaging", "specific", "error-code", "critical"],
  },
  {
    id: "eval_004",
    name: "Zoll R Series battery — Battery Pack",
    input:
      "Zoll R Series defibrillator won't hold charge, battery light flashing",
    expectedPartNumber: "ZOLL-8019-0535-01",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["defibrillators", "specific", "symptom"],
  },
  {
    id: "eval_005",
    name: "Baxter Sigma Spectrum motor stall — Pump Mechanism",
    input:
      "Baxter Sigma Spectrum infusion pump showing motor stall error, occlusion alarm keeps going off",
    expectedPartNumber: "BAX-35700BAX2F",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["infusion", "specific", "error-code"],
  },
  {
    id: "eval_006",
    name: "Drager Fabius vaporizer error — Sevoflurane Vaporizer",
    input:
      "Drager Fabius GS Premium anesthesia machine showing vaporizer error, agent concentration reading wrong",
    expectedPartNumber: "DRG-6871180",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["anesthesia", "specific", "error-code"],
  },
  {
    id: "eval_007",
    name: "Philips MX800 SpO2 module failure",
    input:
      "Philips IntelliVue MX800 SpO2 module stopped reading, getting SpO2 No Signal error",
    expectedPartNumber: "PHI-M1020B",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["monitors", "specific", "error-code"],
  },
  {
    id: "eval_008",
    name: "GE Aisys bellows leak — Bellows Assembly",
    input:
      "GE Aisys CS2 anesthesia machine bellows not rising, circuit leak alarm going off",
    expectedPartNumber: "GE-1406-8202-000",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["anesthesia", "specific", "symptom"],
  },

  // ---- Edge cases: vague or off-domain ----
  {
    id: "eval_009",
    name: "Vague query — ventilator is broken",
    input: "ventilator is broken",
    expectedPartNumber: null, // too vague for single match
    expectedConfidence: "medium",
    mustCallTools: ["searchParts"],
    tags: ["vague", "ventilators"],
  },
  {
    id: "eval_010",
    name: "Off-domain — broken coffee maker",
    input: "the break room coffee maker stopped working, no power",
    expectedPartNumber: null,
    expectedConfidence: "low",
    mustCallTools: ["searchParts"],
    tags: ["off-domain", "no-match"],
  },

  // ---- Medium-confidence / symptom-only ----
  {
    id: "eval_011",
    name: "Medtronic PB980 compressor failure",
    input:
      "Medtronic PB980 ventilator compressor not working, low pressure alarm going off",
    expectedPartNumber: "MDT-10004997",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["ventilators", "specific", "symptom"],
  },
  {
    id: "eval_012",
    name: "Siemens SOMATOM gantry comm error — Slip Ring",
    input:
      "Siemens SOMATOM Force CT scanner gantry communication error, data transfer fault",
    expectedPartNumber: "SMN-10092745",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["imaging", "specific", "error-code"],
  },
  {
    id: "eval_013",
    name: "Zoll defibrillator charge failure — Capacitor Module",
    input: "Zoll R Series defibrillator won't charge, energy delivery error during test",
    expectedPartNumber: "ZOLL-9650-0801-01",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["defibrillators", "specific", "error-code"],
  },
  {
    id: "eval_014",
    name: "Hamilton C6 display blank — Display Board",
    input: "Hamilton C6 ventilator screen blank, touchscreen not responding at all",
    expectedPartNumber: "HAM-159220",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["ventilators", "specific", "symptom"],
  },
  {
    id: "eval_015",
    name: "Philips MX800 no power — Power Supply",
    input: "Philips IntelliVue MX800 completely dead, no power at all, tried different outlets",
    expectedPartNumber: "PHI-453564020911",
    expectedConfidence: "high",
    mustCallTools: ["searchParts", "getSuppliers"],
    tags: ["monitors", "specific", "symptom"],
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreTestCase(
  testCase: EvalTestCase,
  actualPartNumber: string | null,
  actualConfidence: string,
  actualToolSequence: string[]
): { partMatch: boolean; confidenceMatch: boolean; toolsCompliant: boolean } {
  // Part accuracy
  let partMatch: boolean;
  if (testCase.expectedPartNumber === null) {
    // For vague/off-domain: pass if no part or any part (we just care about confidence)
    partMatch = true;
  } else {
    partMatch = actualPartNumber === testCase.expectedPartNumber;
  }

  // Confidence match
  const confidenceMatch = actualConfidence === testCase.expectedConfidence;

  // Tool compliance: all required tools must appear in the sequence
  const toolsCompliant = testCase.mustCallTools.every((tool) =>
    actualToolSequence.includes(tool)
  );

  return { partMatch, confidenceMatch, toolsCompliant };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runEval(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  PartsFinder Agent — Evaluation Suite");
  console.log("=".repeat(60));
  console.log(`  Running ${TEST_CASES.length} test cases...\n`);

  const results: EvalCaseResult[] = [];

  for (const testCase of TEST_CASES) {
    process.stdout.write(`  [${testCase.id}] ${testCase.name}... `);

    try {
      const { response, metrics } = await diagnoseWithMetrics(testCase.input);

      const actualPartNumber = response.recommendedPart?.partNumber ?? null;
      const actualConfidence = response.confidence;
      const actualToolSequence = metrics.toolSequence;

      const { partMatch, confidenceMatch, toolsCompliant } = scoreTestCase(
        testCase,
        actualPartNumber,
        actualConfidence,
        actualToolSequence
      );

      const passed = partMatch && confidenceMatch && toolsCompliant;

      results.push({
        testCase,
        passed,
        partMatch,
        confidenceMatch,
        toolsCompliant,
        actualPartNumber,
        actualConfidence,
        actualToolSequence,
        latencyMs: metrics.totalLatencyMs,
        error: null,
      });

      if (passed) {
        console.log("PASS");
      } else {
        console.log("FAIL");
        if (!partMatch) {
          console.log(
            `    Part: expected ${testCase.expectedPartNumber}, got ${actualPartNumber}`
          );
        }
        if (!confidenceMatch) {
          console.log(
            `    Confidence: expected ${testCase.expectedConfidence}, got ${actualConfidence}`
          );
        }
        if (!toolsCompliant) {
          console.log(
            `    Tools: expected ${testCase.mustCallTools.join(", ")}, got ${actualToolSequence.join(", ")}`
          );
        }
      }
      console.log(`    Latency: ${(metrics.totalLatencyMs / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log("ERROR");
      const message = err instanceof Error ? err.message : String(err);
      console.log(`    ${message}`);

      results.push({
        testCase,
        passed: false,
        partMatch: false,
        confidenceMatch: false,
        toolsCompliant: false,
        actualPartNumber: null,
        actualConfidence: "unknown",
        actualToolSequence: [],
        latencyMs: 0,
        error: message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const totalCases = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = totalCases - passed;
  const passRate = +((passed / totalCases) * 100).toFixed(1);

  const partAccurate = results.filter((r) => r.partMatch).length;
  const partAccuracy = +((partAccurate / totalCases) * 100).toFixed(1);

  const confAccurate = results.filter((r) => r.confidenceMatch).length;
  const confidenceAccuracy = +((confAccurate / totalCases) * 100).toFixed(1);

  const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

  console.log("\n" + "=".repeat(60));
  console.log("  RESULTS");
  console.log("=".repeat(60));
  console.log(`  Total:               ${totalCases}`);
  console.log(`  Passed:              ${passed}`);
  console.log(`  Failed:              ${failed}`);
  console.log(`  Pass Rate:           ${passRate}%`);
  console.log(`  Part Accuracy:       ${partAccuracy}%`);
  console.log(`  Confidence Accuracy: ${confidenceAccuracy}%`);
  console.log(`  Avg Latency:         ${(avgLatencyMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(60));

  // ---------------------------------------------------------------------------
  // Persist eval run to Firestore
  // ---------------------------------------------------------------------------

  const runSummary: EvalRunSummary = {
    runId: randomUUID(),
    timestamp: new Date().toISOString(),
    totalCases,
    passed,
    failed,
    passRate,
    partAccuracy,
    confidenceAccuracy,
    avgLatencyMs,
    results,
  };

  try {
    const db = getFirestore();
    await db.collection("eval_runs").doc(runSummary.runId).set(runSummary);
    console.log(`\n  Eval run saved to Firestore: eval_runs/${runSummary.runId}`);
  } catch (err) {
    console.error("\n  Failed to persist eval run:", err);
  }

  // Exit with non-zero if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runEval().catch((err) => {
  console.error("Eval runner crashed:", err);
  process.exit(1);
});
