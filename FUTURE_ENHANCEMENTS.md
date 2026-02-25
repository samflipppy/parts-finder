# Future Enhancements — PartsFinder

Production readiness improvements, scaling strategies, and architectural upgrades.

---

## 1. Firestore Composite Indexes

Right now we rely on Firestore auto-indexing for single-field queries. As data grows, composite indexes will dramatically speed up multi-field lookups.

**What to add** (`firestore.indexes.json`):

```json
{
  "indexes": [
    {
      "collectionGroup": "parts",
      "fields": [
        { "fieldPath": "manufacturer", "order": "ASCENDING" },
        { "fieldPath": "category", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "work_orders",
      "fields": [
        { "fieldPath": "assetId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "equipment_assets",
      "fields": [
        { "fieldPath": "department", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "section_embeddings",
      "fields": [
        { "fieldPath": "manufacturer", "order": "ASCENDING" },
        { "fieldPath": "equipmentName", "order": "ASCENDING" }
      ]
    }
  ]
}
```

**Lowercase normalized fields** — Firestore `where()` is case-sensitive. To avoid full-collection loads with client-side lowercasing, store a `manufacturer_lower` field alongside `manufacturer` on write. Query against the normalized field. This lets you push more filters server-side without worrying about "Drager" vs "drager" mismatches.

**Deploy**: `firebase deploy --only firestore:indexes`

---

## 2. RAG Storage — Moving Beyond In-Memory Vector Search

Currently `searchManual` loads all `section_embeddings` documents into memory, computes cosine similarity in JS, and returns the top-K results. This works fine for hundreds of embeddings but breaks down at scale.

### Option A: Firestore Vector Search (Simplest Migration)

