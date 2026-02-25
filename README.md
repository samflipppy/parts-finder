# PartsFinder — Repair Intelligence Agent

An AI-powered healthcare equipment diagnostic assistant built with Firebase, Google Genkit, and Vertex AI. Hospital biomedical technicians describe a broken equipment problem in plain language and the agent identifies the correct replacement part, retrieves relevant service manual sections via RAG, scores suppliers, and returns a ranked recommendation with full reasoning.

## Prerequisites

- **Node.js 24+**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Google Cloud CLI** (`gcloud`) — for monitoring setup
- **Google Cloud project** with Vertex AI API enabled
- A Firebase project with Firestore enabled

## Quick Start (full deploy)

```bash
# 1. Install all dependencies
npm install
cd functions && npm install && cd ..

# 2. Authenticate
firebase login
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Set the demo password
echo 'DEMO_PASSWORD=123' > functions/.env

# 4. Generate embeddings for RAG search
cd functions && npx tsx src/embed-sections.ts && cd ..

# 5. Seed the Firestore database
cd functions && npm run seed && cd ..

# 6. Build everything (frontend TS + backend TS)
npm run build

# 7. Deploy to Firebase (Hosting + Functions)
firebase deploy

# 8. Set up Cloud Monitoring dashboard (one-time)
./monitoring/setup-metrics.sh
```

Your app is live at `https://YOUR_PROJECT_ID.web.app`.

## Local Development

```bash
# Start emulators (Firestore + Functions + Hosting)
firebase emulators:start

# In another terminal — watch frontend TS for changes
npm run build:ui:watch
```

The frontend is at `http://localhost:5000`, API at `http://localhost:5001`.

## Project Structure

```
parts-finder/
├── public/                    # Firebase Hosting (served as-is)
│   ├── src/
│   │   └── chat.ts            # Frontend source (TypeScript)
│   ├── chat.css               # Chat UI styles
│   ├── style.css              # Base styles
│   ├── chat.html              # Main page
│   ├── chat.js                # Build artifact (gitignored)
│   └── tsconfig.json          # Frontend TS config
├── functions/
│   └── src/
│       ├── index.ts           # Cloud Functions entry (chat, metrics, feedback)
│       ├── agent.ts           # Genkit agent flow + streaming
│       ├── tools.ts           # 8 Genkit tools
│       ├── prompts.ts         # System prompt
│       ├── types.ts           # Shared TypeScript interfaces
│       ├── metrics.ts         # Metrics collection + Firestore persistence
│       ├── validation.ts      # Request validation
│       ├── ai.ts              # Genkit + Vertex AI config
│       ├── seed.ts            # Firestore data seeder
│       ├── embed-sections.ts  # Vector embedding generator for RAG
│       └── __tests__/         # 72 tests across 4 suites
├── monitoring/
│   ├── setup-metrics.sh       # Creates log-based metrics + dashboard
│   └── dashboard.json         # Cloud Monitoring dashboard config
├── firebase.json              # Hosting rewrites + emulator config
├── firestore.rules            # Firestore security rules
└── package.json               # Root build scripts (esbuild + tsc)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Streaming diagnostic chat (SSE) |
| `/api/metrics` | GET | Recent request metrics + aggregate stats |
| `/api/feedback` | POST | Submit 1-5 star conversation rating |

All endpoints are protected by the `DEMO_PASSWORD` when configured.

## Auth

A simple backend-verified password gate. Set `DEMO_PASSWORD` in `functions/.env`:

```
DEMO_PASSWORD=123
```

- The frontend shows a password overlay on every new session
- The `x-demo-password` header is checked server-side before any LLM call
- If no password is configured, the app runs in open-access mode
- Password is stored in `sessionStorage` (clears when the tab closes)

## Agent Tools

The agent has 8 tools organized in two phases:

**Phase 1 — Identify & Research**
| Tool | Description |
|------|-------------|
| `lookupAsset` | Look up equipment by asset tag in Firestore |
| `getRepairHistory` | Fetch past work orders for an asset |
| `listManualSections` | Load service manual table of contents |
| `searchManual` | Semantic RAG search over manual sections |
| `getManualSection` | Retrieve full text of a specific section |

**Phase 2 — Parts & Suppliers**
| Tool | Description |
|------|-------------|
| `searchParts` | Filter parts catalog by equipment/category/keyword |
| `getSuppliers` | Get supplier rankings for a specific part |
| `getRepairGuide` | Load step-by-step repair instructions |

## Architecture

```
[Technician Input]
    → POST /api/chat (SSE stream)
        → Genkit generateStream + 8 tools + Zod schema
            → tool_done events (live progress)
            → text_chunk events (streaming text)
            → complete event (structured ChatAgentResponse + metrics)
        → Firestore metrics persistence
        → Cloud Logging structured logs
    → Frontend renders: diagnosis, parts, manual refs, agent trace
```

Single-phase architecture: one `generateStream` call with `tools` + `output: { schema }`, `maxTurns: 15`. No multi-step orchestration.

## Observability

Three layers, all automatic after deploy:

1. **Cloud Logging** — structured JSON logs for every request (`agent_request_complete`) and feedback (`user_feedback`)
2. **Genkit Cloud Trace** — full tool call chains, LLM latencies, spans via `flushTracing()`
3. **Cloud Monitoring Dashboard** — run `./monitoring/setup-metrics.sh` once to create:
   - Confidence distribution (high/medium/low)
   - Response latency P50/P95/P99
   - Tool usage patterns
   - Error rate
   - User feedback ratings over time

Dashboard URL: `https://console.cloud.google.com/monitoring/dashboards?project=YOUR_PROJECT_ID`

## User Feedback

Users can rate each conversation 1-5 stars via a button on assistant responses. Ratings are:
- Stored in Firestore `feedback` collection
- Emitted as structured logs for Cloud Monitoring
- Visible on the monitoring dashboard

## Testing

```bash
npm test
```

Runs 94 tests across 5 suites: request validation, filtering logic, schema validation, metrics collection, and end-to-end technician workflows.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | TypeScript / Node.js 24 |
| LLM Orchestration | Genkit |
| LLM | Gemini 2.0 Flash via Vertex AI |
| Database | Firebase Firestore |
| API | Firebase Cloud Functions v2 (SSE streaming) |
| Frontend | TypeScript → esbuild → vanilla JS (IIFE) |
| Auth | Backend-verified demo password |
| Testing | Jest + ts-jest (94 tests) |
| Observability | Cloud Logging + Cloud Trace + Cloud Monitoring |
| Deployment | Firebase Hosting + Functions |

## Example Prompts

1. **"Drager Evita V500 showing error 57, fan module is not spinning"** — Fan Module Assembly, high confidence
2. **"Philips IntelliVue MX800 screen went black, no display output"** — Display Panel LCD
3. **"GE Optima CT660 tube arc fault during scan, mA calibration error"** — X-Ray Tube Assembly with critical warnings
4. **"Zoll R Series defibrillator won't hold charge, battery light flashing"** — Battery Pack with quality-prioritized supplier ranking
5. **"broken coffee maker"** — No match, low confidence
6. **"ventilator is broken"** — Asks clarifying questions
