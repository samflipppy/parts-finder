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

## Demo Tips

1. **Open the Agent Trace** on every response — the tool chain visualization is the technical differentiator
2. **Click the Buy button** after the hero flow — it opens the purchase popup with star rating
3. **Use the multi-turn conversation** (scenario 5) to show this isn't just a one-shot lookup
4. The **streaming progress** (tool icons appearing in real-time) is visually impressive — don't rush past it
5. If asked about accuracy: the RAG similarity scores in the trace are real vector cosine distances, not faked
