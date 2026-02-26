# PartsFinder — VP Demo Script

6 conversations that showcase every agent capability. Copy-paste each prompt verbatim.

---

## 1. The Hero Flow — Ventilator Error Code (all tools fire)

**Prompt:**
> I've got a Drager Evita V500, asset tag ASSET-4302, it's throwing error 57 and the fan isn't spinning

**What to point out:**
- **Asset lookup** — pulls department, location, warranty status, hours logged
- **Repair history** — shows past work orders for this specific unit
- **Manual search (RAG)** — semantic vector search finds the error code reference section
- **Parts search** — narrows from full catalog → Drager → Evita V500 → error 57 → 1 result
- **Supplier ranking** — weighted scoring on quality, delivery speed, OEM status
- **Repair guide** — step-by-step instructions with safety warnings and required tools
- **Buy button** — click it to show the purchase popup with the part, price, and rating
- **Agent Trace** — open it to show the full tool chain, latencies, RAG similarity scores, and filter steps

**Expected result:** Fan Module Assembly, DRG-8306750, $1,850, high confidence

---

## 2. Imaging — High-Value Critical Part with Safety Warnings

**Prompt:**
> GE Optima CT660 tube arc fault during scan, getting mA calibration errors. Asset tag ASSET-6001

**What to point out:**
- **$95,000 part** — X-Ray Tube Assembly, shows the agent handles high-value components
- **Critical safety warnings** — radiation safety, factory calibration required
- **Supplier ranking** — only OEM-certified suppliers for safety-critical imaging parts
- **Manual references** — quotes specific troubleshooting steps from the service manual

**Expected result:** X-Ray Tube Assembly, GE-2350400-2, $95,000, high confidence, critical warnings

---

## 3. Defibrillator — Life-Safety Equipment

**Prompt:**
> Our Zoll R Series defib in the trauma bay won't hold a charge, battery light keeps flashing. Tag is ASSET-7010

**What to point out:**
- **Life-safety context** — agent flags urgency for emergency department equipment
- **Warranty check** — asset lookup shows warranty status
- **Multiple supplier options** — quality-scored ranking for fast turnaround
- **Repair guide** — battery swap procedure with safety steps

**Expected result:** Defibrillator Battery Pack, ZOLL-8019-0535-01, $450, high confidence

---

## 4. Vague / Ambiguous Input — Shows Clarification Ability

**Prompt:**
> the ventilator is broken

**What to point out:**
- **Agent asks clarifying questions** — doesn't guess, asks for make/model/symptoms
- **No hallucinated parts** — doesn't recommend something without enough info
- **Confidence: low or null** — honest about uncertainty
- Shows the agent is safe — it won't recommend the wrong part on incomplete info

**Expected result:** Clarification response asking for equipment details

---

## 5. Multi-Turn Conversation — Refinement

Start with:
> Philips IntelliVue MX800 in ICU-2, the screen went completely black

Then follow up with:
> Actually it's not just the display — the whole unit won't power on. No fan noise, no LEDs, nothing.

**What to point out:**
- **First response** — Display Panel LCD Assembly ($2,800)
- **Second response** — agent re-evaluates and pivots to Main System Board ($4,500) based on new symptoms
- **Conversation memory** — agent references the earlier context
- Shows the agent can **change its mind** when given better information

---

## 6. Out-of-Scope / Edge Case — Rejection

**Prompt:**
> my office coffee maker stopped working

**What to point out:**
- **Graceful rejection** — agent recognizes this isn't medical equipment
- **Low/no confidence** — doesn't try to force a match
- **No hallucinated parts** — empty recommendation, no supplier ranking
- Shows the system has **guardrails** and won't return garbage results

**Expected result:** Polite decline, no parts recommended, low confidence

---

## 7. Extended Multi-Turn — Hospital Tech Who Doesn't Know the Details

This is a longer conversation (8+ turns) that stress-tests conversation history. The technician is a newer biomed tech covering an unfamiliar unit in a department they don't usually work. They don't know the make, model, error code, or asset tag — the agent has to pull it out of them piece by piece without hallucinating a diagnosis.

