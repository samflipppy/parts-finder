# PartsFinder Agent

An AI-powered healthcare equipment diagnostic and procurement assistant built with Firebase and Google Genkit. Hospital biomedical technicians describe a broken equipment problem in plain language and the agent identifies the correct replacement part, searches a mock parts database, scores available suppliers using a weighted quality model, and returns a ranked recommendation with full reasoning.

## Prerequisites

- **Node.js 18+**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Google AI API key** — obtain from [Google AI Studio](https://aistudio.google.com/apikey)
- A Firebase project with Firestore enabled

## Setup

### 1. Install dependencies

```bash
cd functions
npm install
```

### 2. Configure the API key

Create a `.env` file inside the `functions/` directory:

```
GOOGLE_GENAI_API_KEY=your-api-key-here
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

Or seed a live Firestore instance:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npx tsx src/seed.ts
```

### 4. Run locally

```bash
firebase emulators:start
```

The frontend will be available at `http://localhost:5000` and the API at `http://localhost:5001/<project-id>/us-central1/diagnose`.

## Deploy

```bash
firebase deploy
```

This deploys Cloud Functions and Hosting in one command.

## Example prompts

Try these in the UI:

1. **"Drager Evita V500 showing error 57, fan module is not spinning"** — Should return Fan Module Assembly with high confidence
2. **"Philips IntelliVue MX800 screen went black, no display output"** — Should return Display Panel LCD
3. **"GE Optima CT660 tube arc fault during scan, mA calibration error"** — Should return X-Ray Tube Assembly with critical warnings
4. **"Zoll R Series defibrillator won't hold charge, battery light flashing"** — Should return Battery Pack with quality-prioritized supplier ranking
5. **"broken coffee maker"** — Should return no match and low confidence
6. **"ventilator is broken"** — Should return multiple possibilities with medium confidence

## Architecture

```
[Technician Input]
    -> [Cloud Function: POST /api/diagnose]
        -> [Genkit Flow: diagnoseAndRecommend]
            -> [LLM parses input into structured query]
            -> [Tool: searchParts] -> Firestore parts collection
            -> [Tool: getSuppliers] -> Firestore suppliers collection
            -> [LLM ranks suppliers using weighted scoring]
            -> [Structured JSON response]
        -> [Frontend renders recommendation]
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | TypeScript / Node.js |
| LLM Orchestration | Genkit |
| LLM | Gemini 2.0 Flash via Google AI |
| Database | Firebase Firestore |
| API | Firebase Cloud Functions v2 |
| Frontend | Single HTML page with vanilla JS |
| Deployment | Firebase Hosting + Functions |
