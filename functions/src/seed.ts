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
import { Part, Supplier, RepairGuide } from "./types";

// Initialize Firebase Admin — uses GOOGLE_APPLICATION_CREDENTIALS or
// falls back to the default emulator connection when running locally.
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

  // Seed repair guides
  console.log(`Seeding ${repairGuides.length} repair guides...`);
  const guideBatch = db.batch();
  for (const guide of repairGuides) {
    const ref = db.collection("repair_guides").doc(guide.partId);
    guideBatch.set(ref, guide);
  }
  await guideBatch.commit();
  console.log("  Repair guides seeded successfully.\n");

  console.log("Seeding complete!");
  console.log(`  - ${suppliers.length} suppliers`);
  console.log(`  - ${parts.length} parts`);
  console.log(`  - ${repairGuides.length} repair guides`);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
