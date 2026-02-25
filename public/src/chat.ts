/**
 * PartsFinder — Repair Assistant chat UI.
 * Streams from POST /api/chat (SSE).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ManualReference {
  manualId: string;
  sectionId: string;
  sectionTitle: string;
  quotedText: string;
  pageHint?: string | null;
}

interface RecommendedPart {
  name: string;
  partNumber: string;
  description: string;
  avgPrice: number;
  criticality: string;
}

interface RepairGuide {
  title: string;
  estimatedTime: string;
  difficulty: string;
  safetyWarnings: string[];
  steps: string[];
  tools: string[];
}

interface SupplierRank {
  supplierName: string;
  qualityScore: number;
  deliveryDays: number;
  reasoning: string;
}

interface AlternativePart {
  name: string;
  partNumber: string;
  reason: string;
}

interface EquipmentAsset {
  assetId: string;
  assetTag: string;
  department: string;
  location: string;
  hoursLogged: number;
  warrantyExpiry: string;
  status: string;
}

interface RAGScore {
  sectionTitle: string;
  score: number;
}

interface RAGTrace {
  searchMode: string;
  topScores?: RAGScore[];
  similarityThreshold: number;
}

interface FilterStep {
  filter: string;
  value: string;
  remaining: number;
}

interface ToolCall {
  toolName: string;
  latencyMs: number;
  resultCount: number;
  input?: Record<string, unknown>;
  ragTrace?: RAGTrace;
  filterSteps?: FilterStep[];
}

interface Metrics {
  toolCalls: ToolCall[];
  totalToolCalls: number;
  totalLatencyMs: number;
  avgToolLatencyMs: number;
}

interface ChatAgentResponse {
  type: "diagnosis" | "clarification" | "guidance" | "photo_analysis";
  message: string;
  manualReferences: ManualReference[];
  diagnosis: string | null;
  recommendedPart: RecommendedPart | null;
  repairGuide: RepairGuide | null;
  supplierRanking: SupplierRank[];
  alternativeParts: AlternativePart[];
  confidence: "high" | "medium" | "low" | null;
  reasoning: string | null;
  warnings: string[];
  equipmentAsset: EquipmentAsset | null;
  _metrics?: Metrics;
}

interface ToolDoneEvent { type: "tool_done"; toolName: string; resultCount: number; latencyMs: number }
interface TextChunkEvent { type: "text_chunk"; text: string }
interface CompleteEvent { type: "complete"; response: ChatAgentResponse }
interface StreamErrorEvent { type: "error"; message: string }
interface PhaseEvent { type: "phase_structuring" }
type SSEEvent = ToolDoneEvent | TextChunkEvent | CompleteEvent | StreamErrorEvent | PhaseEvent;

type ToolName =
  | "lookupAsset"
  | "getRepairHistory"
  | "listManualSections"
  | "searchManual"
  | "getManualSection"
  | "searchParts"
  | "getSuppliers"
  | "getRepairGuide";

// ---------------------------------------------------------------------------
// Constants & auth
// ---------------------------------------------------------------------------

const STREAM_URL = "/api/chat";
const AUTH_KEY = "partsfinder_demo_pw";

function getStoredPassword(): string | null {
  return sessionStorage.getItem(AUTH_KEY);
}

function setStoredPassword(pw: string): void {
  sessionStorage.setItem(AUTH_KEY, pw);
}

function clearStoredPassword(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

const TOOL_ICONS: Record<ToolName, string> = {
  lookupAsset: "\u{1F3E5}",
  getRepairHistory: "\u{1F4CB}",
  listManualSections: "\u{1F4D6}",
  searchManual: "\u{1F50D}",
  getManualSection: "\u{1F4C4}",
  searchParts: "\u{1F527}",
  getSuppliers: "\u{1F4E6}",
  getRepairGuide: "\u{1F6E0}",
};

const TOOL_LABELS: Record<ToolName, string> = {
  lookupAsset: "Looking up equipment asset",
  getRepairHistory: "Checking repair history",
  listManualSections: "Loading service manual",
  searchManual: "Searching manual sections",
  getManualSection: "Reading manual section",
  searchParts: "Searching parts catalog",
  getSuppliers: "Getting supplier data",
  getRepairGuide: "Loading repair guide",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const messages: ChatMessage[] = [];

// ---------------------------------------------------------------------------
// DOM refs (cast once at startup)
// ---------------------------------------------------------------------------

const chatMessages = document.getElementById("chat-messages")!;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const debugPanel = document.getElementById("debug-panel");
const debugLog = document.getElementById("debug-log");
const debugCopyBtn = document.getElementById("debug-copy-btn");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function setLoading(loading: boolean): void {
  sendBtn.disabled = loading;
  chatInput.disabled = loading;
}

function logClientError(info: Record<string, unknown>): void {
  try { console.error("[chat-ui] Client error", info); } catch { /* noop */ }
  if (!debugPanel || !debugLog) return;
  let text: string;
  try { text = JSON.stringify(info, null, 2); } catch { text = String(info); }
  debugLog.textContent = text;
  debugPanel.classList.remove("hidden");
}

