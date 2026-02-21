/**
 * PartsFinder — Repair Assistant chat UI.
 * Vanilla JS. Talks to POST /api/chat.
 */
(function () {
  "use strict";

  var API_URL = "/api/chat";

  // Conversation state: array of { role, content, imageBase64? }
  var messages = [];

  // DOM
  var chatMessages = document.getElementById("chat-messages");
  var chatInput = document.getElementById("chat-input");
  var sendBtn = document.getElementById("send-btn");
  var imageInput = document.getElementById("image-input");
  var imagePreview = document.getElementById("image-preview");
  var imagePreviewImg = document.getElementById("image-preview-img");
  var imageRemoveBtn = document.getElementById("image-remove-btn");

  // Pending image attachment (base64 string or null)
  var pendingImage = null;

  // ---- Initial greeting ----

  (function showGreeting() {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-assistant greeting-bubble";

    var msg = document.createElement("div");
    msg.className = "bubble-text";
    msg.textContent =
      "Hey! I'm your Repair Assistant — think of me as the colleague who " +
      "always has the service manual open.\n\n" +
      "What equipment are you working on? Give me the make and model, and " +
      "tell me what's going on — error codes, symptoms, anything you've noticed.";
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

  // Image attachment
  imageInput.addEventListener("change", function () {
    var file = this.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      // Extract base64 portion
      pendingImage = dataUrl.split(",")[1];
      imagePreviewImg.src = dataUrl;
      imagePreview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  imageRemoveBtn.addEventListener("click", function () {
    pendingImage = null;
    imageInput.value = "";
    imagePreview.classList.add("hidden");
  });

  // Example chips
  document.querySelectorAll(".chat-examples .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      chatInput.value = chip.textContent;
      chatInput.focus();
      chatInput.dispatchEvent(new Event("input"));
    });
  });

  // ---- Main handler ----

  function handleSend() {
    var text = chatInput.value.trim();
    if (!text && !pendingImage) return;
    if (!text) text = "(see attached photo)";

    // Build user message
    var userMsg = { role: "user", content: text };
    if (pendingImage) {
      userMsg.imageBase64 = pendingImage;
    }

    // Add to conversation
    messages.push(userMsg);

    // Render user bubble
    appendBubble("user", text, pendingImage ? imagePreviewImg.src : null);

    // Clear input
    chatInput.value = "";
    chatInput.style.height = "auto";
    pendingImage = null;
    imageInput.value = "";
    imagePreview.classList.add("hidden");

    // Show typing indicator
    var typingEl = appendTypingIndicator();

    // Disable input while waiting
    setLoading(true);

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.error || "Request failed with status " + res.status);
          });
        }
        return res.json();
      })
      .then(function (data) {
        typingEl.remove();
        renderAssistantResponse(data);
      })
      .catch(function (err) {
        typingEl.remove();
        appendBubble("error", err.message || "Something went wrong. Please try again.");
      })
      .finally(function () {
        setLoading(false);
        chatInput.focus();
      });
  }

  // ---- Rendering ----

  function appendBubble(role, text, imageSrc) {
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-" + role;

    if (imageSrc) {
      var img = document.createElement("img");
      img.src = imageSrc;
      img.className = "bubble-image";
      img.alt = "Attached photo";
      bubble.appendChild(img);
    }

    var p = document.createElement("div");
    p.className = "bubble-text";
    p.textContent = text;
    bubble.appendChild(p);

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function appendTypingIndicator() {
    var el = document.createElement("div");
    el.className = "chat-bubble chat-bubble-assistant typing-indicator";
    el.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return el;
  }

  function renderAssistantResponse(data) {
    // Add to conversation history (plain text for API)
    messages.push({ role: "assistant", content: data.message });

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-assistant";

    // Main message
    var msg = document.createElement("div");
    msg.className = "bubble-text";
    msg.textContent = data.message;
    bubble.appendChild(msg);

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
        if (ref.pageHint) {
          title.textContent += " (" + ref.pageHint + ")";
        }
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

    // Recommended part card with Buy button
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

    // Confidence badge (for diagnosis/guidance)
    if (data.confidence) {
      var conf = document.createElement("div");
      conf.className = "bubble-confidence";
      conf.innerHTML = 'Confidence: <span class="badge badge-confidence-' + escapeHtml(data.confidence) + '">' + escapeHtml(data.confidence) + '</span>';
      bubble.appendChild(conf);
    }

    // RAG trace (collapsible, inside bubble)
    if (data._metrics && data._metrics.toolCalls && data._metrics.toolCalls.length > 0) {
      var traceEl = renderRAGTrace(data._metrics.toolCalls);
      if (traceEl) {
        bubble.appendChild(traceEl);
      }
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderPartCard(part, label) {
    var card = document.createElement("div");
    card.className = "bubble-part-card";

    card.innerHTML =
      '<div class="part-card-title">' + escapeHtml(label) + '</div>' +
      '<div class="part-card-row"><span class="part-card-label">Name</span><span>' + escapeHtml(part.name) + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">P/N</span><span class="mono">' + escapeHtml(part.partNumber) + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">Price</span><span>$' + (part.avgPrice || 0).toLocaleString() + '</span></div>' +
      '<div class="part-card-row"><span class="part-card-label">Criticality</span><span class="badge badge-' + escapeHtml(part.criticality || 'standard') + '">' + escapeHtml(part.criticality || 'standard') + '</span></div>';

    var buyBtn = document.createElement("button");
    buyBtn.className = "buy-btn";
    buyBtn.type = "button";
    buyBtn.textContent = "Buy Part";
    buyBtn.addEventListener("click", function () {
      showBuyPlaceholder(part);
    });
    card.appendChild(buyBtn);

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

    var buyBtn = document.createElement("button");
    buyBtn.className = "buy-btn buy-btn-small";
    buyBtn.type = "button";
    buyBtn.textContent = "Buy";
    buyBtn.addEventListener("click", function () {
      showBuyPlaceholder(alt);
    });
    card.appendChild(buyBtn);

    return card;
  }

  function showBuyPlaceholder(part) {
    // Remove any existing toast
    var existing = document.querySelector('.buy-toast');
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.className = "buy-toast";
    toast.innerHTML =
      '<div class="buy-toast-inner">' +
        '<div class="buy-toast-title">To be continued...</div>' +
        '<div class="buy-toast-body">' +
          'You clicked buy on <strong>' + escapeHtml(part.partNumber || part.name) + '</strong>! ' +
          'This button will connect to Part Source\'s marketplace — ' +
          'think of it as Amazon for medical device parts. ' +
          'For now, just imagine a shopping cart filling up.' +
        '</div>' +
        '<button class="buy-toast-close" type="button">Got it</button>' +
      '</div>';

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function () {
      toast.classList.add("buy-toast-visible");
    });

    toast.querySelector(".buy-toast-close").addEventListener("click", function () {
      toast.classList.remove("buy-toast-visible");
      setTimeout(function () { toast.remove(); }, 300);
    });

    // Auto-dismiss after 8s
    setTimeout(function () {
      if (toast.parentNode) {
        toast.classList.remove("buy-toast-visible");
        setTimeout(function () { toast.remove(); }, 300);
      }
    }, 8000);
  }

  function renderRAGTrace(toolCalls) {
    var html = '';

    toolCalls.forEach(function (tc) {
      html += '<div class="trace-tool-block">';
      html += '<div class="trace-tool-header">' + escapeHtml(tc.toolName) + '</div>';

      // Query params
      if (tc.input && Object.keys(tc.input).length > 0) {
        var params = Object.keys(tc.input).map(function (key) {
          return escapeHtml(key) + '=' + escapeHtml(JSON.stringify(tc.input[key]));
        }).join(', ');
        html += '<div class="trace-log-line">' +
          '<span class="trace-prefix">[' + escapeHtml(tc.toolName) + ']</span> ' +
          'Query: {' + params + '}' +
          '</div>';
      }

      // RAG-specific trace
      if (tc.ragTrace) {
        var rag = tc.ragTrace;

        // Search mode
        html += '<div class="trace-log-line">' +
          '<span class="trace-prefix">[searchManual]</span> ' +
          'Mode: <strong>' + escapeHtml(rag.searchMode) + '</strong>' +
          (rag.searchMode === 'vector' ? ' (semantic RAG)' : ' (keyword fallback)') +
          '</div>';

        if (rag.searchMode === 'vector') {
          // Embeddings loaded
          html += '<div class="trace-log-line">' +
            '<span class="trace-prefix">[searchManual]</span> ' +
            'Loaded <strong>' + rag.embeddingsLoaded + '</strong> section embeddings' +
            '</div>';

          // Filter narrowing
          if (rag.candidatesAfterFilter < rag.embeddingsLoaded) {
            html += '<div class="trace-log-line trace-filter-line">' +
              '<span class="trace-prefix">[searchManual]</span> ' +
              'After metadata filter: ' +
              '<span class="trace-narrowing">' + rag.embeddingsLoaded + ' &rarr; ' + rag.candidatesAfterFilter + ' candidates</span>' +
              '</div>';
          }

          // Query text
          html += '<div class="trace-log-line">' +
            '<span class="trace-prefix">[searchManual]</span> ' +
            'Embedded query: <span class="trace-filter-val">&quot;' + escapeHtml(rag.queryText) + '&quot;</span>' +
            '</div>';

          // Cosine similarity scores
          if (rag.topScores && rag.topScores.length > 0) {
            html += '<div class="trace-log-line">' +
              '<span class="trace-prefix">[searchManual]</span> ' +
              'Cosine similarity scores:' +
              '</div>';

            rag.topScores.forEach(function (s, idx) {
              var passed = s.score >= rag.similarityThreshold;
              var icon = passed ? '\u2713' : '\u2717';
              var color = passed ? '#059669' : '#9ca3af';
              html += '<div class="trace-log-line rag-score-line">' +
                '<span style="color:' + color + '">' + icon + '</span> ' +
                '#' + (idx + 1) + ' ' +
                '<span class="' + (passed ? 'trace-narrowing' : 'trace-latency') + '">' +
                s.score.toFixed(4) + '</span> &rarr; ' +
                escapeHtml(s.sectionTitle) +
                '</div>';
            });

            // Threshold summary
            html += '<div class="trace-log-line trace-filter-line">' +
              '<span class="trace-prefix">[searchManual]</span> ' +
              'Threshold: <span class="trace-filter-val">' + rag.similarityThreshold + '</span> &rarr; ' +
              '<strong>' + rag.resultsAboveThreshold + '</strong> of ' + rag.topScores.length + ' passed' +
              '</div>';
          }
        } else {
          // Keyword fallback reason
          var reason = rag.embeddingsLoaded === 0
            ? 'No embeddings in Firestore'
            : 'No keyword provided for semantic search';
          html += '<div class="trace-log-line">' +
            '<span class="trace-prefix">[searchManual]</span> ' +
            'Reason: ' + reason +
            '</div>';
        }
      }

      // Result + latency
      html += '<div class="trace-log-line trace-result-line">' +
        '<span class="trace-prefix">[' + escapeHtml(tc.toolName) + ']</span> ' +
        'Returned <strong>' + tc.resultCount + '</strong> results ' +
        '<span class="trace-latency">(' + tc.latencyMs + 'ms)</span>' +
        '</div>';

      html += '</div>'; // .trace-tool-block
    });

    if (!html) return null;

    var section = document.createElement('details');
    section.className = 'trace-section chat-trace';

    var summary = document.createElement('summary');
    summary.textContent = 'Agent Reasoning Trace';
    section.appendChild(summary);

    var content = document.createElement('div');
    content.className = 'trace-tool-logs';
    content.innerHTML = html;
    section.appendChild(content);

    return section;
  }

  // ---- Helpers ----

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
