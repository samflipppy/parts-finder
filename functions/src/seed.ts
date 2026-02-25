/**
 * Firestore seeder script for PartsFinder Agent.
 * Run with: npx tsx src/seed.ts
 *
 * Idempotent — uses fixed document IDs so re-running overwrites
 * rather than duplicating data.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Part, Supplier, RepairGuide, ServiceManual, EquipmentAsset, WorkOrder } from "./types";
import { extraRepairGuides } from "./__generated__/repair-guides-extra";

initializeApp();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

const suppliers: Supplier[] = [
  {
    id: "sup_001",
    name: "MedParts Direct",
    qualityScore: 94,
    avgDeliveryDays: 1.2,
    returnRate: 0.02,
    specialties: ["imaging", "ventilators", "monitors"],
    isOEM: false,
    inStock: true,
  },
  {
    id: "sup_002",
    name: "ClinicalSource OEM",
    qualityScore: 98,
    avgDeliveryDays: 2.5,
    returnRate: 0.005,
    specialties: ["ventilators", "anesthesia"],
    isOEM: true,
    inStock: true,
  },
  {
    id: "sup_003",
    name: "BioEquip Solutions",
    qualityScore: 87,
    avgDeliveryDays: 0.8,
    returnRate: 0.04,
    specialties: ["monitors", "infusion", "imaging"],
    isOEM: false,
    inStock: true,
  },
  {
    id: "sup_004",
    name: "National Medical Supply",
    qualityScore: 91,
    avgDeliveryDays: 1.8,
    returnRate: 0.015,
    specialties: ["ventilators", "defibrillators", "imaging"],
    isOEM: false,
    inStock: true,
  },
  {
    id: "sup_005",
    name: "PrecisionMed Parts",
    qualityScore: 96,
    avgDeliveryDays: 3.0,
    returnRate: 0.008,
    specialties: ["imaging", "defibrillators"],
    isOEM: true,
    inStock: true,
  },
  {
    id: "sup_006",
    name: "QuickShip Medical",
    qualityScore: 82,
    avgDeliveryDays: 0.5,
    returnRate: 0.06,
    specialties: ["monitors", "infusion", "defibrillators"],
    isOEM: false,
    inStock: true,
  },
  {
    id: "sup_007",
    name: "Heartland HTM Supply",
    qualityScore: 89,
    avgDeliveryDays: 1.5,
    returnRate: 0.025,
    specialties: ["anesthesia", "ventilators", "monitors"],
    isOEM: false,
    inStock: true,
  },
];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const parts: Part[] = [
  // ---- Ventilators ----
  {
    id: "part_001",
    name: "Fan Module Assembly",
    partNumber: "DRG-8306750",
    category: "ventilators",
    manufacturer: "Drager",
    compatibleEquipment: ["Evita V500", "Evita V800"],
    relatedErrorCodes: ["Error 57", "Error 58", "Fan Failure"],
    description:
      "Internal cooling fan module for Drager Evita series ventilators. Failure causes overheating shutdowns and Error 57/58 codes.",
    avgPrice: 1850,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_002", "sup_004"],
  },
  {
    id: "part_002",
    name: "Flow Sensor Assembly",
    partNumber: "DRG-8403735",
    category: "ventilators",
    manufacturer: "Drager",
    compatibleEquipment: ["Evita V500", "Evita V800", "Evita Infinity V500"],
    relatedErrorCodes: ["Error 12", "Flow Measurement Error", "Inaccurate Tidal Volume"],
    description:
      "Proximal flow sensor for accurate tidal volume measurement. Common failure point after extended use.",
    avgPrice: 420,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_002", "sup_007"],
  },
  {
    id: "part_003",
    name: "Exhalation Valve Assembly",
    partNumber: "DRG-8412130",
    category: "ventilators",
    manufacturer: "Drager",
    compatibleEquipment: ["Evita V500", "Evita V800"],
    relatedErrorCodes: ["Error 22", "Exhalation Valve Stuck", "PEEP Regulation Error"],
    description:
      "Electronically controlled exhalation valve. Regulates PEEP and expiratory flow. Requires calibration after replacement.",
    avgPrice: 980,
    criticality: "critical",
    supplierIds: ["sup_002", "sup_004", "sup_007"],
  },
  {
    id: "part_004",
    name: "O2 Sensor Cell",
    partNumber: "MDT-10005650",
    category: "ventilators",
    manufacturer: "Medtronic",
    compatibleEquipment: ["PB980", "PB840"],
    relatedErrorCodes: ["O2 Sensor Expired", "FiO2 Calibration Fail", "O2 Cell Low"],
    description:
      "Galvanic oxygen sensor cell for Medtronic Puritan Bennett ventilators. Consumable with ~1 year lifespan.",
    avgPrice: 310,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_004", "sup_007"],
  },
  {
    id: "part_005",
    name: "Ventilator Display Board",
    partNumber: "HAM-159220",
    category: "ventilators",
    manufacturer: "Hamilton",
    compatibleEquipment: ["Hamilton C6", "Hamilton C3"],
    relatedErrorCodes: ["Display Blank", "Touchscreen Unresponsive", "Boot Failure"],
    description:
      "Main display and touchscreen controller board for Hamilton C6/C3 ventilators. Includes LCD driver circuitry.",
    avgPrice: 3200,
    criticality: "critical",
    supplierIds: ["sup_002", "sup_004"],
  },

  // ---- Patient Monitors ----
  {
    id: "part_006",
    name: "Display Panel LCD Assembly",
    partNumber: "PHI-453564243681",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800", "IntelliVue MX700"],
    relatedErrorCodes: ["No Display", "Screen Black", "Backlight Failure", "LCD Artifacts"],
    description:
      "19-inch TFT LCD display assembly for Philips IntelliVue MX800/MX700 patient monitors. Includes backlight and controller.",
    avgPrice: 2800,
    criticality: "high",
    supplierIds: ["sup_001", "sup_003", "sup_007"],
  },
  {
    id: "part_007",
    name: "SpO2 Module M1020B",
    partNumber: "PHI-M1020B",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800", "IntelliVue MX700", "IntelliVue MX600"],
    relatedErrorCodes: ["SpO2 No Signal", "SpO2 Module Failure", "Sensor Disconnect"],
    description:
      "Pulse oximetry measurement module for Philips IntelliVue monitors. Plug-in module with Nellcor-compatible sensor interface.",
    avgPrice: 1450,
    criticality: "high",
    supplierIds: ["sup_001", "sup_003", "sup_006"],
  },
  {
    id: "part_008",
    name: "ECG Trunk Cable 5-Lead",
    partNumber: "PHI-M1668A",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800", "IntelliVue MX700", "IntelliVue MX600", "IntelliVue MP70"],
    relatedErrorCodes: ["ECG Lead Fault", "ECG No Signal", "Lead Off"],
    description:
      "5-lead ECG trunk cable assembly for Philips IntelliVue monitors. AAMI/IEC compatible with snap connectors.",
    avgPrice: 380,
    criticality: "medium",
    supplierIds: ["sup_001", "sup_003", "sup_006", "sup_007"],
  },
  {
    id: "part_009",
    name: "Main System Board",
    partNumber: "PHI-453564175631",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800"],
    relatedErrorCodes: ["System Boot Failure", "No Power", "System Crash", "Error 401"],
    description:
      "Main processor board for IntelliVue MX800. Controls all monitor functions including network connectivity and parameter processing.",
    avgPrice: 4500,
    criticality: "high",
    supplierIds: ["sup_001", "sup_003"],
  },
  {
    id: "part_010",
    name: "Monitor Battery Pack",
    partNumber: "GE-2037103-002",
    category: "monitors",
    manufacturer: "GE",
    compatibleEquipment: ["CARESCAPE B650", "CARESCAPE B450"],
    relatedErrorCodes: ["Battery Low", "Battery Not Charging", "Battery Failure", "No Backup Power"],
    description:
      "Lithium-ion battery pack for GE CARESCAPE B-series monitors. Provides backup power during patient transport.",
    avgPrice: 340,
    criticality: "medium",
    supplierIds: ["sup_003", "sup_006", "sup_007"],
  },

  // ---- CT/MRI Imaging ----
  {
    id: "part_011",
    name: "X-Ray Tube Assembly",
    partNumber: "GE-2350400-2",
    category: "imaging",
    manufacturer: "GE",
    compatibleEquipment: ["Optima CT660", "Revolution CT"],
    relatedErrorCodes: ["Tube Arc Fault", "mA Calibration Error", "Tube Warm-Up Failure", "Anode Overheat"],
    description:
      "High-performance rotating anode X-ray tube for GE CT scanners. Rated for 6.3 MHU anode heat capacity. Critical component requiring factory calibration.",
    avgPrice: 95000,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_005"],
  },
  {
    id: "part_012",
    name: "CT Detector Array Module",
    partNumber: "GE-5131878",
    category: "imaging",
    manufacturer: "GE",
    compatibleEquipment: ["Optima CT660"],
    relatedErrorCodes: ["Detector Calibration Fail", "Ring Artifact", "Channel Dropout"],
    description:
      "64-slice solid-state detector array module for GE Optima CT660. Replaces individual detector rows for ring artifact correction.",
    avgPrice: 42000,
    criticality: "high",
    supplierIds: ["sup_001", "sup_005"],
  },
  {
    id: "part_013",
    name: "CT Cooling Pump Assembly",
    partNumber: "GE-2266588",
    category: "imaging",
    manufacturer: "GE",
    compatibleEquipment: ["Optima CT660", "Revolution CT", "LightSpeed VCT"],
    relatedErrorCodes: ["Cooling System Fault", "Tube Overheat", "Pump Pressure Low"],
    description:
      "Recirculating coolant pump assembly for GE CT scanner tube cooling systems. Maintains tube operating temperature during extended scanning.",
    avgPrice: 8500,
    criticality: "high",
    supplierIds: ["sup_001", "sup_004", "sup_005"],
  },
  {
    id: "part_014",
    name: "CT Slip Ring Assembly",
    partNumber: "SMN-10092745",
    category: "imaging",
    manufacturer: "Siemens",
    compatibleEquipment: ["SOMATOM Force", "SOMATOM Definition"],
    relatedErrorCodes: ["Gantry Communication Error", "Slip Ring Arc", "Data Transfer Fault"],
    description:
      "Gantry slip ring assembly for Siemens SOMATOM CT scanners. Provides continuous electrical connection during gantry rotation.",
    avgPrice: 28000,
    criticality: "high",
    supplierIds: ["sup_004", "sup_005"],
  },

  // ---- Defibrillators ----
  {
    id: "part_015",
    name: "Defibrillator Battery Pack",
    partNumber: "ZOLL-8019-0535-01",
    category: "defibrillators",
    manufacturer: "Zoll",
    compatibleEquipment: ["R Series", "R Series Plus"],
    relatedErrorCodes: ["Battery Low", "Battery Not Charging", "Battery Light Flashing", "No Power"],
    description:
      "SurePower rechargeable lithium-ion battery for Zoll R Series defibrillators. 5.8Ah capacity, provides approximately 300 shocks or 5 hours monitoring.",
    avgPrice: 450,
    criticality: "critical",
    supplierIds: ["sup_004", "sup_005", "sup_006"],
  },
  {
    id: "part_016",
    name: "Paddle Assembly - Internal/External",
    partNumber: "ZOLL-8011-0204-01",
    category: "defibrillators",
    manufacturer: "Zoll",
    compatibleEquipment: ["R Series", "R Series Plus", "M Series"],
    relatedErrorCodes: ["Paddle Error", "High Impedance", "Paddle Contact Fault"],
    description:
      "Multifunction hard paddle assembly for Zoll R Series. Includes both internal and external paddles with integrated ECG electrodes.",
    avgPrice: 1200,
    criticality: "critical",
    supplierIds: ["sup_004", "sup_005"],
  },
  {
    id: "part_017",
    name: "Defibrillator Capacitor Module",
    partNumber: "ZOLL-9650-0801-01",
    category: "defibrillators",
    manufacturer: "Zoll",
    compatibleEquipment: ["R Series", "M Series"],
    relatedErrorCodes: ["Charge Failure", "Energy Delivery Error", "Capacitor Test Fail"],
    description:
      "High-voltage discharge capacitor module for Zoll defibrillators. Stores energy for biphasic defibrillation waveform delivery.",
    avgPrice: 2100,
    criticality: "critical",
    supplierIds: ["sup_005", "sup_006"],
  },
  {
    id: "part_018",
    name: "Defibrillator Display Screen",
    partNumber: "PHI-M3535-60010",
    category: "defibrillators",
    manufacturer: "Philips",
    compatibleEquipment: ["HeartStart MRx", "HeartStart XL+"],
    relatedErrorCodes: ["Display Blank", "Screen Cracked", "Display Flickering"],
    description:
      "Replacement LCD display assembly for Philips HeartStart MRx defibrillator/monitor. Sunlight-readable with LED backlight.",
    avgPrice: 1650,
    criticality: "high",
    supplierIds: ["sup_004", "sup_005", "sup_006"],
  },

  // ---- Infusion Pumps ----
  {
    id: "part_019",
    name: "Pump Mechanism Assembly",
    partNumber: "BAX-35700BAX2F",
    category: "infusion",
    manufacturer: "Baxter",
    compatibleEquipment: ["Sigma Spectrum", "Sigma Spectrum IQ"],
    relatedErrorCodes: ["Pump Mechanism Fault", "Occlusion Alarm Persistent", "Motor Stall"],
    description:
      "Peristaltic pump mechanism assembly for Baxter Sigma Spectrum infusion pumps. Includes motor, cam assembly, and door latch mechanism.",
    avgPrice: 680,
    criticality: "high",
    supplierIds: ["sup_003", "sup_006", "sup_007"],
  },
  {
    id: "part_020",
    name: "Pressure Sensor Module",
    partNumber: "BAX-35162BAX",
    category: "infusion",
    manufacturer: "Baxter",
    compatibleEquipment: ["Sigma Spectrum", "Sigma Spectrum IQ"],
    relatedErrorCodes: ["Pressure Sensor Error", "Upstream Occlusion", "Air-In-Line Alarm"],
    description:
      "Inline pressure transducer module for Baxter Sigma Spectrum. Detects upstream and downstream occlusions and air-in-line conditions.",
    avgPrice: 520,
    criticality: "high",
    supplierIds: ["sup_003", "sup_006"],
  },
  {
    id: "part_021",
    name: "Infusion Pump Battery",
    partNumber: "BD-8015-8085",
    category: "infusion",
    manufacturer: "BD",
    compatibleEquipment: ["Alaris 8015", "Alaris 8100"],
    relatedErrorCodes: ["Battery Depleted", "Battery Not Detected", "Low Battery Warning"],
    description:
      "Rechargeable NiMH battery module for BD Alaris infusion pump system. Provides 8+ hours of operation on full charge.",
    avgPrice: 280,
    criticality: "medium",
    supplierIds: ["sup_003", "sup_006", "sup_007"],
  },
  {
    id: "part_022",
    name: "IV Tubing Set with SmartSite",
    partNumber: "BAX-2N8399",
    category: "infusion",
    manufacturer: "Baxter",
    compatibleEquipment: ["Sigma Spectrum", "Sigma Spectrum IQ", "FLO-GARD 6201"],
    relatedErrorCodes: ["Door Open Alarm", "Tubing Misload", "Flow Rate Error"],
    description:
      "Primary IV administration set with SmartSite needle-free valve. Standard bore tubing compatible with Sigma Spectrum pump mechanism.",
    avgPrice: 45,
    criticality: "low",
    supplierIds: ["sup_003", "sup_006", "sup_007"],
  },

  // ---- Anesthesia ----
  {
    id: "part_023",
    name: "Sevoflurane Vaporizer",
    partNumber: "DRG-6871180",
    category: "anesthesia",
    manufacturer: "Drager",
    compatibleEquipment: ["Fabius GS", "Fabius GS Premium", "Perseus A500"],
    relatedErrorCodes: ["Vaporizer Error", "Agent Concentration Fault", "Vaporizer Not Detected"],
    description:
      "Sevoflurane agent-specific vaporizer for Drager anesthesia machines. Temperature-compensated, flow-over design with interlock mount.",
    avgPrice: 4800,
    criticality: "critical",
    supplierIds: ["sup_002", "sup_007"],
  },
  {
    id: "part_024",
    name: "CO2 Absorber Canister",
    partNumber: "DRG-6870960",
    category: "anesthesia",
    manufacturer: "Drager",
    compatibleEquipment: ["Fabius GS", "Fabius GS Premium", "Fabius Tiro"],
    relatedErrorCodes: ["CO2 Absorber Exhausted", "Inspired CO2 High", "Absorbent Color Change"],
    description:
      "Pre-filled CO2 absorber canister with Drägersorb 800+ for Drager anesthesia breathing circuits. Color-indicating soda lime.",
    avgPrice: 85,
    criticality: "medium",
    supplierIds: ["sup_002", "sup_007"],
  },
  {
    id: "part_025",
    name: "Anesthesia Flow Sensor",
    partNumber: "GE-1503-3855-000",
    category: "anesthesia",
    manufacturer: "GE",
    compatibleEquipment: ["Aisys CS2", "Avance CS2"],
    relatedErrorCodes: ["Flow Sensor Fault", "Tidal Volume Inaccurate", "Spirometry Error"],
    description:
      "D-lite flow sensor for GE Aisys/Avance anesthesia machines. Measures airway flow and pressure for volume and pressure monitoring.",
    avgPrice: 350,
    criticality: "high",
    supplierIds: ["sup_002", "sup_007"],
  },
  {
    id: "part_026",
    name: "Ventilator Bellows Assembly",
    partNumber: "GE-1406-8202-000",
    category: "anesthesia",
    manufacturer: "GE",
    compatibleEquipment: ["Aisys CS2", "Avance CS2", "Aestiva 5"],
    relatedErrorCodes: ["Bellows Leak", "Bellows Not Rising", "Volume Delivery Error", "Circuit Leak"],
    description:
      "Ascending bellows assembly for GE anesthesia machine ventilator. Silicone bellows with integrated check valve for leak-free operation.",
    avgPrice: 1100,
    criticality: "critical",
    supplierIds: ["sup_002", "sup_007"],
  },
  {
    id: "part_027",
    name: "Patient Monitor Power Supply",
    partNumber: "PHI-453564020911",
    category: "monitors",
    manufacturer: "Philips",
    compatibleEquipment: ["IntelliVue MX800", "IntelliVue MX700"],
    relatedErrorCodes: ["No Power", "Power Supply Failure", "Intermittent Shutdown"],
    description:
      "AC/DC power supply module for Philips IntelliVue MX800/MX700 monitors. Provides regulated voltages for all monitor subsystems.",
    avgPrice: 890,
    criticality: "high",
    supplierIds: ["sup_001", "sup_003", "sup_007"],
  },
  {
    id: "part_028",
    name: "Ventilator Compressor Module",
    partNumber: "MDT-10004997",
    category: "ventilators",
    manufacturer: "Medtronic",
    compatibleEquipment: ["PB980"],
    relatedErrorCodes: ["Compressor Failure", "Low Pressure Alarm", "Turbine Fault"],
    description:
      "Internal turbine compressor module for Medtronic PB980 ventilator. Provides compressed air for ventilation when wall air is unavailable.",
    avgPrice: 3800,
    criticality: "critical",
    supplierIds: ["sup_001", "sup_002", "sup_004"],
  },
];

// ---------------------------------------------------------------------------
// Repair Guides
// ---------------------------------------------------------------------------

const repairGuides: RepairGuide[] = [
  {
    partId: "part_001",
    partNumber: "DRG-8306750",
    title: "Drager Evita V500/V800 — Fan Module Replacement",
    estimatedTime: "45–60 minutes",
    difficulty: "moderate",
    safetyWarnings: [
      "Disconnect the ventilator from the patient and switch to a backup ventilator before servicing.",
      "Unplug from mains power and wait 30 seconds for capacitors to discharge.",
      "Wear an ESD wrist strap — the main PCB is static-sensitive.",
    ],
    tools: [
      "T10 / T15 Torx screwdrivers",
      "ESD wrist strap",
      "Compressed air can",
      "Multimeter (optional, for verifying fan connector voltage)",
    ],
    steps: [
      "Power down the ventilator and disconnect from mains. Move to a clean, static-safe work surface.",
      "Remove the rear service panel (6× T10 Torx screws). Set screws aside — they are different lengths for top vs. bottom.",
      "Locate the fan module in the lower-left compartment. It is a black square assembly with a 4-pin connector.",
      "Disconnect the 4-pin fan cable from header J14 on the main PCB. Squeeze the latch before pulling — do not force it.",
      "Remove the 4× T15 Torx screws securing the fan module to the chassis bracket.",
      "Lift the old fan module out. Use compressed air to clear any dust from the compartment before installing the new one.",
      "Seat the new fan module into the bracket and secure with the 4× T15 screws. Torque to 0.8 Nm.",
      "Reconnect the 4-pin cable to header J14 — you should hear the latch click.",
      "Reattach the rear panel. Power on and enter the service menu (hold INFO + ALARM SILENCE during boot).",
      "Run the built-in Fan Test from Service > Hardware Tests > Fan Module. Confirm no Error 57/58 codes and fan RPM reads 2800–3200.",
    ],
  },
  {
    partId: "part_006",
    partNumber: "PHI-453564243681",
    title: "Philips IntelliVue MX800 — LCD Display Replacement",
    estimatedTime: "30–45 minutes",
    difficulty: "moderate",
    safetyWarnings: [
      "Disconnect the monitor from the patient before servicing.",
      "Unplug power cord. The internal battery will continue to supply power — press and hold the power button for 5 seconds to fully shut down.",
      "Handle the LCD panel by its edges only — fingerprints on the display surface can cause permanent marks.",
    ],
    tools: [
      "Phillips #2 screwdriver",
      "Plastic spudger (for prying bezels without scratching)",
      "Microfiber cloth",
      "ESD wrist strap",
    ],
    steps: [
      "Power off the monitor fully (hold power button 5 seconds). Disconnect power cord and all patient cables.",
      "Place monitor face-down on a soft surface. Remove the 4× Phillips screws from the rear housing.",
      "Carefully separate the rear housing from the front bezel. Start at the bottom edge and work around with a plastic spudger.",
      "Disconnect the LCD ribbon cable from connector J3 on the video board. Flip the ZIF latch up first, then slide the ribbon out.",
      "Disconnect the backlight power cable (2-pin white connector near the top of the panel).",
      "Remove the 6× Phillips screws holding the LCD panel to the bezel frame. Lift the old panel out.",
      "Clean the bezel frame with a microfiber cloth. Place the new LCD panel and secure with the 6 screws.",
      "Reconnect the backlight power cable and the LCD ribbon cable (slide in, then press ZIF latch down).",
      "Reassemble the rear housing and tighten the 4 screws.",
      "Power on. The display should show the Philips boot logo within 10 seconds. If you see artifacts or no display, reseat the ribbon cable.",
    ],
  },
  {
    partId: "part_011",
    partNumber: "GE-2350400-2",
    title: "GE Optima CT660 — X-Ray Tube Replacement",
    estimatedTime: "4–6 hours",
    difficulty: "advanced",
    safetyWarnings: [
      "This procedure requires a GE-certified field service engineer. High voltages (up to 140kV) are present in the tube housing.",
      "Allow the tube to cool for at least 2 hours before removal — the anode can exceed 200°C.",
      "Wear lead-lined gloves and follow facility radiation safety protocols when handling the tube assembly.",
      "The tube assembly weighs approximately 65 lbs (30 kg) — use a tube lift sling for safe handling.",
    ],
    tools: [
      "GE CT Service Key + Service software login",
      "Tube lift sling rated for 100 lbs",
      "13mm, 15mm, 17mm socket set",
      "Torque wrench (for HV cable connections)",
      "Coolant drain pan and 5 gallons of GE-approved CT coolant",
      "Multimeter rated for high voltage",
    ],
    steps: [
      "Shut down the CT system via the operator console. Turn off the main circuit breaker and lock-out/tag-out per facility policy.",
      "Open the gantry covers (left and right side panels). Drain the tube cooling loop into the drain pan by disconnecting the coolant lines at the quick-disconnect fittings.",
      "Disconnect the high-voltage cables from the tube housing — the cathode cable (marked −) and anode cable (marked +). Use insulated tools.",
      "Disconnect the stator drive cable and the rotor sense cable from the tube housing connectors.",
      "Attach the tube lift sling to the two lifting points on the tube housing. Support the full weight before removing mounting bolts.",
      "Remove the 4× 17mm mounting bolts that secure the tube housing to the gantry cradle.",
      "Using the lift sling, carefully lower the old tube out of the gantry. Set on a padded surface.",
      "Position the new tube assembly in the cradle using the lift sling. Align the mounting holes and hand-start all 4 bolts before torquing.",
      "Torque mounting bolts to 45 Nm in a cross pattern. Reconnect stator, rotor sense, and HV cables.",
      "Reconnect coolant lines and refill the cooling system with GE-approved coolant. Bleed air from the system.",
      "Run the GE CT tube conditioning protocol from the service console — this gradually seasons the new tube with increasing kV/mA exposures over approximately 30 minutes.",
      "Perform a full calibration: air calibration, detector calibration, and mA linearity check. Verify no arc fault or mA calibration errors.",
    ],
  },
  {
    partId: "part_015",
    partNumber: "ZOLL-8019-0535-01",
    title: "Zoll R Series — Battery Pack Replacement",
    estimatedTime: "5–10 minutes",
    difficulty: "easy",
    safetyWarnings: [
      "Remove the defibrillator from clinical use before swapping the battery.",
      "Do not dispose of lithium-ion batteries in regular trash. Follow your facility's hazardous waste disposal protocol.",
    ],
    tools: [
      "No tools required — the battery is tool-free, slide-in design",
    ],
    steps: [
      "Power off the defibrillator by pressing and holding the power button for 3 seconds.",
      "Turn the unit over. Locate the battery compartment on the bottom rear of the device.",
      "Slide the battery release latch to the UNLOCK position (slide toward the arrow icon).",
      "Slide the old battery pack out of the compartment.",
      "Inspect the battery bay contacts for corrosion or debris. Wipe clean with a dry cloth if needed.",
      "Slide the new SurePower battery into the compartment until it clicks into the locked position.",
      "Turn the unit upright and power on. Verify the battery icon on screen shows a full charge (4 bars).",
      "Run a quick self-test: press and hold the ANALYZE button to trigger the automatic test sequence. Confirm 'PASS' on screen.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Service Manuals
// ---------------------------------------------------------------------------

const serviceManuals: ServiceManual[] = [
  {
    manualId: "manual_evita_v500",
    title: "Drager Evita V500 Technical Service Manual",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    compatibleModels: ["Evita V500", "Evita V800"],
    revision: "Rev 4.2, 2023-06",
    totalPages: 312,
    sections: [
      {
        sectionId: "ev500_1_1",
        title: "1.1 Safety Information",
        content: "This manual is intended for qualified biomedical technicians trained on Drager ventilator systems. All repairs must be performed with the ventilator disconnected from the patient. A backup ventilator must be available before any service procedure begins. High voltages (up to 240 VAC) are present inside the unit even after power switch is turned off — always disconnect mains power and wait 30 seconds for capacitor discharge.",
        warnings: [
          "DANGER: Disconnect the ventilator from the patient before any service procedure. Patient death or serious injury may result from servicing a ventilator while connected to a patient.",
          "WARNING: Internal capacitors retain charge for up to 30 seconds after mains disconnection. Wait a minimum of 30 seconds before opening any service panel.",
          "CAUTION: Use ESD protection when handling circuit boards. Static discharge can cause latent damage that may not be immediately apparent."
        ],
      },
      {
        sectionId: "ev500_3_1",
        title: "3.1 Cooling System Overview",
        content: "The Evita V500 uses a forced-air cooling system consisting of a primary fan module (P/N DRG-8306750) mounted in the lower-left compartment and a secondary convection path through the upper ventilation slots. The fan operates at 2800–3200 RPM under normal load. Airflow is routed across the main PCB, power supply, and oxygen sensor module. The fan draws 12 VDC from header J14 on the main PCB. Fan failure triggers Error 57 (fan speed below threshold) or Error 58 (fan not detected). The system will continue to operate for up to 15 minutes after fan failure before initiating a thermal shutdown.",
        specifications: [
          { parameter: "Fan operating speed", value: "3000", tolerance: "+/- 200", unit: "RPM" },
          { parameter: "Fan supply voltage", value: "12", tolerance: "+/- 0.5", unit: "VDC" },
          { parameter: "Fan current draw", value: "0.35", tolerance: "+/- 0.05", unit: "A" },
          { parameter: "Thermal shutdown threshold", value: "65", unit: "°C" },
          { parameter: "Fan connector", value: "J14, 4-pin Molex", unit: "" },
        ],
        figures: [
          { figureId: "fig_3_1", description: "Cooling system airflow diagram showing fan module location, airflow path across PCB and power supply, and exhaust through upper ventilation slots" },
        ],
      },
      {
        sectionId: "ev500_3_7",
        title: "3.7 Fan Module Replacement",
        content: "This procedure describes removal and installation of the primary cooling fan module (P/N DRG-8306750). Estimated time: 45–60 minutes for a trained technician. The fan module is a field-replaceable unit (FRU) that does not require factory calibration after installation.",
        tools: [
          "T10 Torx screwdriver",
          "T15 Torx screwdriver",
          "ESD wrist strap",
          "Compressed air can",
          "Multimeter (for verifying fan connector voltage)",
          "Torque driver set to 0.8 Nm",
        ],
        warnings: [
          "CAUTION: The rear panel screws are different lengths — top row screws are 12mm, bottom row are 16mm. Mixing them can strip the chassis threads.",
          "CAUTION: Do not force the fan connector. The latch must be squeezed before removal. Forcing the connector damages pin J14-3 (tachometer signal).",
        ],
        steps: [
          "Power down the ventilator and disconnect from mains. Move to a clean, static-safe work surface.",
          "Remove the rear service panel (6× T10 Torx screws). Note: top row screws are 12mm, bottom row are 16mm — do not interchange.",
          "Locate the fan module in the lower-left compartment. It is a black square assembly (80mm × 80mm × 25mm) with a 4-pin Molex connector.",
          "Disconnect the 4-pin fan cable from header J14 on the main PCB. Squeeze the latch tab before pulling — do not force.",
          "Remove the 4× T15 Torx screws securing the fan module to the chassis bracket.",
          "Lift the old fan module out. Inspect the compartment for dust accumulation. Use compressed air to clear debris (blow away from the PCB, not toward it).",
          "Seat the new fan module into the bracket with the label facing inward (toward the PCB). The airflow arrow on the fan housing should point upward.",
          "Secure with 4× T15 screws. Torque to 0.8 Nm — do not overtorque.",
          "Reconnect the 4-pin cable to header J14. You should hear/feel the latch click.",
          "Before reassembling the rear panel, verify fan operation: connect mains power and turn on. Visually confirm the fan spins. Measure voltage at J14: pins 1-2 should read 12 VDC (+/- 0.5V).",
          "Reattach the rear panel (6× T10 screws, correct lengths in correct positions).",
          "Enter the service menu: hold INFO + ALARM SILENCE during boot. Navigate to Service > Hardware Tests > Fan Module.",
          "Run the Fan Test. Verify: no Error 57/58 codes, fan RPM reads between 2800–3200, fan current reads 0.30–0.40 A.",
        ],
        specifications: [
          { parameter: "Fan mounting torque", value: "0.8", unit: "Nm" },
          { parameter: "Post-install RPM (acceptable range)", value: "2800–3200", unit: "RPM" },
          { parameter: "Post-install current (acceptable range)", value: "0.30–0.40", unit: "A" },
          { parameter: "Fan module dimensions", value: "80 × 80 × 25", unit: "mm" },
          { parameter: "Rear panel screw (top row)", value: "12", unit: "mm" },
          { parameter: "Rear panel screw (bottom row)", value: "16", unit: "mm" },
        ],
      },
      {
        sectionId: "ev500_3_8",
        title: "3.8 Flow Sensor Calibration",
        content: "After replacing the flow sensor assembly (P/N DRG-8403735), a two-point calibration must be performed. The flow sensor uses a differential pressure transducer to measure inspiratory and expiratory flow. Calibration requires a certified 1-liter calibration syringe (Drager P/N 8403741 or equivalent). The calibration procedure compensates for manufacturing variations in the sensor orifice diameter.",
        specifications: [
          { parameter: "Calibration syringe volume", value: "1.000", tolerance: "+/- 0.005", unit: "L" },
          { parameter: "Acceptable tidal volume error post-calibration", value: "+/- 10", unit: "mL (at 500 mL test volume)" },
          { parameter: "Flow sensor operating range", value: "0–180", unit: "L/min" },
          { parameter: "Sensor zero drift (max allowed)", value: "+/- 2", unit: "mL/min" },
        ],
        tools: [
          "Certified 1-liter calibration syringe (P/N 8403741 or equivalent)",
          "Test lung (adult, 1L compliance)",
        ],
        steps: [
          "Install the new flow sensor in the patient wye. Ensure the arrow on the sensor points toward the patient port.",
          "Connect a test lung to the patient port.",
          "Enter Service > Calibration > Flow Sensor from the service menu.",
          "When prompted, disconnect the calibration syringe and allow the sensor to zero. Press CONFIRM when the zero reading stabilizes (should read 0 +/- 2 mL/min).",
          "Connect the calibration syringe to the sensor inlet. When prompted, deliver exactly 1 liter by fully depressing the syringe plunger in a smooth, steady stroke (approximately 1 second).",
          "The system will display the measured volume. Acceptable range: 990–1010 mL. If outside range, repeat the stroke.",
          "Press CONFIRM to store the calibration. Run a verification breath with the test lung at 500 mL — displayed tidal volume should read 490–510 mL.",
        ],
        warnings: [
          "CAUTION: The flow sensor is orientation-sensitive. Installing it backward will cause inverted flow readings and incorrect tidal volume delivery.",
          "WARNING: Do not use the ventilator on a patient if post-calibration verification exceeds +/- 10 mL at 500 mL test volume.",
        ],
      },
      {
        sectionId: "ev500_2_1",
        title: "2.1 System Architecture Overview",
        content: "The Evita V500 is a microprocessor-controlled, pneumatically driven ICU ventilator. The system consists of five major subsystems: (1) the pneumatic system, which receives compressed medical air and oxygen from pipeline or cylinder sources, regulates supply pressure through dual-stage regulators, and delivers gas via proportional solenoid valves controlled by the main processor; (2) the electronic control system, built around a dual-processor architecture (main CPU for ventilation control, secondary CPU for alarm monitoring) on the main PCB, which reads flow sensors, pressure transducers, and O2 cell data at 200 Hz to control breath delivery; (3) the patient breathing circuit interface, consisting of the inspiratory outlet, expiratory inlet with proximal flow sensor, and electronically controlled exhalation valve; (4) the user interface with a 12-inch color TFT touchscreen, rotary encoder, and hardkey panel; (5) the cooling and power subsystem. The ventilator supports all standard ventilation modes: VC-CMV, VC-SIMV, PC-CMV, PC-SIMV, PC-BIPAP, CPAP/ASB, and optional modes APRV and SmartCare. Power is supplied by an internal AC/DC converter (100-240 VAC input) with an internal lithium-ion backup battery providing approximately 30 minutes of operation during power failure.",
        specifications: [
          { parameter: "Supply gas pressure (pipeline)", value: "43-87", unit: "PSI (3-6 bar)" },
          { parameter: "Supply gas pressure (cylinder)", value: "up to 2200", unit: "PSI (150 bar)" },
          { parameter: "Tidal volume range", value: "20-2000", unit: "mL" },
          { parameter: "Respiratory rate range", value: "2-100", unit: "breaths/min" },
          { parameter: "PEEP range", value: "0-50", unit: "cmH2O" },
          { parameter: "FiO2 range", value: "21-100", unit: "%" },
          { parameter: "Maximum inspiratory pressure", value: "80", unit: "cmH2O" },
          { parameter: "Power consumption", value: "200", unit: "VA max" },
          { parameter: "Battery backup duration", value: "~30", unit: "minutes" },
          { parameter: "Weight", value: "28", unit: "kg (without accessories)" },
          { parameter: "Main processor", value: "ARM Cortex-A9, 800 MHz", unit: "" },
          { parameter: "Sensor sampling rate", value: "200", unit: "Hz" },
        ],
      },
      {
        sectionId: "ev500_3_2",
        title: "3.2 Exhalation Valve Replacement",
        content: "The exhalation valve assembly (P/N DRG-8412130) is an electronically controlled proportional valve that regulates PEEP and expiratory flow. The valve uses a silicone diaphragm actuated by a solenoid to modulate the expiratory orifice area. The diaphragm is the primary wear component — it softens and deforms over time, causing PEEP regulation errors (Error 22). The valve is a field-replaceable unit (FRU) mounted on the pneumatic block on the left side of the ventilator. After replacement, a PEEP calibration and system leak test are mandatory.",
        tools: [
          "T10 / T15 Torx screwdrivers",
          "ESD wrist strap",
          "Torque driver set to 1.0 Nm",
          "Adult test lung (1L compliance)",
          "Calibrated pressure manometer (0-100 cmH2O, +/- 0.5 cmH2O)",
        ],
        warnings: [
          "WARNING: The exhalation valve regulates PEEP and expiratory flow. Incorrect installation can cause uncontrolled PEEP or inability to exhale — this is immediately life-threatening.",
          "CAUTION: Do not force the valve assembly into the pneumatic block. The alignment pins must engage before pushing the assembly home. Cocking the assembly sideways will damage the O-ring seals.",
          "CAUTION: The electrical connector (J22) is a 6-pin type. Note orientation before disconnecting.",
        ],
        steps: [
          "Transfer patient to backup ventilator. Power down Evita V500, disconnect mains, wait 30 seconds.",
          "Remove the expiratory port cover by pressing the two side release tabs and pulling forward.",
          "Disconnect the expiratory limb from the exhalation valve housing.",
          "Disconnect the 6-pin electrical connector from J22 on the exhalation valve solenoid. Squeeze the latch tab.",
          "Remove 3x T15 Torx screws securing the valve to the pneumatic block (triangular pattern).",
          "Pull the valve assembly straight out. Inspect pneumatic block seat faces for scoring or debris. Replace O-rings if they remained on the block.",
          "Verify new O-rings seated in grooves on the replacement valve.",
          "Align new valve with the pneumatic block. Push firmly until flush — do not cock sideways.",
          "Install 3x T15 screws, torque to 1.0 Nm in star pattern.",
          "Reconnect 6-pin connector to J22. Confirm latch clicks.",
          "Reattach expiratory port cover.",
          "Connect test lung, power on. Enter service menu (hold INFO + ALARM SILENCE during boot).",
          "Navigate to Service > Calibration > Exhalation Valve. The system runs automated PEEP calibration at 5, 10, 15, and 20 cmH2O.",
          "Monitor with external manometer — each PEEP level must be within +/- 1 cmH2O of set value.",
          "Run system leak test from Service > Hardware Tests > Leak Test. Leak must be < 200 mL/min at 30 cmH2O.",
          "Verify no Error 22 codes during 5-minute test ventilation at PEEP 10 cmH2O.",
        ],
        specifications: [
          { parameter: "PEEP accuracy (post-calibration)", value: "+/- 1", unit: "cmH2O" },
          { parameter: "Valve diaphragm material", value: "Medical-grade silicone", unit: "" },
          { parameter: "Mounting torque", value: "1.0", unit: "Nm" },
          { parameter: "Acceptable system leak rate", value: "< 200", unit: "mL/min at 30 cmH2O" },
          { parameter: "Electrical connector", value: "J22, 6-pin", unit: "" },
        ],
      },
      {
        sectionId: "ev500_3_5",
        title: "3.5 Power Supply and Battery Backup",
        content: "The Evita V500 power subsystem consists of an AC/DC power supply module, a lithium-ion backup battery, and a battery management circuit. The power supply accepts 100-240 VAC at 50/60 Hz and produces four internal DC rails: +24V (pneumatic valve drivers and fan), +12V (sensors and analog circuits), +5V (logic), and +3.3V (processor core). The backup battery is a 14.4V 4.4Ah lithium-ion pack located behind the lower-left service panel. During mains power loss, the battery management circuit switches to battery power within 10 ms — no interruption to ventilation. The battery provides approximately 30 minutes of operation at typical settings (Vt 500 mL, rate 14, PEEP 5, FiO2 40%). A battery capacity below 60% triggers a low battery technical alarm; below 20% triggers a high-priority alarm with audible tone.",
        specifications: [
          { parameter: "AC input", value: "100-240 VAC, 50/60 Hz", unit: "" },
          { parameter: "+24V rail", value: "24.0", tolerance: "+/- 0.5", unit: "VDC" },
          { parameter: "+12V rail", value: "12.0", tolerance: "+/- 0.3", unit: "VDC" },
          { parameter: "+5V rail", value: "5.0", tolerance: "+/- 0.25", unit: "VDC" },
          { parameter: "+3.3V rail", value: "3.3", tolerance: "+/- 0.15", unit: "VDC" },
          { parameter: "Battery voltage", value: "14.4", unit: "VDC nominal" },
          { parameter: "Battery capacity", value: "4.4", unit: "Ah" },
          { parameter: "Switchover time", value: "< 10", unit: "ms" },
          { parameter: "Battery runtime (typical)", value: "~30", unit: "minutes" },
          { parameter: "Low battery alarm", value: "60%", unit: "state of charge" },
          { parameter: "Critical battery alarm", value: "20%", unit: "state of charge" },
        ],
        warnings: [
          "DANGER: Mains voltage present at the AC inlet. Always disconnect power cord before servicing the power supply.",
          "WARNING: The battery can supply hazardous voltage. Disconnect the battery cable (connector J20 on the battery management board) before any internal work.",
          "CAUTION: Use only Drager-approved replacement battery (P/N DRG-8306920). Third-party batteries may not communicate with the battery management system and can cause fires.",
        ],
        steps: [
          "Power down and disconnect mains. Wait 30 seconds.",
          "Remove the lower-left service panel (4x T10 Torx screws).",
          "The battery is in a plastic cradle. Disconnect the battery cable from J20 on the battery management board.",
          "Slide the battery forward out of the cradle.",
          "Install the new battery, reconnect to J20.",
          "Reassemble panel, connect mains, power on.",
          "Navigate to Service > Hardware Tests > Battery. Run the capacity test — takes approximately 2 hours.",
          "Battery should report > 90% capacity when new. If below 80%, the battery may have been stored too long.",
        ],
      },
      {
        sectionId: "ev500_5_1",
        title: "5.1 Pneumatic System Leak Test",
        content: "The system leak test verifies the integrity of the entire pneumatic path from the gas inlet to the patient port. Leaks in the breathing circuit can cause tidal volume delivery errors, inability to maintain PEEP, auto-cycling, and inaccurate monitoring. The Evita V500 has both an automated leak test (accessible from the service menu) and a manual procedure. A leak rate below 200 mL/min at 30 cmH2O is acceptable for clinical use. Common leak sources include: flow sensor O-rings, exhalation valve O-rings, patient circuit connections (loose fittings), humidifier chamber seals, test port caps left open, and cracked inspiratory/expiratory tubing.",
        tools: [
          "Adult test lung with leak-free connection",
          "Breathing circuit (new, for testing)",
          "Calibrated pressure manometer (optional, for verifying displayed pressure)",
        ],
        steps: [
          "Connect a complete patient breathing circuit to the ventilator, including inspiratory limb, patient wye, and expiratory limb.",
          "Connect an adult test lung to the patient wye. Ensure all connections are hand-tight and all port caps are in place.",
          "Power on the ventilator. Enter the service menu (hold INFO + ALARM SILENCE during boot).",
          "Navigate to Service > Hardware Tests > Leak Test.",
          "The system will close the exhalation valve and pressurize the circuit to 30 cmH2O. It then monitors pressure decay over 30 seconds.",
          "The displayed leak rate must be < 200 mL/min. If the test shows PASS, the circuit is leak-free.",
          "If FAIL: systematically isolate the leak source. First, disconnect the patient circuit and cap the inspiratory and expiratory ports. Re-run the test. If it now passes, the leak is in the patient circuit. If it still fails, the leak is internal.",
          "Internal leak sources (most to least common): exhalation valve O-rings (reseat or replace valve), flow sensor O-rings (reseat or replace sensor), inspiratory outlet gasket (replace gasket), internal tubing connections (check all push-fit connectors inside the pneumatic block).",
          "External leak sources: loose breathing circuit fittings, cracked tubing, humidifier chamber gasket, open suction port cap, improperly seated water trap.",
        ],
        specifications: [
          { parameter: "Test pressure", value: "30", unit: "cmH2O" },
          { parameter: "Acceptable leak rate", value: "< 200", unit: "mL/min" },
          { parameter: "Test duration", value: "30", unit: "seconds" },
        ],
      },
      {
        sectionId: "ev500_6_1",
        title: "6.1 Preventive Maintenance Schedule",
        content: "The Drager Evita V500 requires scheduled preventive maintenance to ensure safe and reliable operation. Failure to perform PM tasks at the recommended intervals may result in device malfunction, inaccurate monitoring, or ventilation failure. All PM activities must be documented in the equipment maintenance log.",
        steps: [
          "DAILY (by clinical staff): Visual inspection — check all tubing connections, verify alarm settings, confirm backup battery icon shows adequate charge, check water traps and humidifier levels.",
          "QUARTERLY: O2 sensor cell check — navigate to Service > Sensor Status. If cell voltage < 8 mV or response time > 30 seconds, replace O2 cell (P/N varies by sensor generation). Expected cell lifespan: 12-18 months.",
          "QUARTERLY: Battery capacity check — navigate to Service > Hardware Tests > Battery. Capacity should be > 70%. If below 70%, replace battery (P/N DRG-8306920).",
          "SEMI-ANNUAL: Intake air filter replacement — remove the rear panel, replace the foam air filter (P/N DRG-8306800). A clogged filter reduces cooling airflow and contributes to fan module failure.",
          "SEMI-ANNUAL: Flow sensor calibration verification — run the flow sensor calibration procedure (Section 3.8) with a certified 1L syringe. Post-calibration accuracy must be +/- 10 mL at 500 mL test volume.",
          "ANNUAL: Full performance verification — test all ventilation modes (VC, PC, SIMV, CPAP/ASB) at multiple settings using a calibrated test lung and flow analyzer. Verify tidal volume accuracy +/- 10%, pressure accuracy +/- 2 cmH2O, rate accuracy +/- 1 BPM.",
          "ANNUAL: System leak test (Section 5.1). Leak rate must be < 200 mL/min at 30 cmH2O.",
          "ANNUAL: Electrical safety test per IEC 62353 — ground continuity, earth leakage, enclosure leakage, patient applied parts leakage. Document all results.",
          "ANNUAL: Exhalation valve inspection — remove valve assembly and inspect diaphragm for wear, discoloration, or deformation. Replace if any defects found (P/N DRG-8412130).",
          "ANNUAL: Fan module inspection — check fan RPM from Service > Hardware Tests > Fan Module. RPM must be 2800-3200. Clean dust from fan intake and chassis compartment.",
          "EVERY 2 YEARS (or per Drager recommendation): Replace the exhalation valve diaphragm even if no visible wear. Replace all internal O-rings in the pneumatic block. Replace the backup battery regardless of capacity test results.",
          "Consumable part numbers: Air filter (DRG-8306800), O2 cell (check current revision), Battery (DRG-8306920), Exhalation valve (DRG-8412130), Flow sensor (DRG-8403735), Calibration syringe (DRG-8403741).",
        ],
      },
      {
        sectionId: "ev500_4_1",
        title: "4.1 Error Code Reference",
        content: "This section lists all user-facing and service error codes for the Evita V500/V800 platform.",
        steps: [
          "Error 12: Flow measurement error. Flow sensor reading outside expected range. Check sensor orientation and calibration. Replace flow sensor (P/N DRG-8403735) if calibration fails.",
          "Error 15: O2 sensor expired. Galvanic O2 cell voltage below minimum threshold. Replace O2 sensor cell. Perform 2-point FiO2 calibration after replacement.",
          "Error 22: Exhalation valve regulation error. PEEP deviation exceeds +/- 2 cmH2O from set value. Check exhalation valve assembly (P/N DRG-8412130) for contamination or mechanical failure. Run PEEP calibration from service menu.",
          "Error 25: High airway pressure. Peak inspiratory pressure exceeded the set Pmax alarm limit. Check for kinked tubing, bronchospasm, mucus plugging, or incorrect alarm settings. If pressure is > 60 cmH2O with no patient-side cause, check the inspiratory proportional valve for sticking.",
          "Error 33: Apnea alarm. No breath detected for the apnea time interval (default 20 seconds). Check patient condition. If false alarm, check flow sensor calibration and trigger sensitivity settings.",
          "Error 41: Power supply fault. One or more internal voltage rails out of tolerance. Measure all rails at the power supply test points: +24V, +12V, +5V, +3.3V. Replace power supply module if any rail is out of spec.",
          "Error 45: Battery fault. Battery management system reports a cell imbalance, communication error, or excessive temperature. Remove and reseat battery connector J20. If error persists, replace battery (P/N DRG-8306920).",
          "Error 57: Fan speed below threshold. Cooling fan RPM dropped below 2400. Check fan connector J14, measure 12V supply. Replace fan module (P/N DRG-8306750) if voltage is correct but fan speed is low.",
          "Error 58: Fan not detected. No tachometer signal on J14 pin 3. Check connector seating first. If connector is secure, replace fan module (P/N DRG-8306750).",
          "Error 62: Touchscreen calibration lost. The touchscreen does not respond to touch correctly. Enter the service menu using the rotary encoder and hardware keys. Navigate to Service > Display > Touch Calibration and follow the on-screen calibration sequence.",
          "Error 70: Internal communication error. Main CPU and alarm CPU cannot communicate. Power cycle the ventilator. If error recurs, the main PCB may need replacement — contact Drager technical support.",
        ],
      },
      {
        sectionId: "ev500_5_2",
        title: "5.2 Alarm System Troubleshooting",
        content: "The Evita V500 has a three-tier alarm system: high-priority (red, continuous tone), medium-priority (yellow, intermittent tone), and low-priority (yellow, single tone). The alarm system is managed by a dedicated alarm CPU that operates independently from the ventilation control CPU — this is a safety architecture that ensures alarms can still trigger even if the main processor fails. Common alarm troubleshooting scenarios include false alarms, alarms not triggering when expected, and alarm volume issues.",
        steps: [
          "FALSE HIGH-PRESSURE ALARMS: Check for water in the pressure sampling line. Disconnect the sampling line from the airway pressure transducer (located on the pneumatic block) and blow through it to clear condensate. Reconnect and verify. Also check that the Pmax alarm limit is set appropriately (typically 10-15 cmH2O above the peak inspiratory pressure).",
          "FALSE APNEA ALARMS: Usually caused by flow sensor drift or low trigger sensitivity. Recalibrate the flow sensor (Section 3.8). If the patient is on pressure support with a low respiratory drive, increase the apnea time or adjust trigger sensitivity.",
          "FALSE DISCONNECT ALARMS: Check circuit connections, especially the patient wye and flow sensor. A partially dislodged flow sensor will cause intermittent disconnect alarms. Verify expired tidal volume is reading correctly.",
          "ALARM NOT AUDIBLE: Check the alarm volume setting (adjustable from the alarm menu). Minimum volume in ICU mode is 45 dB at 1 meter. If volume is set correctly but alarm is quiet, the internal speaker may have failed. Access the speaker (located behind the upper-right ventilation grille) and test with a multimeter — impedance should be 8 ohms +/- 20%. Replace speaker if open circuit or out of spec.",
          "ALARM CPU FAULT (Error 70): The dedicated alarm CPU has lost communication with the main CPU. This is a critical fault — the ventilator should be removed from clinical use. Power cycle first. If error recurs, the main PCB requires replacement.",
          "TESTING ALARMS: From the service menu, navigate to Service > Hardware Tests > Alarm Test. This cycles through all alarm tones and LED indicators. Verify red LED (high priority), yellow LED (medium priority), and audible tones at all three priority levels.",
        ],
        warnings: [
          "WARNING: Never disable alarms during clinical use. If an alarm is repeatedly triggering, investigate and resolve the root cause rather than silencing or disabling it.",
          "CAUTION: The alarm system's independent CPU architecture means that even a main processor crash will not prevent alarms from sounding. If both CPUs fail simultaneously (no alarms AND no ventilation), this indicates a power supply failure — switch to backup ventilation immediately.",
        ],
      },
    ],
  },
  {
    manualId: "manual_mx800",
    title: "Philips IntelliVue MX800 Service Guide",
    equipmentName: "IntelliVue MX800",
    manufacturer: "Philips",
    compatibleModels: ["IntelliVue MX800", "IntelliVue MX700"],
    revision: "Rev 3.1, 2022-11",
    totalPages: 278,
    sections: [
      {
        sectionId: "mx800_1_1",
        title: "1.1 General Safety",
        content: "This service guide is for use by Philips-trained biomedical engineers and technicians only. The IntelliVue MX800 contains no user-serviceable parts on the patient-facing modules — module replacement is the standard field repair. Always disconnect the monitor from the patient and remove from clinical use before opening the housing. The internal battery will continue to provide power after the AC cord is removed. Press and hold the power button for 5 seconds to perform a full shutdown.",
        warnings: [
          "WARNING: The internal battery provides backup power for up to 30 minutes. A full shutdown (power button held 5 seconds) is required before opening the housing.",
          "CAUTION: Handle LCD panels by edges only. Pressure on the display surface causes permanent pixel damage.",
          "CAUTION: The MX800 uses lead-free solder. If reflowing or soldering components, use a lead-free profile (peak 260°C).",
        ],
      },
      {
        sectionId: "mx800_5_1",
        title: "5.1 Display Subsystem Overview",
        content: "The MX800 uses a 19-inch TFT LCD display (P/N PHI-453564243681) with integrated LED backlight. The display connects to the video controller via a 40-pin LVDS ribbon cable at connector J3 on the video board. Backlight power is supplied through a separate 2-pin connector. The display resolution is 1280×1024 at 60 Hz. Common failure modes include: complete backlight failure (screen appears black but touch still works), ribbon cable fatigue (intermittent artifacts, partial display), and LCD panel cracking (physical damage).",
        specifications: [
          { parameter: "Display size", value: "19", unit: "inches (diagonal)" },
          { parameter: "Resolution", value: "1280 × 1024", unit: "pixels" },
          { parameter: "Refresh rate", value: "60", unit: "Hz" },
          { parameter: "Backlight type", value: "LED edge-lit", unit: "" },
          { parameter: "Backlight voltage", value: "19.5", tolerance: "+/- 0.5", unit: "VDC" },
          { parameter: "Ribbon cable connector", value: "J3, 40-pin ZIF", unit: "" },
          { parameter: "Backlight connector", value: "2-pin JST, white", unit: "" },
        ],
        figures: [
          { figureId: "fig_5_1", description: "Exploded view of display assembly showing LCD panel, bezel frame, ribbon cable routing, and backlight connector location" },
        ],
      },
      {
        sectionId: "mx800_5_3",
        title: "5.3 LCD Display Replacement",
        content: "This procedure covers replacement of the LCD display assembly (P/N PHI-453564243681). The display assembly includes the LCD panel, LED backlight strips, and bezel mounting frame. The video board and touch controller remain in the monitor and are not replaced with this procedure.",
        tools: [
          "Phillips #2 screwdriver",
          "Plastic spudger (non-marring pry tool)",
          "Microfiber cloth",
          "ESD wrist strap",
          "Isopropyl alcohol wipes (for cleaning bezel adhesive residue)",
        ],
        warnings: [
          "CAUTION: The ZIF (Zero Insertion Force) connector at J3 is fragile. Flip the latch UP before removing the ribbon cable. Pulling the ribbon without releasing the latch will tear the cable and damage the ZIF socket.",
          "CAUTION: Do not press on the LCD surface. Place face-down on a soft, lint-free surface only.",
          "WARNING: Ensure the monitor is fully powered off (hold power 5 seconds) and AC disconnected. The internal battery can supply power sufficient to cause a shock hazard at the backlight connector.",
        ],
        steps: [
          "Power off the monitor (hold power button 5 seconds). Disconnect AC power cord and all patient cables.",
          "Place the monitor face-down on a padded, lint-free surface (e.g., anti-static foam).",
          "Remove the 4× Phillips screws from the rear housing. Note: two screws are longer (20mm) at the top, two shorter (14mm) at the bottom.",
          "Insert a plastic spudger at the bottom edge seam between the rear housing and front bezel. Gently work around the perimeter to release the snap clips. There are 8 clips total: 3 bottom, 2 per side, 1 top.",
          "Lift the rear housing straight up and set aside. The video board and main board are attached to the rear housing — handle carefully.",
          "Disconnect the LCD ribbon cable from connector J3: flip the brown ZIF latch upward (it hinges up 90°), then slide the ribbon cable out. Do not pull the latch past 90° or it will break.",
          "Disconnect the backlight power cable (2-pin white JST connector near the top-right of the panel). Pull straight out, do not rock side to side.",
          "Remove the 6× Phillips screws (all 10mm) securing the LCD panel to the bezel frame. The screws are along the left and right edges, 3 per side.",
          "Lift the old LCD panel out of the bezel frame. Set aside for disposal/return.",
          "Clean the bezel frame channel with a microfiber cloth. Remove any adhesive residue with an isopropyl wipe if needed.",
          "Place the new LCD panel into the bezel frame, display surface facing down. Align the screw holes and the ribbon cable exit point (bottom-center).",
          "Secure with the 6× Phillips screws (10mm). Snug but do not overtorque — the bezel is plastic and strips easily.",
          "Connect the backlight power cable to the 2-pin JST connector. It clicks when seated.",
          "Connect the LCD ribbon cable to J3: ensure the ZIF latch is up, slide the ribbon fully in (the blue reinforcement strip should be visible and flush with the connector edge), then press the ZIF latch down firmly.",
          "Lower the rear housing onto the front bezel. Press around the perimeter to engage all 8 snap clips — you should hear/feel each click.",
          "Install the 4× rear housing screws (20mm at top, 14mm at bottom).",
          "Reconnect AC power and turn on. The Philips boot logo should appear within 10 seconds.",
          "If the display shows artifacts, colored lines, or no image: power off, reopen, and reseat the ribbon cable at J3. Check that the ZIF latch is fully closed.",
        ],
        specifications: [
          { parameter: "Rear housing screws (top)", value: "20", unit: "mm" },
          { parameter: "Rear housing screws (bottom)", value: "14", unit: "mm" },
          { parameter: "LCD mounting screws (all 6)", value: "10", unit: "mm" },
          { parameter: "Snap clips (total count)", value: "8", unit: "" },
          { parameter: "Expected boot time to logo", value: "< 10", unit: "seconds" },
        ],
      },
      {
        sectionId: "mx800_5_5",
        title: "5.5 Backlight Troubleshooting",
        content: "If the MX800 screen appears completely black but the touch interface still responds (you can hear button press tones), the backlight has failed. Before replacing the entire display assembly, check the backlight power supply. Measure voltage at the 2-pin backlight connector (disconnected from the panel): should read 19.5 VDC +/- 0.5V. If voltage is absent, the fault is on the video board or power supply — not the display panel. If voltage is present, the backlight strips inside the display assembly have failed and the full assembly (P/N PHI-453564243681) must be replaced.",
        specifications: [
          { parameter: "Backlight supply voltage (expected)", value: "19.5", tolerance: "+/- 0.5", unit: "VDC" },
          { parameter: "Backlight current draw (normal)", value: "0.8", tolerance: "+/- 0.1", unit: "A" },
        ],
      },
      {
        sectionId: "mx800_3_1",
        title: "3.1 SpO2 Module Troubleshooting and Replacement",
        content: "The MX800 uses plug-in measurement modules for SpO2 monitoring. The M1020B module (P/N PHI-M1020B) provides Nellcor-compatible pulse oximetry. The module connects to the measurement server via a 96-pin backplane connector in the module bay. Common failure modes: 'SpO2 No Signal' (usually a sensor or cable issue, not the module), 'SpO2 Module Failure' (module hardware fault), and persistent low-quality plethysmography waveform (degraded module front-end). Troubleshooting flow: first try a known-good sensor and cable. If the problem persists with known-good accessories, replace the module. The module is hot-swappable — no power cycle required.",
        specifications: [
          { parameter: "SpO2 accuracy (70-100%)", value: "+/- 2", unit: "% SpO2 (adults)" },
          { parameter: "SpO2 accuracy (< 70%)", value: "unspecified", unit: "" },
          { parameter: "Pulse rate range", value: "30-250", unit: "BPM" },
          { parameter: "Pulse rate accuracy", value: "+/- 3", unit: "BPM" },
          { parameter: "Sensor compatibility", value: "Nellcor OxiMax", unit: "" },
          { parameter: "Module weight", value: "0.3", unit: "kg" },
          { parameter: "Backplane connector", value: "96-pin DIN 41612", unit: "" },
        ],
        steps: [
          "If 'SpO2 No Signal' or poor waveform: first try a known-good sensor on the patient. Clean the sensor site (nail polish, dirt can affect readings).",
          "Try a known-good SpO2 cable between the sensor and module. Inspect cable for kinks, exposed wires, or damaged connectors.",
          "If the issue persists with known-good sensor and cable, the module itself has likely failed.",
          "To replace: disconnect the SpO2 sensor cable from the module front panel.",
          "Press the module release lever at the bottom of the module face and slide the module out of the bay.",
          "Inspect the bay's 96-pin backplane connector for bent pins (use a flashlight).",
          "Slide the new M1020B module in until the release lever clicks.",
          "The MX800 auto-detects the module within 5-10 seconds. Reconnect the sensor and verify a good waveform.",
          "Navigate to Setup > Modules to confirm the module shows status 'OK'.",
        ],
        warnings: [
          "CAUTION: The 96-pin backplane connector is fragile. If the module does not slide in smoothly, do not force it — check for alignment.",
          "NOTE: SpO2 readings may be inaccurate in the presence of methemoglobin, carboxyhemoglobin, or intravascular dyes (methylene blue).",
        ],
      },
      {
        sectionId: "mx800_3_3",
        title: "3.3 ECG Acquisition Troubleshooting",
        content: "The MX800 ECG front-end acquires up to 12 leads simultaneously via the trunk cable (P/N PHI-M1668A for 5-lead, or PHI-M1644A for 3-lead). The ECG signal path: skin electrodes → lead wires → trunk cable → ECG module input → instrumentation amplifier → 16-bit ADC → DSP (digital filtering, arrhythmia detection, ST analysis). Common issues: noisy baseline (60 Hz interference, poor electrode contact), lead-off alarms (broken wire, dry electrode gel), loss of arrhythmia detection (incorrect lead placement, algorithm configuration).",
        specifications: [
          { parameter: "ECG input impedance", value: "> 5", unit: "MΩ" },
          { parameter: "CMRR (Common Mode Rejection)", value: "> 100", unit: "dB" },
          { parameter: "Frequency response (monitor mode)", value: "0.5-40", unit: "Hz" },
          { parameter: "Frequency response (diagnostic mode)", value: "0.05-150", unit: "Hz" },
          { parameter: "Lead-off detection threshold", value: "100", unit: "kΩ" },
          { parameter: "Trunk cable resistance (per conductor)", value: "< 5", unit: "Ω" },
          { parameter: "Supported lead sets", value: "3, 5, 6, or 12-lead", unit: "" },
        ],
        steps: [
          "NOISY BASELINE: Check electrode quality (gel moist, good skin contact). Replace electrodes if > 24 hours old. Ensure electrodes are on clean, dry skin (prep with alcohol wipe, abrade lightly if needed).",
          "60 Hz INTERFERENCE: Move electrode leads away from AC power cables. Check that all leads are plugged into the trunk cable (an unplugged lead acts as an antenna). Check facility grounding — the monitor chassis must be properly grounded.",
          "LEAD-OFF ALARMS: Check the specific lead indicated on the alarm. Inspect the lead wire from the electrode snap to the trunk cable connector. Measure continuity with a multimeter — should be < 5Ω. Replace individual lead wires if open circuit.",
          "TRUNK CABLE FAILURE: If multiple leads show intermittent faults, the trunk cable itself may be damaged. Inspect for visible damage (kinks, cuts, connector corrosion). Replace trunk cable (P/N PHI-M1668A for 5-lead).",
          "ECG MODULE FAILURE: If ECG is not available even with a known-good cable, the ECG input on the measurement server may have failed. This requires measurement server replacement — contact Philips service.",
          "ARRHYTHMIA DETECTION ISSUES: Verify the ECG lead selection (Lead II is standard for arrhythmia monitoring). Check that arrhythmia analysis is enabled in the monitor configuration. Verify electrode placement follows standard limb lead positions.",
        ],
        warnings: [
          "WARNING: ECG monitoring may be affected during electrosurgery (electrocautery). This is normal and does not indicate a monitor fault. The monitor will typically recover within 10 seconds after cautery stops.",
          "CAUTION: Do not use ECG electrodes with dried or expired gel. This increases skin-electrode impedance and causes noisy signals and false lead-off alarms.",
        ],
      },
      {
        sectionId: "mx800_8_1",
        title: "8.1 Preventive Maintenance Schedule",
        content: "The Philips IntelliVue MX800 requires scheduled preventive maintenance to ensure accurate patient monitoring and safe operation. All PM results must be documented.",
        steps: [
          "MONTHLY: Visual inspection — check housing for cracks, verify all module bay slots have modules or blank plates installed, inspect power cord for damage, check display for dead pixels or discoloration.",
          "MONTHLY: Alarm test — navigate to Setup > System > Alarm Test. Verify all audible and visual alarm indicators function (red LED, yellow LED, audible tones at all priorities).",
          "QUARTERLY: SpO2 accuracy check — use a certified SpO2 simulator (e.g., Masimo Radical or Fluke Index 2) to verify SpO2 reading accuracy. Readings should be within +/- 2% SpO2 across the 70-100% range.",
          "QUARTERLY: ECG simulator test — connect an ECG patient simulator to the trunk cable. Verify normal sinus rhythm displays correctly, heart rate is accurate (+/- 1 BPM of simulator output), and arrhythmia detection triggers correctly for VFib and asystole.",
          "QUARTERLY: Battery capacity check — navigate to Setup > System > Battery. Run the capacity test. Battery should maintain > 70% of rated capacity. Replace if below 70%.",
          "SEMI-ANNUAL: NIBP accuracy verification — connect a NIBP simulator or calibrated T-tube with mercury manometer. Verify static pressure accuracy (+/- 3 mmHg across 0-300 mmHg range per AAMI SP10). Verify measurement accuracy against a reference at systolic 120, diastolic 80 (+/- 5 mmHg).",
          "ANNUAL: Electrical safety test per IEC 62353 — ground continuity (< 0.3Ω), earth leakage (< 500 µA), enclosure leakage (< 100 µA), patient applied parts leakage (< 50 µA CF type). Document all results.",
          "ANNUAL: Full performance verification of all installed modules (SpO2, ECG, NIBP, IBP, EtCO2). Test each parameter against calibrated simulators.",
          "ANNUAL: Software update check — verify the monitor is running the latest approved software version. Update if a newer version is available from Philips.",
          "Consumable P/Ns: ECG trunk cable 5-lead (PHI-M1668A), SpO2 module (PHI-M1020B), Power supply (PHI-453564020911), LCD display (PHI-453564243681).",
        ],
      },
      {
        sectionId: "mx800_7_1",
        title: "7.1 Power Supply Module",
        content: "The AC/DC power supply module (P/N PHI-453564020911) converts mains AC input (100–240 VAC, 50/60 Hz) to the internal DC rails: +12V (main logic), +5V (standby), +3.3V (processor core), and +19.5V (backlight). The power supply is located in the upper-right area of the rear housing. It is secured with 4× Phillips screws and connects to the main board via a 12-pin power connector (J1). Common failure modes: complete failure (no power), intermittent shutdowns (thermal protection tripping), and partial rail failure (some functions work, others don't).",
        specifications: [
          { parameter: "AC input range", value: "100–240", unit: "VAC" },
          { parameter: "+12V rail", value: "12.0", tolerance: "+/- 0.3", unit: "VDC" },
          { parameter: "+5V standby rail", value: "5.0", tolerance: "+/- 0.25", unit: "VDC" },
          { parameter: "+3.3V processor rail", value: "3.3", tolerance: "+/- 0.15", unit: "VDC" },
          { parameter: "+19.5V backlight rail", value: "19.5", tolerance: "+/- 0.5", unit: "VDC" },
          { parameter: "Power supply connector", value: "J1, 12-pin Molex", unit: "" },
        ],
        tools: [
          "Phillips #2 screwdriver",
          "Multimeter",
          "ESD wrist strap",
        ],
        steps: [
          "Perform full shutdown and disconnect AC. Open rear housing (see Section 5.3 steps 1–5).",
          "Locate the power supply in the upper-right quadrant of the rear housing. It has a metal shield with ventilation holes.",
          "Disconnect the 12-pin power connector from J1 on the main board. Squeeze the latch before pulling.",
          "Disconnect the AC inlet cable from the power supply (internal IEC connector).",
          "Remove the 4× Phillips screws securing the power supply to the rear housing.",
          "Lift the power supply out. Install the replacement in reverse order.",
          "After reassembly, measure output voltages at J1: +12V (pins 1-3), +5V (pins 5-6), +3.3V (pins 8-9), +19.5V (pin 11). All should be within specified tolerances.",
        ],
        warnings: [
          "DANGER: Mains voltage is present at the AC inlet connection. Verify AC is disconnected and the power cord is removed before touching the power supply.",
          "CAUTION: The power supply contains internal fuses that are not field-replaceable. Do not open the power supply enclosure.",
        ],
      },
    ],
  },
  {
    manualId: "manual_ct660",
    title: "GE Optima CT660 Field Service Manual",
    equipmentName: "Optima CT660",
    manufacturer: "GE",
    compatibleModels: ["Optima CT660", "Revolution CT"],
    revision: "Rev 2.8, 2023-03",
    totalPages: 524,
    sections: [
      {
        sectionId: "ct660_1_1",
        title: "1.1 Safety Requirements",
        content: "This manual is restricted to GE-certified field service engineers. The CT660 operates at voltages up to 140 kVp and tube currents up to 800 mA. Lethal voltages are present in the high-voltage generator, slip ring, and X-ray tube housing. Radiation exposure is possible during tube conditioning and calibration procedures. All applicable radiation safety protocols must be followed.",
        warnings: [
          "DANGER: High voltages up to 140,000 volts are present in the tube housing and HV generator during operation. These voltages can cause instant death.",
          "DANGER: X-ray radiation is produced during tube conditioning, calibration, and diagnostic scans. Wear appropriate radiation monitoring and shielding.",
          "WARNING: The X-ray tube anode can exceed 200°C during operation. Allow a minimum 2-hour cool-down before servicing the tube assembly.",
          "WARNING: The tube assembly weighs approximately 65 lbs (30 kg). Always use a tube lift sling rated for 100 lbs minimum.",
        ],
      },
      {
        sectionId: "ct660_6_1",
        title: "6.1 X-Ray Tube Assembly Overview",
        content: "The Optima CT660 uses a high-performance rotating anode X-ray tube (P/N GE-2350400-2) with a 6.3 MHU anode heat capacity. The tube is oil-cooled via a recirculating pump system (Section 6.5). The tube housing contains the cathode assembly, rotating anode, stator coils, and rotor bearings. The tube connects to the high-voltage generator via two shielded HV cables (cathode/anode). The stator drive cable provides the 3-phase signal for anode rotation. The rotor sense cable provides RPM feedback to the generator controller.",
        specifications: [
          { parameter: "Anode heat capacity", value: "6.3", unit: "MHU" },
          { parameter: "Maximum tube voltage", value: "140", unit: "kVp" },
          { parameter: "Maximum tube current", value: "800", unit: "mA" },
          { parameter: "Anode rotation speed", value: "9600", unit: "RPM" },
          { parameter: "Focal spot sizes", value: "0.7 / 1.2", unit: "mm" },
          { parameter: "Tube assembly weight", value: "65", unit: "lbs (30 kg)" },
          { parameter: "Oil volume in housing", value: "12.5", unit: "liters" },
          { parameter: "Maximum anode temperature", value: "200+", unit: "°C" },
          { parameter: "Minimum cool-down before service", value: "2", unit: "hours" },
        ],
      },
      {
        sectionId: "ct660_6_3",
        title: "6.3 X-Ray Tube Replacement",
        content: "This procedure covers removal and installation of the X-ray tube assembly. Estimated time: 4–6 hours including tube conditioning and calibration. This procedure MUST be performed by a GE-certified field service engineer.",
        tools: [
          "GE CT Service Key + Service software access",
          "Tube lift sling rated for 100 lbs (45 kg) minimum",
          "13mm, 15mm, 17mm socket set",
          "Torque wrench (range 10–60 Nm)",
          "Coolant drain pan (15-liter capacity minimum)",
          "5 gallons (19 liters) GE-approved CT coolant (P/N GE-2142050)",
          "Multimeter rated for high voltage measurement",
          "Radiation survey meter",
        ],
        warnings: [
          "DANGER: Verify all high-voltage contactors are open and locked out before approaching the tube housing. Measure HV at the cable connectors with an HV-rated meter to confirm zero voltage.",
          "WARNING: The tube oil may be hot. Wear thermal gloves when draining the cooling loop if the system was recently in operation.",
          "WARNING: Used X-ray tubes may contain depleted tungsten target material. Follow facility hazardous waste protocols for disposal.",
          "CAUTION: When connecting HV cables, torque to specification (see step table). Undertorqued connections cause arcing; overtorqued connections crack the insulator.",
        ],
        steps: [
          "Shut down the CT system from the operator console. Open the main circuit breaker and apply lock-out/tag-out per facility policy.",
          "Verify zero voltage at HV cable connectors using an HV-rated multimeter. Both cathode (−) and anode (+) cables must read < 50V.",
          "Open the gantry side panels (left and right). Locate the tube housing in the gantry frame.",
          "Place the coolant drain pan under the tube housing. Disconnect the coolant supply and return lines at the quick-disconnect fittings. Drain all coolant (approximately 12.5 liters). Note: some residual oil will drip for several minutes.",
          "Disconnect the high-voltage cathode cable (marked −). Unscrew the connector ring counterclockwise (requires 17mm socket). Pull straight out.",
          "Disconnect the high-voltage anode cable (marked +) using the same method.",
          "Disconnect the stator drive cable (6-pin connector, hand-tightened) from the tube housing.",
          "Disconnect the rotor sense cable (4-pin connector) from the tube housing.",
          "Attach the tube lift sling to the two M10 lifting points on the tube housing (top surface). Take up all slack — the sling must support full weight before removing the mounting bolts.",
          "Remove the 4× 17mm mounting bolts securing the tube housing to the gantry cradle. Support the tube at all times.",
          "Using the lift sling, carefully lower the old tube assembly straight down and out of the gantry. Place on a padded surface.",
          "Inspect the gantry cradle mounting surfaces for damage, corrosion, or coolant residue. Clean as needed.",
          "Using the lift sling, raise the new tube assembly into the gantry cradle. Align the 4 mounting holes.",
          "Hand-start all 4 mounting bolts before torquing. Torque to 45 Nm in a cross pattern (front-left, rear-right, front-right, rear-left).",
          "Reconnect the rotor sense cable (4-pin) and stator drive cable (6-pin). Hand-tighten connectors.",
          "Reconnect HV anode (+) cable. Align the guide pin and push in, then tighten connector ring to 25 Nm.",
          "Reconnect HV cathode (−) cable using the same method. Torque to 25 Nm.",
          "Reconnect coolant supply and return lines. Refill with 5 gallons GE-approved coolant. Bleed air by running the coolant pump (from service software) for 5 minutes and checking for bubbles in the sight glass.",
          "Close gantry panels. Remove lock-out/tag-out and close main breaker.",
          "Run the GE tube conditioning protocol from the service console: this performs a graduated series of exposures (60 kV/50 mA up to 140 kV/400 mA) over approximately 30 minutes to season the new tube.",
          "After conditioning, perform: air calibration, detector offset calibration, detector gain calibration, and mA linearity verification.",
          "Run a water phantom scan at standard head protocol. Verify: CT number of water = 0 +/- 4 HU, noise < 5 HU, no ring artifacts.",
        ],
        specifications: [
          { parameter: "Mounting bolt torque", value: "45", unit: "Nm" },
          { parameter: "HV cable connector torque", value: "25", unit: "Nm" },
          { parameter: "Coolant volume (refill)", value: "19", unit: "liters (5 gallons)" },
          { parameter: "Conditioning duration", value: "~30", unit: "minutes" },
          { parameter: "Water phantom CT number (acceptance)", value: "0", tolerance: "+/- 4", unit: "HU" },
          { parameter: "Water phantom noise (acceptance)", value: "< 5", unit: "HU" },
        ],
      },
      {
        sectionId: "ct660_6_5",
        title: "6.5 Cooling System Maintenance",
        content: "The CT tube cooling system circulates GE-approved dielectric coolant (P/N GE-2142050) through the tube housing to maintain anode and housing temperature within safe limits. The system consists of a recirculating pump (P/N GE-2266588), a heat exchanger with dual fans, a coolant reservoir, and a filter assembly. The coolant should be replaced every 18 months or 20,000 scan hours, whichever comes first. The pump generates 15 PSI at full flow (4.5 L/min). A low-pressure switch triggers a cooling fault if pressure drops below 8 PSI.",
        specifications: [
          { parameter: "Coolant type", value: "GE-approved dielectric (P/N GE-2142050)", unit: "" },
          { parameter: "Coolant replacement interval", value: "18 months or 20,000 scan hours", unit: "" },
          { parameter: "Pump operating pressure", value: "15", tolerance: "+/- 2", unit: "PSI" },
          { parameter: "Low-pressure fault threshold", value: "8", unit: "PSI" },
          { parameter: "Coolant flow rate", value: "4.5", tolerance: "+/- 0.5", unit: "L/min" },
          { parameter: "System coolant volume", value: "12.5", unit: "liters" },
        ],
      },
    ],
  },
  {
    manualId: "manual_zoll_r",
    title: "Zoll R Series Service Manual",
    equipmentName: "R Series",
    manufacturer: "Zoll",
    compatibleModels: ["R Series", "R Series Plus"],
    revision: "Rev 5.0, 2024-01",
    totalPages: 186,
    sections: [
      {
        sectionId: "zoll_1_1",
        title: "1.1 Safety Precautions",
        content: "The R Series defibrillator stores energy up to 200 joules in the high-voltage capacitor module. Even when powered off, the capacitor may retain a charge. Always perform an internal discharge before opening the device housing: press and hold the SHOCK button for 5 seconds with paddles disconnected. The capacitor module (P/N ZOLL-9650-0801-01) should be treated as a high-voltage component at all times.",
        warnings: [
          "DANGER: The defibrillator capacitor can store lethal energy (up to 200 joules at 1700 volts). Always perform the internal discharge procedure before servicing.",
          "WARNING: Do not open the device housing without first discharging the capacitor. Residual charge can cause severe burns or cardiac arrest.",
          "CAUTION: Use only Zoll-approved SurePower batteries (P/N ZOLL-8019-0535-01). Third-party batteries may not communicate properly with the charge management system and can cause fires.",
        ],
      },
      {
        sectionId: "zoll_3_1",
        title: "3.1 Battery System Overview",
        content: "The R Series uses a SurePower rechargeable lithium-ion battery pack (P/N ZOLL-8019-0535-01). The battery provides 5.8 Ah at 14.4V nominal. A fully charged battery supports approximately 300 defibrillation shocks at 200J or 5 hours of continuous monitoring. The battery communicates with the device via a 4-contact smart interface that reports state of charge, cycle count, temperature, and fault status. The charge indicator on the front panel shows 1–4 bars corresponding to 25% increments. A flashing battery indicator means the battery is below 10% or has detected a fault.",
        specifications: [
          { parameter: "Battery chemistry", value: "Lithium-ion", unit: "" },
          { parameter: "Nominal voltage", value: "14.4", unit: "VDC" },
          { parameter: "Capacity", value: "5.8", unit: "Ah" },
          { parameter: "Charge cycles (rated life)", value: "500", unit: "cycles" },
          { parameter: "Full charge indicator", value: "4 bars", unit: "" },
          { parameter: "Low battery threshold", value: "10%", unit: "state of charge" },
          { parameter: "Battery weight", value: "0.78", unit: "lbs (355 g)" },
          { parameter: "Charging time (0 to 100%)", value: "3.5", unit: "hours" },
          { parameter: "Operating temperature range", value: "0 to 50", unit: "°C" },
        ],
      },
      {
        sectionId: "zoll_3_3",
        title: "3.3 Battery Replacement Procedure",
        content: "The battery is a tool-free, slide-in field-replaceable unit. No calibration is required after replacement. The R Series will perform an automatic self-test when a new battery is inserted.",
        steps: [
          "Power off the defibrillator: press and hold the power button for 3 seconds until the screen goes blank.",
          "Turn the unit over. Locate the battery compartment on the bottom-rear of the device.",
          "Slide the battery release latch to the UNLOCK position (slide toward the arrow icon stamped in the plastic).",
          "Slide the old battery pack out of the compartment. Set aside for disposal per facility hazardous waste protocol.",
          "Inspect the battery bay: check the 4 gold contact pads for corrosion, discoloration, or debris. Wipe with a dry lint-free cloth if needed.",
          "Slide the new SurePower battery into the compartment until it clicks into the locked position. The release latch should return to LOCK automatically.",
          "Turn the unit upright and press the power button. The device will perform an automatic self-test (approximately 15 seconds).",
          "After self-test completes, verify: screen shows normal monitoring display, battery icon shows 4 bars (if new battery was pre-charged), no error messages displayed.",
          "Run a manual self-test: press and hold the ANALYZE button for 3 seconds. The device should display 'PASS' for all test categories.",
        ],
        specifications: [
          { parameter: "Expected self-test duration", value: "~15", unit: "seconds" },
          { parameter: "New battery initial charge", value: "40–60% (factory pre-charge)", unit: "" },
        ],
        warnings: [
          "CAUTION: Do not use batteries that have been stored for more than 12 months without recharging. Deeply discharged lithium-ion batteries may have degraded capacity and should be replaced.",
          "WARNING: Do not dispose of lithium-ion batteries in regular waste. Follow facility and local regulations for battery recycling/disposal.",
        ],
      },
      {
        sectionId: "zoll_4_1",
        title: "4.1 Capacitor Module Service",
        content: "The high-voltage capacitor module (P/N ZOLL-9650-0801-01) stores defibrillation energy for delivery. It charges to approximately 1700 VDC for a maximum 200J biphasic shock. The capacitor module is rated for 10,000 charge/discharge cycles. If the module fails to charge to target voltage within 10 seconds, or if the charge-to-energy efficiency drops below 85%, the module must be replaced. Charge failure is indicated by the error message 'Charge Failure' on the display and three rapid beeps.",
        specifications: [
          { parameter: "Maximum charge voltage", value: "1700", unit: "VDC" },
          { parameter: "Maximum energy", value: "200", unit: "joules" },
          { parameter: "Charge time to max energy", value: "< 10", unit: "seconds" },
          { parameter: "Rated cycle life", value: "10,000", unit: "charge/discharge cycles" },
          { parameter: "Charge-to-energy efficiency (minimum)", value: "85", unit: "%" },
          { parameter: "Capacitance", value: "140", tolerance: "+/- 10", unit: "µF" },
        ],
        warnings: [
          "DANGER: The capacitor module can deliver lethal energy. ALWAYS perform the discharge procedure (hold SHOCK for 5 seconds with paddles disconnected) before handling.",
          "DANGER: Do not short the capacitor terminals. This will cause an explosive discharge that can result in burns, shrapnel injury, or fire.",
          "WARNING: After removing the capacitor module, wait 5 minutes and verify terminal voltage < 10V with a multimeter before handling or disposing of the module.",
        ],
        tools: [
          "Phillips #2 screwdriver",
          "Multimeter rated for 2000 VDC",
          "Insulated gloves rated for 1000V",
          "ESD wrist strap",
        ],
        steps: [
          "Remove the battery. Perform the capacitor discharge procedure: reconnect battery briefly, press CHARGE, then hold SHOCK for 5 seconds with paddles disconnected. Remove battery again.",
          "Remove the 8× Phillips screws from the rear housing. Separate the two housing halves.",
          "Measure voltage across the capacitor terminals with an HV-rated multimeter. Must read < 10 VDC before proceeding.",
          "Disconnect the 3-wire capacitor cable from the main board (connector J8). Note wire colors and positions.",
          "Remove the 2× Phillips screws securing the capacitor module bracket to the chassis.",
          "Lift the capacitor module out. Handle by the bracket only — do not touch the terminals.",
          "Install the new module in reverse order. Torque bracket screws to 1.2 Nm.",
          "Reconnect the 3-wire cable to J8. Verify correct wire positions.",
          "Reassemble housing. Install battery. Power on.",
          "Run a charge/discharge test from the service menu: verify charge to 200J in < 10 seconds, verify energy delivery within 5% of selected energy.",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Equipment assets (hospital inventory)
// ---------------------------------------------------------------------------

const equipmentAssets: EquipmentAsset[] = [
  {
    assetId: "ASSET-4302",
    assetTag: "ASSET-4302",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    serialNumber: "SN-V500-2847",
    department: "ICU-3",
    location: "Building A, Floor 3, Room 312",
    installDate: "2020-03-15",
    warrantyExpiry: "2025-03-15",
    hoursLogged: 14200,
    status: "active",
    lastPmDate: "2025-11-01",
    nextPmDue: "2026-05-01",
  },
  {
    assetId: "ASSET-4303",
    assetTag: "ASSET-4303",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    serialNumber: "SN-V500-3102",
    department: "ICU-3",
    location: "Building A, Floor 3, Room 314",
    installDate: "2020-03-15",
    warrantyExpiry: "2025-03-15",
    hoursLogged: 13800,
    status: "active",
    lastPmDate: "2025-11-01",
    nextPmDue: "2026-05-01",
  },
  {
    assetId: "ASSET-5501",
    assetTag: "ASSET-5501",
    equipmentName: "IntelliVue MX800",
    manufacturer: "Philips",
    serialNumber: "SN-MX800-1192",
    department: "ICU-2",
    location: "Building A, Floor 2, Room 208",
    installDate: "2021-06-20",
    warrantyExpiry: "2026-06-20",
    hoursLogged: 9800,
    status: "active",
    lastPmDate: "2025-12-15",
    nextPmDue: "2026-06-15",
  },
  {
    assetId: "ASSET-5502",
    assetTag: "ASSET-5502",
    equipmentName: "IntelliVue MX800",
    manufacturer: "Philips",
    serialNumber: "SN-MX800-1193",
    department: "OR-7",
    location: "Building B, Floor 1, OR Suite 7",
    installDate: "2021-06-20",
    warrantyExpiry: "2026-06-20",
    hoursLogged: 8400,
    status: "active",
    lastPmDate: "2025-12-15",
    nextPmDue: "2026-06-15",
  },
  {
    assetId: "ASSET-6001",
    assetTag: "ASSET-6001",
    equipmentName: "Optima CT660",
    manufacturer: "GE",
    serialNumber: "SN-CT660-0487",
    department: "Radiology",
    location: "Building C, Floor 1, CT Suite 2",
    installDate: "2019-09-10",
    warrantyExpiry: "2024-09-10",
    hoursLogged: 22500,
    status: "active",
    lastPmDate: "2025-10-20",
    nextPmDue: "2026-04-20",
  },
  {
    assetId: "ASSET-7010",
    assetTag: "ASSET-7010",
    equipmentName: "R Series",
    manufacturer: "Zoll",
    serialNumber: "SN-ZOLL-R-3341",
    department: "ED",
    location: "Building A, Floor 1, Trauma Bay 2",
    installDate: "2022-01-15",
    warrantyExpiry: "2027-01-15",
    hoursLogged: 3200,
    status: "active",
    lastPmDate: "2025-09-01",
    nextPmDue: "2026-03-01",
  },
  {
    assetId: "ASSET-7011",
    assetTag: "ASSET-7011",
    equipmentName: "R Series",
    manufacturer: "Zoll",
    serialNumber: "SN-ZOLL-R-3342",
    department: "ICU-1",
    location: "Building A, Floor 2, Room 201",
    installDate: "2022-01-15",
    warrantyExpiry: "2027-01-15",
    hoursLogged: 4100,
    status: "active",
    lastPmDate: "2025-09-01",
    nextPmDue: "2026-03-01",
  },
];

// ---------------------------------------------------------------------------
// Work orders (historical repair records)
// ---------------------------------------------------------------------------

const workOrders: WorkOrder[] = [
  {
    workOrderId: "WO-HIST-001",
    assetId: "ASSET-4302",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    department: "ICU-3",
    priority: "urgent",
    status: "completed",
    createdAt: "2025-08-14T09:30:00Z",
    completedAt: "2025-08-14T11:45:00Z",
    technicianNotes: "Fan noise increasing over past week, error 57 appeared this morning",
    diagnosis: "Fan module bearing wear causing Error 57. Fan assembly replaced.",
    partsUsed: [{ partNumber: "DRG-8306750", partName: "Fan Module Assembly", quantity: 1, unitCost: 1850 }],
    laborHours: 1.5,
    totalCost: 2075,
    rootCause: "Bearing wear due to 12,000+ hours of operation without preventive replacement",
  },
  {
    workOrderId: "WO-HIST-002",
    assetId: "ASSET-4302",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    department: "ICU-3",
    priority: "routine",
    status: "completed",
    createdAt: "2025-03-20T14:00:00Z",
    completedAt: "2025-03-20T15:30:00Z",
    technicianNotes: "Routine PM — flow sensor calibration out of spec",
    diagnosis: "Flow sensor drift detected during PM. Sensor replaced and recalibrated.",
    partsUsed: [{ partNumber: "DRG-8404500", partName: "Flow Sensor Assembly", quantity: 1, unitCost: 350 }],
    laborHours: 1.0,
    totalCost: 500,
    rootCause: "Normal wear — flow sensor has ~2 year service life at this utilization",
  },
  {
    workOrderId: "WO-HIST-003",
    assetId: "ASSET-5501",
    equipmentName: "IntelliVue MX800",
    manufacturer: "Philips",
    department: "ICU-2",
    priority: "urgent",
    status: "completed",
    createdAt: "2025-06-12T07:15:00Z",
    completedAt: "2025-06-12T09:00:00Z",
    technicianNotes: "Display flickering intermittently, went completely black",
    diagnosis: "Display panel backlight inverter failure. Replaced display panel assembly.",
    partsUsed: [{ partNumber: "PH-453564201591", partName: "Display Panel Assembly", quantity: 1, unitCost: 2200 }],
    laborHours: 1.5,
    totalCost: 2425,
    rootCause: "Backlight inverter component degradation — common failure mode at 8000+ hours",
  },
  {
    workOrderId: "WO-HIST-004",
    assetId: "ASSET-6001",
    equipmentName: "Optima CT660",
    manufacturer: "GE",
    department: "Radiology",
    priority: "emergency",
    status: "completed",
    createdAt: "2025-10-05T06:00:00Z",
    completedAt: "2025-10-06T14:00:00Z",
    technicianNotes: "Tube arc fault during morning scans. CT down, patients being diverted.",
    diagnosis: "X-ray tube end of life. Tube arcing under load. Full tube replacement performed.",
    partsUsed: [{ partNumber: "GE-2275207", partName: "X-Ray Tube Assembly", quantity: 1, unitCost: 45000 }],
    laborHours: 8.0,
    totalCost: 46200,
    rootCause: "X-ray tube exceeded rated heat unit capacity at 20,000+ hours",
  },
  {
    workOrderId: "WO-HIST-005",
    assetId: "ASSET-4303",
    equipmentName: "Evita V500",
    manufacturer: "Drager",
    department: "ICU-3",
    priority: "routine",
    status: "completed",
    createdAt: "2025-11-01T10:00:00Z",
    completedAt: "2025-11-01T12:00:00Z",
    technicianNotes: "Scheduled PM — exhalation valve diaphragm showing wear",
    diagnosis: "Preventive replacement of exhalation valve assembly during scheduled PM.",
    partsUsed: [{ partNumber: "DRG-8412960", partName: "Exhalation Valve Assembly", quantity: 1, unitCost: 450 }],
    laborHours: 1.0,
    totalCost: 600,
    rootCause: "Preventive replacement — valve diaphragm shows elasticity loss at 13,000 hours",
  },
  {
    workOrderId: "WO-HIST-006",
    assetId: "ASSET-7010",
    equipmentName: "R Series",
    manufacturer: "Zoll",
    department: "ED",
    priority: "urgent",
    status: "completed",
    createdAt: "2025-07-22T16:30:00Z",
    completedAt: "2025-07-22T17:15:00Z",
    technicianNotes: "Battery not holding charge, unit failing daily self-test",
    diagnosis: "Battery pack degraded below acceptable capacity. Replaced with new battery.",
    partsUsed: [{ partNumber: "ZOLL-8019-0535-01", partName: "SurePower Battery Pack", quantity: 1, unitCost: 250 }],
    laborHours: 0.5,
    totalCost: 325,
    rootCause: "Battery cell degradation after 3 years and ~500 charge cycles",
  },
];

// ---------------------------------------------------------------------------
// Seeder logic
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log("Seeding Firestore with PartsFinder demo data...\n");

  // Seed suppliers
  console.log(`Seeding ${suppliers.length} suppliers...`);
  const supplierBatch = db.batch();
  for (const supplier of suppliers) {
    const ref = db.collection("suppliers").doc(supplier.id);
    supplierBatch.set(ref, supplier);
  }
  await supplierBatch.commit();
  console.log("  Suppliers seeded successfully.\n");

  // Seed parts
  console.log(`Seeding ${parts.length} parts...`);
  const partBatch = db.batch();
  for (const part of parts) {
    const ref = db.collection("parts").doc(part.id);
    partBatch.set(ref, part);
  }
  await partBatch.commit();
  console.log("  Parts seeded successfully.\n");

  // Seed repair guides (original + generated extras)
  const allGuides = [...repairGuides, ...extraRepairGuides];
  console.log(`Seeding ${allGuides.length} repair guides...`);
  const guideBatch = db.batch();
  for (const guide of allGuides) {
    const ref = db.collection("repair_guides").doc(guide.partId);
    guideBatch.set(ref, guide);
  }
  await guideBatch.commit();
  console.log("  Repair guides seeded successfully.\n");

  // Seed service manuals (V2)
  console.log(`Seeding ${serviceManuals.length} service manuals...`);
  const manualBatch = db.batch();
  for (const manual of serviceManuals) {
    const ref = db.collection("service_manuals").doc(manual.manualId);
    manualBatch.set(ref, manual);
  }
  await manualBatch.commit();
  console.log("  Service manuals seeded successfully.\n");

  // Seed equipment assets
  console.log(`Seeding ${equipmentAssets.length} equipment assets...`);
  const assetBatch = db.batch();
  for (const asset of equipmentAssets) {
    const ref = db.collection("equipment_assets").doc(asset.assetId);
    assetBatch.set(ref, asset);
  }
  await assetBatch.commit();
  console.log("  Equipment assets seeded successfully.\n");

  // Seed work orders (historical)
  console.log(`Seeding ${workOrders.length} work orders...`);
  const woBatch = db.batch();
  for (const wo of workOrders) {
    const ref = db.collection("work_orders").doc(wo.workOrderId);
    woBatch.set(ref, wo);
  }
  await woBatch.commit();
  console.log("  Work orders seeded successfully.\n");

  console.log("Seeding complete!");
  console.log(`  - ${suppliers.length} suppliers`);
  console.log(`  - ${parts.length} parts`);
  console.log(`  - ${allGuides.length} repair guides`);
  console.log(`  - ${serviceManuals.length} service manuals`);
  console.log(`  - ${equipmentAssets.length} equipment assets`);
  console.log(`  - ${workOrders.length} work orders`);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