function scrollToBottom(): void {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------------------------------------------------------------------------
// Password gate
// ---------------------------------------------------------------------------

function showPasswordGate(): void {
  const existing = document.getElementById("pw-gate");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.id = "pw-gate";
  overlay.className = "pw-gate-overlay";

  overlay.innerHTML =
    `<div class="pw-gate-card">` +
      `<div class="pw-gate-title">PartsSource Demo</div>` +
      `<p class="pw-gate-desc">Enter the demo password to continue.</p>` +
      `<form id="pw-gate-form" class="pw-gate-form">` +
        `<input id="pw-gate-input" type="password" placeholder="Password" class="pw-gate-input" autocomplete="off" />` +
        `<button type="submit" class="pw-gate-btn">Enter</button>` +
      `</form>` +
      `<p id="pw-gate-error" class="pw-gate-error"></p>` +
    `</div>`;

  document.body.appendChild(overlay);

  const form = document.getElementById("pw-gate-form")!;
  const input = document.getElementById("pw-gate-input") as HTMLInputElement;
  const errorEl = document.getElementById("pw-gate-error")!;

  input.focus();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = input.value.trim();
    if (!pw) return;

    // Verify against the backend with a lightweight HEAD-style check
    fetch(STREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demo-password": pw,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    }).then((res) => {
      if (res.status === 401) {
        errorEl.textContent = "Wrong password. Try again.";
        input.value = "";
        input.focus();
        return;
      }
      // Password accepted (or no password required)
      setStoredPassword(pw);
      overlay.remove();
    }).catch(() => {
      errorEl.textContent = "Connection error. Try again.";
    });
  });
}

// Check auth on load — if no stored password, probe the API
function initAuth(): void {
  const stored = getStoredPassword();
  if (stored !== null) return; // already authenticated this session

  // Probe the API to see if a password is required
  fetch(STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
  }).then((res) => {
    if (res.status === 401) {
      showPasswordGate();
    } else {
      // No password required — store empty marker so we don't re-check
      setStoredPassword("");
    }
  }).catch(() => {
    // Backend unreachable — show gate so user can enter password for when it's up
    showPasswordGate();
  });
}

initAuth();

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

(function showGreeting(): void {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble-assistant greeting-bubble";

  const msg = document.createElement("div");
  msg.className = "bubble-text";
  msg.textContent =
    "Hey! I'm your PartsSource Repair Intelligence Agent \u2014 think of me as " +
    "the colleague who always has the service manual open.\n\n" +
    "Tell me what equipment you're working on \u2014 make, model, error codes, " +
    "symptoms, asset tag, anything you've got. I'll pull up the manual, " +
    "find the right part, and walk you through the repair.";
  bubble.appendChild(msg);

  chatMessages.appendChild(bubble);
})();

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

sendBtn.addEventListener("click", handleSend);

chatInput.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

chatInput.addEventListener("input", function (this: HTMLTextAreaElement) {
  this.style.height = "auto";
  this.style.height = `${Math.min(this.scrollHeight, 120)}px`;
});

