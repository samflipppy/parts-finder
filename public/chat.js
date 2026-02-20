/**
 * PartsFinder — Diagnostic Partner chat UI.
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

    // If this was a diagnosis with a recommended part, show a compact card
    if (data.recommendedPart) {
      var partCard = document.createElement("div");
      partCard.className = "bubble-part-card";
      partCard.innerHTML =
        '<div class="part-card-title">Recommended Part</div>' +
        '<div class="part-card-row"><span class="part-card-label">Name</span><span>' + escapeHtml(data.recommendedPart.name) + '</span></div>' +
        '<div class="part-card-row"><span class="part-card-label">P/N</span><span class="mono">' + escapeHtml(data.recommendedPart.partNumber) + '</span></div>' +
        '<div class="part-card-row"><span class="part-card-label">Price</span><span>$' + data.recommendedPart.avgPrice.toLocaleString() + '</span></div>' +
        '<div class="part-card-row"><span class="part-card-label">Criticality</span><span class="badge badge-' + escapeHtml(data.recommendedPart.criticality) + '">' + escapeHtml(data.recommendedPart.criticality) + '</span></div>';
      bubble.appendChild(partCard);
    }

    // Confidence badge (for diagnosis/guidance)
    if (data.confidence) {
      var conf = document.createElement("div");
      conf.className = "bubble-confidence";
      conf.innerHTML = 'Confidence: <span class="badge badge-confidence-' + escapeHtml(data.confidence) + '">' + escapeHtml(data.confidence) + '</span>';
      bubble.appendChild(conf);
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
