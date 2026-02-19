/**
 * PartsFinder Agent — Frontend application logic.
 * Vanilla JS, no build tools.
 */

(function () {
  "use strict";

  // DOM elements
  var textarea = document.getElementById("description");
  var btn = document.getElementById("diagnose-btn");
  var errorSection = document.getElementById("error-section");
  var errorMessage = document.getElementById("error-message");
  var resultsSection = document.getElementById("results-section");
  var confidenceBadge = document.getElementById("confidence-badge");
  var diagnosisText = document.getElementById("diagnosis-text");
  var recommendedPartCard = document.getElementById("recommended-part-card");
  var noPartCard = document.getElementById("no-part-card");
  var partName = document.getElementById("part-name");
  var partNumber = document.getElementById("part-number");
  var partDescription = document.getElementById("part-description");
  var partPrice = document.getElementById("part-price");
  var partCriticality = document.getElementById("part-criticality");
  var supplierSection = document.getElementById("supplier-section");
  var supplierTbody = document.getElementById("supplier-tbody");
  var alternativesSection = document.getElementById("alternatives-section");
  var alternativesList = document.getElementById("alternatives-list");
  var warningsSection = document.getElementById("warnings-section");
  var warningsList = document.getElementById("warnings-list");
  var reasoningTrace = document.getElementById("reasoning-trace");
  var metricsSection = document.getElementById("metrics-section");
  var metricsContent = document.getElementById("metrics-content");

  // API endpoint — when served via Firebase Hosting rewrites, this maps to the Cloud Function
  var API_URL = "/api/diagnose";

  // ---- Event listeners ----

  btn.addEventListener("click", handleDiagnose);

  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleDiagnose();
    }
  });

  // Example chips populate the textarea (do NOT auto-submit)
  var chips = document.querySelectorAll(".chip");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      textarea.value = chip.textContent;
      textarea.focus();
    });
  });

  // ---- Main handler ----

  function handleDiagnose() {
    var description = textarea.value.trim();
    if (!description) {
      showError("Please enter a description of the equipment problem.");
      return;
    }

    hideError();
    hideResults();
    setLoading(true);

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description }),
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
        renderResults(data);
      })
      .catch(function (err) {
        showError(err.message || "An unexpected error occurred. Please try again.");
      })
      .finally(function () {
        setLoading(false);
      });
  }

  // ---- Rendering ----

  function renderResults(data) {
    // Diagnosis + confidence
    diagnosisText.textContent = data.diagnosis || "No diagnosis available.";
    confidenceBadge.textContent = data.confidence || "unknown";
    confidenceBadge.className = "badge badge-confidence-" + (data.confidence || "low");

    // Recommended part
    if (data.recommendedPart) {
      recommendedPartCard.classList.remove("hidden");
      noPartCard.classList.add("hidden");

      partName.textContent = data.recommendedPart.name;
      partNumber.textContent = data.recommendedPart.partNumber;
      partDescription.textContent = data.recommendedPart.description;
      partPrice.textContent = formatPrice(data.recommendedPart.avgPrice);

      var crit = (data.recommendedPart.criticality || "low").toLowerCase();
      partCriticality.textContent = crit;
      partCriticality.className = "badge badge-" + crit;
    } else {
      recommendedPartCard.classList.add("hidden");
      noPartCard.classList.remove("hidden");
    }

    // Supplier ranking
    if (data.supplierRanking && data.supplierRanking.length > 0) {
      supplierSection.classList.remove("hidden");
      supplierTbody.innerHTML = "";
      data.supplierRanking.forEach(function (s, idx) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + (idx + 1) + "</td>" +
          "<td>" + escapeHtml(s.supplierName) + "</td>" +
          "<td>" + s.qualityScore + "</td>" +
          "<td>" + s.deliveryDays + "</td>" +
          "<td>" + escapeHtml(s.reasoning) + "</td>";
        supplierTbody.appendChild(tr);
      });
    } else {
      supplierSection.classList.add("hidden");
    }

    // Alternative parts
    if (data.alternativeParts && data.alternativeParts.length > 0) {
      alternativesSection.classList.remove("hidden");
      alternativesList.innerHTML = "";
      data.alternativeParts.forEach(function (alt) {
        var li = document.createElement("li");
        li.innerHTML =
          '<span class="alt-name">' + escapeHtml(alt.name) + "</span> " +
          '<span class="alt-pn">(' + escapeHtml(alt.partNumber) + ")</span><br>" +
          '<span class="alt-reason">' + escapeHtml(alt.reason) + "</span>";
        alternativesList.appendChild(li);
      });
    } else {
      alternativesSection.classList.add("hidden");
    }

    // Warnings
    if (data.warnings && data.warnings.length > 0) {
      warningsSection.classList.remove("hidden");
      warningsList.innerHTML = "";
      data.warnings.forEach(function (w) {
        var div = document.createElement("div");
        div.className = "warning-box";
        div.textContent = w;
        warningsList.appendChild(div);
      });
    } else {
      warningsSection.classList.add("hidden");
    }

    // Performance metrics
    if (data._metrics) {
      metricsSection.classList.remove("hidden");
      renderMetrics(data._metrics);
    } else {
      metricsSection.classList.add("hidden");
    }

    // Reasoning trace
    reasoningTrace.textContent = data.reasoning || "No reasoning trace available.";

    resultsSection.classList.remove("hidden");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Metrics rendering ----

  function renderMetrics(m) {
    var html =
      '<div class="metric-card">' +
        '<span class="metric-value">' + (m.totalLatencyMs / 1000).toFixed(1) + 's</span>' +
        '<span class="metric-label">Total Latency</span>' +
      '</div>' +
      '<div class="metric-card">' +
        '<span class="metric-value">' + m.totalToolCalls + '</span>' +
        '<span class="metric-label">Tool Calls</span>' +
      '</div>' +
      '<div class="metric-card">' +
        '<span class="metric-value">' + (m.avgToolLatencyMs) + 'ms</span>' +
        '<span class="metric-label">Avg Tool Latency</span>' +
      '</div>' +
      '<div class="metric-card">' +
        '<span class="metric-value">' + (m.partFound ? "Yes" : "No") + '</span>' +
        '<span class="metric-label">Part Found</span>' +
      '</div>';

    // Tool call timeline with search params and filter trace
    if (m.toolCalls && m.toolCalls.length > 0) {
      html += '<div class="metric-timeline">';
      html += '<span class="metric-label">Tool Call Sequence:</span>';
      html += '<div class="timeline-items">';
      m.toolCalls.forEach(function (tc, idx) {
        html +=
          '<div class="timeline-item">' +
            '<span class="timeline-step">' + (idx + 1) + '</span>' +
            '<span class="timeline-name">' + escapeHtml(tc.toolName) + '</span>' +
            '<span class="timeline-detail">' + tc.resultCount + ' results, ' + tc.latencyMs + 'ms</span>';

        // Show search params sent by the LLM
        if (tc.input && Object.keys(tc.input).length > 0) {
          html += '<div class="timeline-params">';
          Object.keys(tc.input).forEach(function (key) {
            html += '<span class="param-chip">' + escapeHtml(key) + ': ' + escapeHtml(String(tc.input[key])) + '</span>';
          });
          html += '</div>';
        }

        // Show per-filter narrowing trace
        if (tc.filterSteps && tc.filterSteps.length > 0) {
          html += '<div class="timeline-filters">';
          var totalDocs = 28; // starting pool
          tc.filterSteps.forEach(function (step) {
            var before = totalDocs;
            html +=
              '<span class="filter-step">' +
                escapeHtml(step.filter) + '="' + escapeHtml(step.value) + '"' +
                ' <span class="filter-count">' + before + ' &rarr; ' + step.remaining + '</span>' +
              '</span>';
            totalDocs = step.remaining;
          });
          html += '</div>';
        }

        html += '</div>';
      });
      html += '</div></div>';
    }

    metricsContent.innerHTML = html;
  }

  // ---- Helpers ----

  function setLoading(loading) {
    btn.disabled = loading;
    btn.textContent = loading ? "Diagnosing..." : "Diagnose";
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorSection.classList.remove("hidden");
  }

  function hideError() {
    errorSection.classList.add("hidden");
  }

  function hideResults() {
    resultsSection.classList.add("hidden");
  }

  function formatPrice(cents) {
    if (typeof cents !== "number") return "N/A";
    return "$" + cents.toLocaleString("en-US", { minimumFractionDigits: 0 });
  }

  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