if (debugCopyBtn && debugLog) {
  debugCopyBtn.addEventListener("click", () => {
    if (!debugLog.textContent) return;
    navigator.clipboard?.writeText(debugLog.textContent).catch(() => {
      console.warn("Failed to copy debug log to clipboard.");
    });
  });
}

document.querySelectorAll<HTMLButtonElement>(".chat-examples .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.textContent ?? "";
    chatInput.focus();
    chatInput.dispatchEvent(new Event("input"));
  });
});

// ---------------------------------------------------------------------------
// Main send handler (SSE streaming)
// ---------------------------------------------------------------------------

function handleSend(): void {
  const text = chatInput.value.trim();
  if (!text) return;

  messages.push({ role: "user", content: text });
  appendBubble("user", text);

  chatInput.value = "";
  chatInput.style.height = "auto";
  setLoading(true);

  // Streaming progress bubble
  const streamBubble = document.createElement("div");
  streamBubble.className = "chat-bubble chat-bubble-assistant stream-bubble";
  chatMessages.appendChild(streamBubble);

  const progressEl = document.createElement("div");
  progressEl.className = "stream-progress";
  streamBubble.appendChild(progressEl);

  const streamTextEl = document.createElement("div");
  streamTextEl.className = "stream-text";
  streamBubble.appendChild(streamTextEl);

  const completedTools: ToolDoneEvent[] = [];
  let streamedText = "";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const pw = getStoredPassword();
  if (pw) headers["x-demo-password"] = pw;

  fetch(STREAM_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
  })
    .then((res) => {
      if (res.status === 401) {
        clearStoredPassword();
        showPasswordGate();
        throw new Error("Session expired. Please re-enter the demo password.");
      }

      if (!res.ok) {
        return res.text().then((body) => {
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(body); } catch { parsed = { error: body }; }
          let msg = (parsed.error as string) || `Request failed with status ${res.status}`;
          if (parsed.detail) msg += `\n\nDetail: ${parsed.detail}`;
          logClientError({
            source: "chat_stream",
            phase: "response_not_ok",
            status: res.status,
            body: parsed,
            lastUserMessage: text,
            timestamp: new Date().toISOString(),
          });
          throw new Error(msg);
        });
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function readChunk(): Promise<void> {
        return reader.read().then((result) => {
          if (result.done) return;

          buffer += decoder.decode(result.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            let event: SSEEvent;
            try { event = JSON.parse(trimmed.substring(6)); } catch { continue; }

            switch (event.type) {
              case "tool_done":
                completedTools.push(event);
                renderToolProgress(progressEl, completedTools);
                break;
              case "text_chunk":
                streamedText += event.text;
                streamTextEl.textContent = streamedText;
                scrollToBottom();
                break;
              case "phase_structuring": {
                const phaseEl = document.createElement("div");
                phaseEl.className = "stream-phase-indicator";
                phaseEl.textContent = "Structuring response...";
                progressEl.appendChild(phaseEl);
                break;
              }
              case "complete":
                streamBubble.remove();
                renderAssistantResponse(event.response);
                break;
              case "error":
                streamBubble.remove();
                appendBubble("error", event.message || "Something went wrong.");
                break;
            }
          }

          return readChunk();
        });
      }

      return readChunk();
    })
    .catch((err: Error) => {
      logClientError({
        source: "chat_stream",
        phase: "network_or_parse_error",
        errorMessage: err.message ?? String(err),
        stack: err.stack,
        lastUserMessage: text,
        timestamp: new Date().toISOString(),
      });
      streamBubble.remove();
      appendBubble("error", err.message || "Something went wrong. Please try again.");
    })
    .finally(() => {
      setLoading(false);
      chatInput.focus();
    });
}

// ---------------------------------------------------------------------------
// Tool progress rendering
// ---------------------------------------------------------------------------

