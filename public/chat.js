/**
 * PartsFinder — Repair Assistant chat UI.
 * Vanilla JS. Streams from POST /api/chatStream (SSE).
 */
(function () {
  "use strict";

  var STREAM_URL = "/api/chat";

  // Conversation state: array of { role, content }
  var messages = [];

  // DOM
  var chatMessages = document.getElementById("chat-messages");
  var chatInput = document.getElementById("chat-input");
  var sendBtn = document.getElementById("send-btn");
  var debugPanel = document.getElementById("debug-panel");
  var debugLog = document.getElementById("debug-log");
  var debugCopyBtn = document.getElementById("debug-copy-btn");

  // ---- Initial greeting ----

  (function showGreeting() {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-assistant greeting-bubble";

    var msg = document.createElement("div");
    msg.className = "bubble-text";
    msg.textContent =
      "Hey! I'm your PartsSource Repair Intelligence Agent — think of me as " +
      "the colleague who always has the service manual open.\n\n" +
      "Tell me what equipment you're working on — make, model, error codes, " +
      "symptoms, asset tag, anything you've got. I'll pull up the manual, " +
      "find the right part, and walk you through the repair.";
    bubble.appendChild(msg);

    chatMessages.appendChild(bubble);
  })();

  // ---- Event listeners ----

  sendBtn.addEventListener("click", handleSend);

  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  if (debugCopyBtn && debugLog) {
    debugCopyBtn.addEventListener("click", function () {
      if (!debugLog.textContent) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(debugLog.textContent)
          .catch(function () {
            console.warn("Failed to copy debug log to clipboard.");
          });
      }
    });
  }

  // Example chips
  document.querySelectorAll(".chat-examples .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      chatInput.value = chip.textContent;
      chatInput.focus();
      chatInput.dispatchEvent(new Event("input"));
    });
  });

  // ---- Main handler (streaming) ----

  function handleSend() {
    var text = chatInput.value.trim();
    if (!text) return;

    var userMsg = { role: "user", content: text };
    messages.push(userMsg);
    appendBubble("user", text);

    chatInput.value = "";
    chatInput.style.height = "auto";
    setLoading(true);

    // Create streaming progress bubble
    var streamBubble = document.createElement("div");
    streamBubble.className = "chat-bubble chat-bubble-assistant stream-bubble";
    chatMessages.appendChild(streamBubble);

    // Progress container (tools + text streaming)
    var progressEl = document.createElement("div");
    progressEl.className = "stream-progress";
    streamBubble.appendChild(progressEl);

    // Streaming text container
    var streamTextEl = document.createElement("div");
    streamTextEl.className = "stream-text";
    streamBubble.appendChild(streamTextEl);

    var payload = { messages: messages };
    var completedTools = [];
    var streamedText = "";

    fetch(STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            var parsed;
            try { parsed = JSON.parse(body); } catch (_) { parsed = { error: body }; }
            var msg = parsed.error || "Request failed with status " + res.status;
            if (parsed.detail) msg += "\n\nDetail: " + parsed.detail;
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

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function readChunk() {
          return reader.read().then(function (result) {
            if (result.done) return;

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line.startsWith("data: ")) continue;

              var jsonStr = line.substring(6);
              var event;
              try { event = JSON.parse(jsonStr); } catch (_) { continue; }

              if (event.type === "tool_done") {
                completedTools.push(event);
                renderToolProgress(progressEl, completedTools);
              } else if (event.type === "text_chunk") {
                streamedText += event.text;
                streamTextEl.textContent = streamedText;
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else if (event.type === "phase_structuring") {
                var phaseEl = document.createElement("div");
                phaseEl.className = "stream-phase-indicator";
                phaseEl.textContent = "Structuring response...";
                progressEl.appendChild(phaseEl);
              } else if (event.type === "complete") {
                // Remove streaming bubble, render full structured response
                streamBubble.remove();
                renderAssistantResponse(event.response);
              } else if (event.type === "error") {
                streamBubble.remove();
                appendBubble("error", event.message || "Something went wrong.");
              }
            }

            return readChunk();
          });
        }

        return readChunk();
      })
      .catch(function (err) {
        logClientError({
          source: "chat_stream",
          phase: "network_or_parse_error",
          errorMessage: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : undefined,
          lastUserMessage: text,
          timestamp: new Date().toISOString(),
        });
        streamBubble.remove();
        appendBubble("error", err.message || "Something went wrong. Please try again.");
      })
      .finally(function () {
        setLoading(false);
        chatInput.focus();
      });
  }

  // ---- Tool progress rendering ----

  function renderToolProgress(container, tools) {
    // Clear existing tool items (keep phase indicator if present)
    var phaseIndicator = container.querySelector(".stream-phase-indicator");
    container.innerHTML = "";

    var header = document.createElement("div");
    header.className = "stream-progress-header";
    header.textContent = "Researching...";
    container.appendChild(header);

    for (var i = 0; i < tools.length; i++) {
      var tool = tools[i];
      var el = document.createElement("div");
      el.className = "stream-tool-item";

      var icon = getToolIcon(tool.toolName);
      var label = getToolLabel(tool.toolName);

      el.innerHTML =
        '<span class="tool-icon">' + icon + '</span>' +
        '<span class="tool-label">' + escapeHtml(label) + '</span>' +
        '<span class="tool-result">' + tool.resultCount + ' result' + (tool.resultCount !== 1 ? 's' : '') + '</span>' +
        '<span class="tool-latency">' + tool.latencyMs + 'ms</span>';

      container.appendChild(el);
    }

    if (phaseIndicator) container.appendChild(phaseIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function getToolIcon(name) {
    var icons = {
      lookupAsset: "&#x1F3E5;",
      getRepairHistory: "&#x1F4CB;",
      listManualSections: "&#x1F4D6;",
      searchManual: "&#x1F50D;",
      getManualSection: "&#x1F4C4;",
      searchParts: "&#x1F527;",
      getSuppliers: "&#x1F4E6;",
      getRepairGuide: "&#x1F6E0;",
    };
    return icons[name] || "&#x2699;";
  }

  function getToolLabel(name) {
    var labels = {
      lookupAsset: "Looking up equipment asset",
      getRepairHistory: "Checking repair history",
      listManualSections: "Loading service manual",
      searchManual: "Searching manual sections",
      getManualSection: "Reading manual section",
      searchParts: "Searching parts catalog",
      getSuppliers: "Getting supplier data",
      getRepairGuide: "Loading repair guide",
    };
    return labels[name] || name;
  }

  // ---- Rendering ----

  function appendBubble(role, text) {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-" + role;

    var p = document.createElement("div");
    p.className = "bubble-text";
    p.textContent = text;
    bubble.appendChild(p);

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function renderAssistantResponse(data) {
    messages.push({ role: "assistant", content: data.message });

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-assistant";

    // Main message
    var msg = document.createElement("div");
    msg.className = "bubble-text";
    msg.textContent = data.message;
    bubble.appendChild(msg);

    // Equipment asset info
    if (data.equipmentAsset) {
      bubble.appendChild(renderAssetCard(data.equipmentAsset));
    }

    // Manual references
    if (data.manualReferences && data.manualReferences.length > 0) {
      var refsDiv = document.createElement("div");
      refsDiv.className = "manual-refs";

      var refsHeader = document.createElement("div");
      refsHeader.className = "refs-header";
      refsHeader.textContent = "Manual References";
      refsDiv.appendChild(refsHeader);

      data.manualReferences.forEach(function (ref) {
        var refEl = document.createElement("div");
        refEl.className = "manual-ref";

        var title = document.createElement("div");
        title.className = "ref-title";
        title.textContent = ref.sectionTitle;
        if (ref.pageHint) title.textContent += " (" + ref.pageHint + ")";
        refEl.appendChild(title);

        var quote = document.createElement("blockquote");
        quote.className = "ref-quote";
        quote.textContent = ref.quotedText;
        refEl.appendChild(quote);

        refsDiv.appendChild(refEl);
      });

      bubble.appendChild(refsDiv);
    }

    // Warnings
    if (data.warnings && data.warnings.length > 0) {
      data.warnings.forEach(function (w) {
        var warn = document.createElement("div");
        warn.className = "bubble-warning";
        warn.textContent = w;
        bubble.appendChild(warn);
      });
    }

    // Recommended part card
    if (data.recommendedPart) {
      bubble.appendChild(renderPartCard(data.recommendedPart, "Recommended Part"));
    }

    // Alternative parts
    if (data.alternativeParts && data.alternativeParts.length > 0) {
      var altsDiv = document.createElement("div");
      altsDiv.className = "alternatives-section";

      var altsHeader = document.createElement("div");
      altsHeader.className = "refs-header";
      altsHeader.textContent = "Alternatives";
      altsDiv.appendChild(altsHeader);

      data.alternativeParts.forEach(function (alt) {
        altsDiv.appendChild(renderAltPartCard(alt));
      });

      bubble.appendChild(altsDiv);
    }

    // Confidence badge
    if (data.confidence) {
      var conf = document.createElement("div");
      conf.className = "bubble-confidence";
      conf.innerHTML = 'Confidence: <span class="badge badge-confidence-' + escapeHtml(data.confidence) + '">' + escapeHtml(data.confidence) + '</span>';
      bubble.appendChild(conf);
    }

    // Agent trace
    if (data._metrics || data.reasoning) {
      var traceEl = renderAgentTrace(data);
      if (traceEl) {
        traceEl.open = true;
        bubble.appendChild(traceEl);
      }
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ---- Equipment asset card ----

  function renderAssetCard(asset) {
    var card = document.createElement("div");
    card.className = "bubble-asset-card";

    var now = new Date();
    var warrantyDate = new Date(asset.warrantyExpiry);
    var warrantyActive = warrantyDate > now;
    var warrantyClass = warrantyActive ? "warranty-active" : "warranty-expired";
    var warrantyText = warrantyActive ? "Under Warranty" : "Warranty Expired";

    card.innerHTML =
      '<div class="asset-card-header">' +
        '<span class="asset-card-title">Equipment Asset</span>' +
        '<span class="badge ' + warrantyClass + '">' + warrantyText + '</span>' +
      '</div>' +
      '<div class="asset-card-grid">' +
        '<div class="asset-field"><span class="asset-label">Asset Tag</span><span class="mono">' + escapeHtml(asset.assetTag) + '</span></div>' +
        '<div class="asset-field"><span class="asset-label">Department</span><span>' + escapeHtml(asset.department) + '</span></div>' +
        '<div class="asset-field"><span class="asset-label">Location</span><span>' + escapeHtml(asset.location) + '</span></div>' +
        '<div class="asset-field"><span class="asset-label">Hours</span><span class="mono">' + asset.hoursLogged.toLocaleString() + '</span></div>' +
        '<div class="asset-field"><span class="asset-label">Status</span><span class="badge badge-status-' + escapeHtml(asset.status) + '">' + escapeHtml(asset.status) + '</span></div>' +
        '<div class="asset-field"><span class="asset-label">Warranty</span><span>' + escapeHtml(asset.warrantyExpiry) + '</span></div>' +
      '</div>';

    return card;
  }

  // ---- Part cards ----

  function renderPartCard(part, label) {
    var card = document.createElement("div");
    card.className = "bubble-part-card";

    card.innerHTML =
      '<div class="part-card-title">' + escapeHtml(label) + '</div>' +
      '<div class="part-card-row"><span class="part-card-label">Name</span><span>' + escapeHtml(part.name) + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">P/N</span><span class="mono">' + escapeHtml(part.partNumber) + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">Avg Price</span><span>$' + (part.avgPrice || 0).toLocaleString() + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">Criticality</span><span class="badge badge-' + escapeHtml(part.criticality || 'standard') + '">' + escapeHtml(part.criticality || 'standard') + '</span></div>';

    return card;
  }

  function renderAltPartCard(alt) {
    var card = document.createElement("div");
    card.className = "bubble-alt-card";

    card.innerHTML =
      '<div class="alt-card-info">' +
        '<div class="alt-card-name">' + escapeHtml(alt.name) + '</div>' +
        '<div class="alt-card-pn mono">' + escapeHtml(alt.partNumber) + '</div>' +
        '<div class="alt-card-reason">' + escapeHtml(alt.reason) + '</div>' +
      '</div>';

    return card;
  }

  // ---- Agent trace ----

  function renderAgentTrace(data) {
    var metrics = data._metrics || {};
    var toolCalls = metrics.toolCalls || [];
    var html = '';

    if (data.reasoning) {
      html += '<div class="trace-reasoning-block">';
      html += '<div class="trace-tool-header">Agent Reasoning</div>';
      html += '<div class="trace-reasoning-text">' + escapeHtml(data.reasoning) + '</div>';
      html += '</div>';
    }

    if (toolCalls.length > 0) {
      var sequence = toolCalls.map(function (tc) { return tc.toolName; });
      html += '<div class="trace-sequence-bar">';
      html += '<span class="trace-seq-label">Tool chain:</span> ';
      html += sequence.map(function (name, i) {
        return '<span class="trace-seq-step">' + escapeHtml(name) + '</span>' +
          (i < sequence.length - 1 ? ' <span class="trace-seq-arrow">&rarr;</span> ' : '');
      }).join('');
      html += ' <span class="trace-latency">(' + (metrics.totalLatencyMs || 0) + 'ms total)</span>';
      html += '</div>';
    }

    toolCalls.forEach(function (tc, idx) {
      html += '<div class="trace-tool-block">';
      html += '<div class="trace-tool-header">' +
        '<span class="trace-tool-num">' + (idx + 1) + '</span> ' +
        escapeHtml(tc.toolName) +
        '<span class="trace-latency trace-header-latency">' + tc.latencyMs + 'ms</span>' +
        '</div>';

      if (tc.input && Object.keys(tc.input).length > 0) {
        html += '<div class="trace-log-line trace-input-line">';
        html += '<span class="trace-label">Input:</span> ';
        Object.keys(tc.input).forEach(function (key, ki) {
          if (ki > 0) html += ', ';
          html += '<span class="trace-filter-name">' + escapeHtml(key) + '</span>=';
          html += '<span class="trace-filter-val">' + escapeHtml(JSON.stringify(tc.input[key])) + '</span>';
        });
        html += '</div>';
      }

      if (tc.toolName === 'listManualSections') {
        html += tc.resultCount > 0
          ? '<div class="trace-log-line trace-success">Loaded manual: <strong>' + tc.resultCount + ' sections</strong></div>'
          : '<div class="trace-log-line trace-warn">No manual found</div>';
      }
      if (tc.toolName === 'searchManual' && tc.ragTrace) {
        var rag = tc.ragTrace;
        html += '<div class="trace-log-line"><span class="trace-label">Mode:</span> <strong>' + escapeHtml(rag.searchMode) + '</strong>' +
          (rag.searchMode === 'vector' ? ' (semantic RAG)' : ' (keyword fallback)') + '</div>';
        if (rag.searchMode === 'vector' && rag.topScores && rag.topScores.length > 0) {
          rag.topScores.forEach(function (s) {
            var passed = s.score >= rag.similarityThreshold;
            var cls = passed ? 'trace-score-pass' : 'trace-score-fail';
            html += '<div class="trace-log-line rag-score-line"><span class="' + cls + '">' + (passed ? '\u2713' : '\u2717') + ' ' + s.score.toFixed(4) + '</span> ' + escapeHtml(s.sectionTitle) + '</div>';
          });
        }
      }
      if (tc.toolName === 'searchParts' && tc.filterSteps && tc.filterSteps.length > 0) {
        tc.filterSteps.forEach(function (step) {
          html += '<div class="trace-log-line rag-score-line">' +
            '<span class="trace-filter-name">' + escapeHtml(step.filter) + '</span>=' +
            '<span class="trace-filter-val">' + escapeHtml(step.value) + '</span>' +
            ' &rarr; <span class="trace-narrowing">' + step.remaining + ' remaining</span></div>';
        });
      }
      if (tc.toolName === 'lookupAsset') {
        html += tc.resultCount > 0
          ? '<div class="trace-log-line trace-success">Asset found</div>'
          : '<div class="trace-log-line trace-warn">Asset not found</div>';
      }
      if (tc.toolName === 'getRepairHistory') {
        html += '<div class="trace-log-line">' + tc.resultCount + ' past work order' + (tc.resultCount !== 1 ? 's' : '') + '</div>';
      }
      html += '<div class="trace-log-line trace-result-line">&rarr; <strong>' + tc.resultCount + '</strong> result' + (tc.resultCount !== 1 ? 's' : '') + '</div>';
      html += '</div>';
    });

    if (metrics.totalToolCalls > 0) {
      html += '<div class="trace-summary">';
      html += '<span>' + metrics.totalToolCalls + ' tool call' + (metrics.totalToolCalls !== 1 ? 's' : '') + '</span>';
      if (metrics.totalLatencyMs) html += ' &middot; <span>' + metrics.totalLatencyMs + 'ms total</span>';
      if (metrics.avgToolLatencyMs) html += ' &middot; <span>' + metrics.avgToolLatencyMs + 'ms avg/tool</span>';
      if (data.confidence) html += ' &middot; <span>Confidence: ' + escapeHtml(data.confidence) + '</span>';
      html += '</div>';
    }

    if (!html) return null;

    var section = document.createElement("details");
    section.className = "trace-section chat-trace";
    var summary = document.createElement("summary");
    summary.innerHTML = 'Agent Trace <span class="trace-badge">' + toolCalls.length + " tool" + (toolCalls.length !== 1 ? "s" : "") + "</span>";
    section.appendChild(summary);
    var content = document.createElement("div");
    content.className = "trace-tool-logs";
    content.innerHTML = html;
    section.appendChild(content);
    return section;
  }

  // ---- Helpers ----

  function logClientError(info) {
    try { console.error("[chat-ui] Client error", info); } catch (_) {}
    if (!debugPanel || !debugLog) return;
    var text;
    try { text = JSON.stringify(info, null, 2); } catch (_) { text = String(info); }
    debugLog.textContent = text;
    debugPanel.classList.remove("hidden");
  }

  function setLoading(loading) {
    sendBtn.disabled = loading;
    chatInput.disabled = loading;
  }

  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