**Purpose:** Proves the agent stays deterministic across a long chat, never guesses a part prematurely, and only recommends when it has enough signal.

---

**Turn 1 — Vague opening, no useful info:**
> Hey, I got called up to the third floor. One of the machines up here is beeping and the nurse says it's not working right. I don't usually cover this floor.

**Expected:** Clarification. Agent should ask what kind of equipment it is (ventilator, monitor, pump, etc.) and what floor/room. Should NOT recommend any parts or guess the equipment type. Confidence null.

**What to point out:** Zero tool calls — the agent knows it has nothing to search on yet.

---

**Turn 2 — Tech identifies equipment type but not the brand:**
> It's one of the ventilators. There are two of them in this ICU and they look the same. The nurse says this one has been acting funny for a couple days.

**Expected:** Clarification asking for the manufacturer name (usually on a label on the front or side of the unit) and what specifically is happening — error codes, alarms, unusual sounds, patient impact. May also ask if there's an asset tag sticker. Should still NOT recommend any parts.

**What to point out:** Agent asks targeted follow-ups but doesn't ask for everything at once — keeps it conversational, not like a form.

---

**Turn 3 — Tech reads the label but gives a vague symptom:**
> It says Drager on the front. There's a number on the screen that says something about a fan. I can hear a weird grinding noise from the back.

**Expected:** Agent now has manufacturer (Drager) and a symptom (fan issue, grinding noise). It should call **searchManual** and **searchParts** scoped to Drager + fan. It may find the Evita V500 fan module but should note it doesn't know the exact model yet. Confidence should be medium at best. May ask the tech to confirm the model (Evita V500, V300, etc.) from the label.

**What to point out:**
- Agent fires tools now that it has enough to search on
- Doesn't just say "it's the fan module" — it asks to confirm the model before committing to a specific part number
- RAG search should surface the Evita V500 error code reference and cooling system sections

---

**Turn 4 — Tech confirms model, provides the error code:**
> OK it says Evita V500 on the side. And on the screen there's "Err 57" or something like that. Is that the error code?

**Expected:** Now the agent has Drager + Evita V500 + Error 57 + fan grinding. This matches the hero flow exactly. Agent should call **searchManual** (Error 57 → fan speed below threshold), **searchParts** (Drager → Evita V500 → error 57), and **getSuppliers**. Should return Fan Module Assembly, DRG-8306750, $1,850, high confidence.

**What to point out:**
- Agent waited until it had the full picture before making a high-confidence recommendation
- Same result as Scenario 1 but it took 4 turns to get there — the agent was patient
- Manual references should quote the error code table: "E57: Fan speed below minimum threshold"

---

**Turn 5 — Tech asks about the asset tag:**
> The nurse is asking if this is covered under warranty. There's a sticker on the back that says ASSET-4302, does that help?

**Expected:** Agent calls **lookupAsset** (ASSET-4302) and **getRepairHistory**. Should return asset details (ICU-3, Building A, 14,200 hours, warranty expiry 2025-03-15) and past work orders including WO-HIST-001 (previous fan module replacement in Aug 2025). Should flag that warranty is expired and that this is the **second fan module failure** on this unit.

**What to point out:**
- **Repair history pattern** — agent proactively calls out "This is the 2nd fan module replacement on this unit in under a year"
- **Warranty expired** — agent mentions the tech should check with purchasing about a service contract
- **High hours** — 14,200 hours suggests heavy use, agent may suggest preventive maintenance review
- Shows the agent enriches an existing diagnosis with new context rather than starting over

---

**Turn 6 — Tech asks for help with the repair:**
> I've never replaced a fan module before. Can you walk me through it? What tools do I need?

**Expected:** Agent calls **getRepairGuide** for part_001 (Fan Module Assembly). Should return the full step-by-step repair procedure: estimated time (45-60 min), difficulty (Moderate), required tools, safety warnings (disconnect from gas supply, power down, ESD precautions), and the numbered replacement steps.

