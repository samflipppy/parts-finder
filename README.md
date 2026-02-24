# PartsFinder Agent

An AI-powered healthcare equipment diagnostic and procurement assistant built with Firebase, Google Genkit, and Vertex AI. Hospital biomedical technicians describe a broken equipment problem in plain language and the agent identifies the correct replacement part, searches a mock parts database, retrieves relevant service manual sections via RAG, scores available suppliers using a weighted quality model, and returns a ranked recommendation with full reasoning.

## Prerequisites

- **Node.js 22+**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Google Cloud project** with Vertex AI API enabled
- A Firebase project with Firestore enabled
- Service account credentials with Vertex AI access

## Setup

### 1. Install dependencies

```bash
cd functions
npm install
```

### 2. Configure credentials

Ensure your Google Cloud service account has access to Vertex AI. For local development:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 3. Seed the database

Start the Firestore emulator (or point to a live project) and run the seeder:

```bash
# Using the emulator
firebase emulators:start --only firestore

# In another terminal
cd functions
npm run seed
```

### 4. Generate embeddings (for RAG search)

```bash
cd functions
npx tsx src/embed-sections.ts
```

This creates vector embeddings for all service manual sections, enabling semantic search.

### 5. Run locally

```bash
firebase emulators:start
```

The frontend will be available at `http://localhost:5000` and the API at `http://localhost:5001/<project-id>/us-central1/chat`.

## Deploy

```bash
firebase deploy
```

This deploys Cloud Functions and Hosting in one command.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Multi-turn diagnostic chat (returns full response) |
| `/api/chatStream` | POST | Streaming version with SSE events for tool progress |
| `/api/metrics` | GET | Recent request metrics and aggregate stats |

## Example Prompts

Try these in the UI:

1. **"Drager Evita V500 showing error 57, fan module is not spinning"** -- Should return Fan Module Assembly with high confidence
2. **"Philips IntelliVue MX800 screen went black, no display output"** -- Should return Display Panel LCD
3. **"GE Optima CT660 tube arc fault during scan, mA calibration error"** -- Should return X-Ray Tube Assembly with critical warnings
4. **"Zoll R Series defibrillator won't hold charge, battery light flashing"** -- Should return Battery Pack with quality-prioritized supplier ranking
5. **"broken coffee maker"** -- Should return no match and low confidence
6. **"ventilator is broken"** -- Should return multiple possibilities with medium confidence

## Architecture

```
[Technician Input]
    -> [Cloud Function: POST /api/chat]
        -> [Genkit Flow: diagnosticPartnerChat]
            Phase 1 — Research (tool calling):
                -> [listManualSections] -> Firestore service_manuals
                -> [searchManual] -> Vector search on section_embeddings
                -> [getManualSection] -> Fetch full section content
                -> [searchParts] -> Firestore parts collection
                -> [getSuppliers] -> Firestore suppliers collection
                -> [getRepairGuide] -> Firestore repair_guides
            Phase 2 — Structuring:
                -> [LLM converts research to structured JSON]
        -> [ChatAgentResponse with diagnosis, parts, suppliers, manual refs]
    -> [Frontend renders recommendation with agent trace]
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | TypeScript / Node.js |
| LLM Orchestration | Genkit |
| LLM | Gemini 2.0 Flash via Vertex AI |
| Database | Firebase Firestore |
| API | Firebase Cloud Functions v2 |
| Frontend | Single HTML page with vanilla JS |
| Testing | Jest with ts-jest |
| Observability | OpenTelemetry tracing + custom metrics |
| Deployment | Firebase Hosting + Functions |

## Testing

```bash
cd functions
npm test
```

Runs 72 tests across 4 suites covering request validation, filtering logic, schema validation, metrics collection, and end-to-end technician workflows.