function renderToolProgress(container: HTMLElement, tools: ToolDoneEvent[]): void {
  const phaseIndicator = container.querySelector(".stream-phase-indicator");
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "stream-progress-header";
  header.textContent = "Researching...";
  container.appendChild(header);

  for (const tool of tools) {
    const el = document.createElement("div");
    el.className = "stream-tool-item";

    const icon = TOOL_ICONS[tool.toolName as ToolName] ?? "\u2699";
    const label = TOOL_LABELS[tool.toolName as ToolName] ?? tool.toolName;
    const plural = tool.resultCount !== 1 ? "s" : "";

    el.innerHTML =
      `<span class="tool-icon">${icon}</span>` +
      `<span class="tool-label">${escapeHtml(label)}</span>` +
      `<span class="tool-result">${tool.resultCount} result${plural}</span>` +
      `<span class="tool-latency">${tool.latencyMs}ms</span>`;

    container.appendChild(el);
  }

  if (phaseIndicator) container.appendChild(phaseIndicator);
  scrollToBottom();
}

// ---------------------------------------------------------------------------
// Bubble rendering
// ---------------------------------------------------------------------------

function appendBubble(role: string, text: string): HTMLDivElement {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble chat-bubble-${role}`;

  const p = document.createElement("div");
  p.className = "bubble-text";
  p.textContent = text;
  bubble.appendChild(p);

  chatMessages.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function renderAssistantResponse(data: ChatAgentResponse): void {
  messages.push({ role: "assistant", content: data.message });

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble-assistant";

  // Main message
  const msg = document.createElement("div");
  msg.className = "bubble-text";
  msg.textContent = data.message;
  bubble.appendChild(msg);

  // Equipment asset info
  if (data.equipmentAsset) {
    bubble.appendChild(renderAssetCard(data.equipmentAsset));
  }

  // Manual references
  if (data.manualReferences.length > 0) {
    const refsDiv = document.createElement("div");
    refsDiv.className = "manual-refs";

    const refsHeader = document.createElement("div");
    refsHeader.className = "refs-header";
    refsHeader.textContent = "Manual References";
    refsDiv.appendChild(refsHeader);

    for (const ref of data.manualReferences) {
      const refEl = document.createElement("div");
      refEl.className = "manual-ref";

      const title = document.createElement("div");
      title.className = "ref-title";
      title.textContent = ref.sectionTitle + (ref.pageHint ? ` (${ref.pageHint})` : "");
      refEl.appendChild(title);

      const quote = document.createElement("blockquote");
      quote.className = "ref-quote";
      quote.textContent = ref.quotedText;
      refEl.appendChild(quote);

      refsDiv.appendChild(refEl);
    }

    bubble.appendChild(refsDiv);
  }

  // Warnings
  for (const w of data.warnings) {
    const warn = document.createElement("div");
    warn.className = "bubble-warning";
    warn.textContent = w;
    bubble.appendChild(warn);
  }

  // Recommended part card
  if (data.recommendedPart) {
    bubble.appendChild(renderPartCard(data.recommendedPart, "Recommended Part"));
  }

  // Alternative parts
  if (data.alternativeParts.length > 0) {
    const altsDiv = document.createElement("div");
    altsDiv.className = "alternatives-section";

    const altsHeader = document.createElement("div");
    altsHeader.className = "refs-header";
    altsHeader.textContent = "Alternatives";
    altsDiv.appendChild(altsHeader);

    for (const alt of data.alternativeParts) {
      altsDiv.appendChild(renderAltPartCard(alt));
    }

    bubble.appendChild(altsDiv);
  }

  // Confidence badge
  if (data.confidence) {
    const conf = document.createElement("div");
    conf.className = "bubble-confidence";
    conf.innerHTML = `Confidence: <span class="badge badge-confidence-${escapeHtml(data.confidence)}">${escapeHtml(data.confidence)}</span>`;
    bubble.appendChild(conf);
  }

  // Agent trace
  if (data._metrics || data.reasoning) {
    const traceEl = renderAgentTrace(data);
    if (traceEl) {
      traceEl.open = true;
      bubble.appendChild(traceEl);
    }
  }

  chatMessages.appendChild(bubble);
  scrollToBottom();
}

// ---------------------------------------------------------------------------
// Equipment asset card
// ---------------------------------------------------------------------------

function renderAssetCard(asset: EquipmentAsset): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "bubble-asset-card";

  const warrantyDate = new Date(asset.warrantyExpiry);
  const warrantyActive = warrantyDate > new Date();
  const warrantyClass = warrantyActive ? "warranty-active" : "warranty-expired";
  const warrantyText = warrantyActive ? "Under Warranty" : "Warranty Expired";

  card.innerHTML =
    `<div class="asset-card-header">` +
      `<span class="asset-card-title">Equipment Asset</span>` +
      `<span class="badge ${warrantyClass}">${warrantyText}</span>` +
    `</div>` +
    `<div class="asset-card-grid">` +
      `<div class="asset-field"><span class="asset-label">Asset Tag</span><span class="mono">${escapeHtml(asset.assetTag)}</span></div>` +
      `<div class="asset-field"><span class="asset-label">Department</span><span>${escapeHtml(asset.department)}</span></div>` +
      `<div class="asset-field"><span class="asset-label">Location</span><span>${escapeHtml(asset.location)}</span></div>` +
      `<div class="asset-field"><span class="asset-label">Hours</span><span class="mono">${asset.hoursLogged.toLocaleString()}</span></div>` +
      `<div class="asset-field"><span class="asset-label">Status</span><span class="badge badge-status-${escapeHtml(asset.status)}">${escapeHtml(asset.status)}</span></div>` +
      `<div class="asset-field"><span class="asset-label">Warranty</span><span>${escapeHtml(asset.warrantyExpiry)}</span></div>` +
    `</div>`;

  return card;
}

// ---------------------------------------------------------------------------
// Part cards
// ---------------------------------------------------------------------------

function renderPartCard(part: RecommendedPart, label: string): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "bubble-part-card";

  card.innerHTML =
    `<div class="part-card-title">${escapeHtml(label)}</div>` +
    `<div class="part-card-row"><span class="part-card-label">Name</span><span>${escapeHtml(part.name)}</span></div>` +
    `<div class="part-card-row"><span class="part-card-label">P/N</span><span class="mono">${escapeHtml(part.partNumber)}</span></div>` +
    `<div class="part-card-row"><span class="part-card-label">Avg Price</span><span>$${(part.avgPrice || 0).toLocaleString()}</span></div>` +
    `<div class="part-card-row"><span class="part-card-label">Criticality</span><span class="badge badge-${escapeHtml(part.criticality || "standard")}">${escapeHtml(part.criticality || "standard")}</span></div>`;

  return card;
}

function renderAltPartCard(alt: AlternativePart): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "bubble-alt-card";

  card.innerHTML =
    `<div class="alt-card-info">` +
      `<div class="alt-card-name">${escapeHtml(alt.name)}</div>` +
      `<div class="alt-card-pn mono">${escapeHtml(alt.partNumber)}</div>` +
      `<div class="alt-card-reason">${escapeHtml(alt.reason)}</div>` +
    `</div>`;

  return card;
}

// ---------------------------------------------------------------------------
// Agent trace
// ---------------------------------------------------------------------------

function renderAgentTrace(data: ChatAgentResponse): HTMLDetailsElement | null {
  const metrics = data._metrics ?? ({} as Partial<Metrics>);
  const toolCalls = metrics.toolCalls ?? [];
  let html = "";

  if (data.reasoning) {
    html += `<div class="trace-reasoning-block">`;
    html += `<div class="trace-tool-header">Agent Reasoning</div>`;
    html += `<div class="trace-reasoning-text">${escapeHtml(data.reasoning)}</div>`;
    html += `</div>`;
  }

  if (toolCalls.length > 0) {
    const sequence = toolCalls.map((tc) => tc.toolName);
    html += `<div class="trace-sequence-bar">`;
    html += `<span class="trace-seq-label">Tool chain:</span> `;
    html += sequence
      .map((name, i) =>
        `<span class="trace-seq-step">${escapeHtml(name)}</span>` +
        (i < sequence.length - 1 ? ` <span class="trace-seq-arrow">&rarr;</span> ` : "")
      )
      .join("");
    html += ` <span class="trace-latency">(${metrics.totalLatencyMs ?? 0}ms total)</span>`;
    html += `</div>`;
  }

  for (let idx = 0; idx < toolCalls.length; idx++) {
    const tc = toolCalls[idx];
    const plural = tc.resultCount !== 1 ? "s" : "";

    html += `<div class="trace-tool-block">`;
    html += `<div class="trace-tool-header">` +
      `<span class="trace-tool-num">${idx + 1}</span> ` +
      escapeHtml(tc.toolName) +
      `<span class="trace-latency trace-header-latency">${tc.latencyMs}ms</span>` +
      `</div>`;

    if (tc.input && Object.keys(tc.input).length > 0) {
      html += `<div class="trace-log-line trace-input-line">`;
      html += `<span class="trace-label">Input:</span> `;
      html += Object.entries(tc.input)
        .map(([key, val]) =>
          `<span class="trace-filter-name">${escapeHtml(key)}</span>=` +
          `<span class="trace-filter-val">${escapeHtml(JSON.stringify(val))}</span>`
        )
        .join(", ");
      html += `</div>`;
    }

    if (tc.toolName === "listManualSections") {
      html += tc.resultCount > 0
        ? `<div class="trace-log-line trace-success">Loaded manual: <strong>${tc.resultCount} sections</strong></div>`
        : `<div class="trace-log-line trace-warn">No manual found</div>`;
    }

    if (tc.toolName === "searchManual" && tc.ragTrace) {
      const rag = tc.ragTrace;
      html += `<div class="trace-log-line"><span class="trace-label">Mode:</span> <strong>${escapeHtml(rag.searchMode)}</strong>` +
        (rag.searchMode === "vector" ? " (semantic RAG)" : " (keyword fallback)") + `</div>`;
      if (rag.searchMode === "vector" && rag.topScores?.length) {
        for (const s of rag.topScores) {
          const passed = s.score >= rag.similarityThreshold;
          const cls = passed ? "trace-score-pass" : "trace-score-fail";
          const mark = passed ? "\u2713" : "\u2717";
          html += `<div class="trace-log-line rag-score-line"><span class="${cls}">${mark} ${s.score.toFixed(4)}</span> ${escapeHtml(s.sectionTitle)}</div>`;
        }
      }
    }

    if (tc.toolName === "searchParts" && tc.filterSteps?.length) {
      for (const step of tc.filterSteps) {
        html += `<div class="trace-log-line rag-score-line">` +
          `<span class="trace-filter-name">${escapeHtml(step.filter)}</span>=` +
          `<span class="trace-filter-val">${escapeHtml(step.value)}</span>` +
          ` &rarr; <span class="trace-narrowing">${step.remaining} remaining</span></div>`;
      }
    }

    if (tc.toolName === "lookupAsset") {
      html += tc.resultCount > 0
        ? `<div class="trace-log-line trace-success">Asset found</div>`
        : `<div class="trace-log-line trace-warn">Asset not found</div>`;
    }

    if (tc.toolName === "getRepairHistory") {
      html += `<div class="trace-log-line">${tc.resultCount} past work order${plural}</div>`;
    }

    html += `<div class="trace-log-line trace-result-line">&rarr; <strong>${tc.resultCount}</strong> result${plural}</div>`;
    html += `</div>`;
  }

  if ((metrics.totalToolCalls ?? 0) > 0) {
    html += `<div class="trace-summary">`;
    html += `<span>${metrics.totalToolCalls} tool call${metrics.totalToolCalls !== 1 ? "s" : ""}</span>`;
    if (metrics.totalLatencyMs) html += ` &middot; <span>${metrics.totalLatencyMs}ms total</span>`;
    if (metrics.avgToolLatencyMs) html += ` &middot; <span>${metrics.avgToolLatencyMs}ms avg/tool</span>`;
    if (data.confidence) html += ` &middot; <span>Confidence: ${escapeHtml(data.confidence)}</span>`;
    html += `</div>`;
  }

  if (!html) return null;

  const section = document.createElement("details");
  section.className = "trace-section chat-trace";
  const summary = document.createElement("summary");
  summary.innerHTML = `Agent Trace <span class="trace-badge">${toolCalls.length} tool${toolCalls.length !== 1 ? "s" : ""}</span>`;
  section.appendChild(summary);
  const content = document.createElement("div");
  content.className = "trace-tool-logs";
  content.innerHTML = html;
  section.appendChild(content);
  return section;
}