Firestore now supports native vector similarity search via [KNN vector indexes](https://firebase.google.com/docs/firestore/vector-search). This is the lowest-effort upgrade since data already lives in Firestore.

**What changes**:
- Add a vector index on `section_embeddings.embedding` (dimension 768 for text-embedding-004)
- Replace the manual cosine similarity loop with a single Firestore `findNearest()` query
- Remove `cosineSimilarity()` helper entirely

```typescript
// Before: load all docs, compute similarity in JS
const embSnap = await embQuery.get();
const scored = allEmbeddings.map(emb => ({
  emb,
  score: cosineSimilarity(queryEmbedding, emb.embedding),
}));

// After: Firestore handles vector search server-side
const results = await embQuery
  .findNearest("embedding", queryEmbedding, {
    limit: 5,
    distanceMeasure: "COSINE",
  })
  .get();
```

**When to do it**: Once you have more than ~500 embeddings. Below that, the in-memory approach is fine.

### Option B: Vertex AI Vector Search (Full Scale)

For tens of thousands of manual sections across many equipment manufacturers, use [Vertex AI Vector Search](https://cloud.google.com/vertex-ai/docs/vector-search/overview) (managed Matching Engine).

**What changes**:
- Embeddings stored in a Vector Search index (not Firestore)
- Query via Vertex AI SDK instead of Firestore
- Keep Firestore for metadata, Vector Search for similarity
- Supports filtering (manufacturer, equipmentName) at the index level

**When to do it**: 10K+ embeddings or sub-100ms latency requirements.

### Option C: Pinecone / Weaviate (If Leaving GCP)

If the project moves off Google Cloud, a managed vector DB like Pinecone or Weaviate replaces both the embedding storage and search. Same concept — just different SDK calls.

---

## 3. Containerization & Kubernetes

The app currently deploys as Firebase Functions (serverless). This is great for low traffic but has limitations: cold starts (~2-5s for the first request), 300s max timeout, no persistent connections, and limited control over scaling behavior.

### Dockerize the Backend

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY functions/package*.json ./
RUN npm ci --omit=dev
COPY functions/lib/ ./lib/
EXPOSE 8080
CMD ["node", "lib/index.js"]
```

The Cloud Functions entry point (`index.ts`) already exports HTTP handlers via `onRequest()`. To run standalone, add an Express wrapper:

```typescript
// server.ts — standalone entrypoint for containerized deployment
import express from "express";
const app = express();
app.post("/api/chat", chatHandler);
app.post("/api/feedback", feedbackHandler);
app.get("/api/metrics", metricsHandler);
app.listen(8080);
```

### Cloud Run (Stepping Stone)

Before jumping to Kubernetes, Cloud Run gives you containers without cluster management:
- No cold starts with `--min-instances=1`
- Concurrency control (multiple requests per instance)
- Auto-scales to zero when idle
- Same Docker image, just `gcloud run deploy`

### GKE / Kubernetes (Full Control)

When you need fine-grained scaling, persistent connections, or GPU access (for local model inference):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: partsfinder-api
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: api
          image: gcr.io/parts-test-93b26/partsfinder-api:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: GOOGLE_CLOUD_PROJECT
              value: "parts-test-93b26"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: partsfinder-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: partsfinder-api
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**When to do it**: When you need >1000 concurrent users, persistent WebSocket connections, or want to run embedding models locally instead of calling Vertex AI.

---

## 4. Authentication & Multi-Tenancy

Currently the app uses an optional `x-demo-password` header. For production:

- **Firebase Auth** — Add Google/SSO sign-in. Each request includes a Firebase ID token. Backend validates with `admin.auth().verifyIdToken(token)`.
- **Per-hospital tenancy** — Scope Firestore data by hospital/org. Each collection gets a `tenantId` field. Security rules enforce `request.auth.token.tenantId == resource.data.tenantId`.
- **Role-based access** — Technicians see equipment + parts. Managers see metrics + cost data. Admins manage manuals and seed data.

---

## 5. CI/CD Pipeline

No automated pipeline exists today. A basic GitHub Actions workflow:

```yaml
name: Build & Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: cd functions && npm ci && npm test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          firebaseServiceAccount: ${{ secrets.FIREBASE_SA }}
          channelId: live
```

---

## 6. Caching Layer

Every request currently hits Firestore + Vertex AI. For repeated questions about the same equipment:

- **Embedding cache** — Cache `embedQuery()` results in memory (or Redis). Same query text = same embedding vector. Saves a Vertex AI API call per repeated question.
- **Parts lookup cache** — Cache `searchParts` results by manufacturer + equipmentName. Parts data changes infrequently. TTL of 1 hour is safe.
- **Manual section cache** — Service manual content is static. Cache indefinitely, invalidate on manual update.

For Firebase Functions (stateless), use [Firebase App Check + CDN caching](https://firebase.google.com/docs/app-check) or add Redis via [Memorystore](https://cloud.google.com/memorystore). For Cloud Run/GKE, an in-process LRU cache works since instances are long-lived.

---

## 7. Rate Limiting & Abuse Prevention

Current rate limiter is in-memory (per Cloud Functions instance). Each new instance gets a fresh counter, so limits don't actually work across instances.

**Fix**: Move rate limiting to Firestore counters or Redis. Or use [Cloud Armor](https://cloud.google.com/armor) at the load balancer level for IP-based throttling without any application code.

---

## 8. Observability Upgrades

Current setup uses structured logging + Cloud Monitoring dashboard. To go deeper:

- **Error tracking** — Integrate [Error Reporting](https://cloud.google.com/error-reporting) or Sentry. Get alerts on new error types, not just error counts.
- **LLM-specific metrics** — Track token usage per request (prompt + completion tokens), cost per query, hallucination detection scores.
- **Alerting policies** — Set up Cloud Monitoring alerts: error rate > 5%, P95 latency > 10s, feedback rating drops below 3.0 average.
- **Request tracing** — Add correlation IDs from frontend to backend. Currently traces start at the Cloud Function; extend them to include the full browser-to-response lifecycle.

---

## 9. Offline / Edge Support

Hospital networks can be unreliable. For critical uptime:

- **Service worker** — Cache the UI shell and recent responses. Show cached results when offline.
- **Local model fallback** — Run a smaller model (e.g. Gemma) on-premise for basic part lookups when the cloud API is unreachable. Full RAG still needs connectivity, but simple keyword matching against a local SQLite cache of parts data would cover 80% of cases.

---

## 10. Data Pipeline for Manual Ingestion

Currently, service manuals are seeded via `npm run seed` with hardcoded JSON. For production:

- **PDF → structured data pipeline** — Use [Document AI](https://cloud.google.com/document-ai) to extract sections, tables, and figures from manufacturer PDFs.
- **Automatic re-embedding** — When a manual is added or updated, trigger a Cloud Function that generates new `section_embeddings` documents automatically.
- **Version tracking** — Track manual revisions. When a technician gets advice based on an old manual version, flag it.