**What to point out:**
- **Repair guide** appears with safety warnings front and center
- **Tool list** — specific tools the tech needs to gather before starting
- Agent doesn't just dump the steps — it highlights safety items first because this is a life-support ventilator

---

**Turn 7 — Tech asks a specific technical question mid-repair:**
> I'm at the step where I need to disconnect the fan connector. There are like 3 connectors back here and I don't want to pull the wrong one. Which one is it?

**Expected:** Agent should reference the manual section on fan module replacement (section 3.7) and provide specifics about the connector — the J12 connector on the main PCB, Molex 12-pin. Should quote the manual rather than guessing. If the manual has this detail, confidence stays high. If not, agent should say what the manual states and recommend checking the wiring diagram rather than guessing a connector it's not sure about.

**What to point out:**
- **Manual-grounded answer** — agent quotes the service manual, not general knowledge
- **Doesn't guess** — if the manual doesn't specify the connector color or exact board location, the agent says so rather than fabricating details
- This is the anti-hallucination moment — the agent stays within what the manual says

---

**Turn 8 — Tech finishes, asks about preventing this again:**
> OK got it swapped out, it's running quiet now. Error cleared. This is the second time this happened on this unit right? Is there something we should be doing to prevent it?

**Expected:** Agent references the repair history (2 fan replacements in ~6 months), the unit's high operating hours (14,200), and the preventive maintenance schedule from the manual (section 6.1). Should recommend:
- Adding fan module inspection to the PM checklist
- Checking the air intake filters more frequently (dust buildup accelerates bearing wear)
- Considering the unit's age and hours for a more aggressive PM cycle
- Confidence high — this is supported by manual data and repair history

**What to point out:**
- **Proactive maintenance advice** — the agent doesn't just fix the problem, it helps prevent the next one
- **Data-driven** — references the specific repair history and hours, not generic advice
- **Manual-backed** — PM recommendations come from the actual service manual schedule
- This is the "trusted advisor" moment — the tech leaves feeling like the system actually helped them learn something

---

### Full scenario summary

| Turn | Tech knows | Agent does | Key capability |
|------|-----------|-----------|----------------|
| 1 | Nothing | Asks what equipment | No hallucination on zero info |
| 2 | "ventilator in ICU" | Asks for manufacturer/symptoms | Targeted follow-up questions |
| 3 | "Drager, fan grinding" | Searches, asks to confirm model | Partial search, doesn't over-commit |
| 4 | "Evita V500, Err 57" | Full diagnosis + part + suppliers | Deterministic match with full info |
| 5 | Asset tag ASSET-4302 | Enriches with history + warranty | Repeat failure detection |
| 6 | "How do I replace it?" | Repair guide + tools + safety | Step-by-step with safety first |
| 7 | "Which connector?" | Quotes manual section 3.7 | Anti-hallucination, manual-grounded |
| 8 | "How to prevent this?" | PM recommendations from history | Proactive maintenance advisor |

**Why this scenario matters:**
- **8 turns** stress-tests conversation history handling and context window
- **Incremental info reveal** proves the agent doesn't jump to conclusions
- **Same final result as Scenario 1** but reached through guided conversation — shows the agent works for techs at any experience level
- **Zero hallucinated parts** — every recommendation is grounded in actual data
- **Covers the full tool chain** — clarification → manual search → parts search → asset lookup → repair history → repair guide → preventive guidance

---

## Demo Tips

1. **Open the Agent Trace** on every response — the tool chain visualization is the technical differentiator
2. **Click the Buy button** after the hero flow — it opens the purchase popup with star rating
3. **Use the multi-turn conversation** (scenario 5) to show this isn't just a one-shot lookup
4. The **streaming progress** (tool icons appearing in real-time) is visually impressive — don't rush past it
5. If asked about accuracy: the RAG similarity scores in the trace are real vector cosine distances, not faked
