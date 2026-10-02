/**
 * DarkShield — Content Script (Live Webpage Inspector)
 *
 * Runs inside the context of user-visited webpages.
 * Responsibilities:
 *  1. Performs Level 1 Fast Local Analysis of DOM, text, CTAs, and prices
 *  2. Sends sanitized signals to background service worker for Level 2 analysis
 *  3. Injects non-destructive highlight overlays with interactive DarkShield tooltips
 *  4. Debounced MutationObserver for dynamic modals, popups, and price changes
 *  5. Strict Privacy: never captures passwords, credit card inputs, or keystrokes
 */

import {
  PriceJourneyTracker,
  runLocalFastCheck,
} from "../detector/detection-engine";
import {
  classifyPartialFinding,
  computeCalibratedRiskAssessment,
  computeTransparencyScore,
} from "../classifier/classifier";
import {
  classifyPageState,
  getSanitizedVisibleText,
  getSanitizedDOMSnippet,
} from "../analyzer/page-analyzer";
import type { Finding, ExtensionScanResult } from "@darkshield/schemas";

// ─── Local State ──────────────────────────────────────────────────────────────

const priceTracker = new PriceJourneyTracker();
let scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeHighlightElements: HTMLElement[] = [];
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Level 1 Local Inspection ─────────────────────────────────────────────────

function runPageInspection(reason: string = "initial") {
  try {
    // Capture price point for this state
    priceTracker.captureSnapshot();

    // 1. Run Level 1 Local Fast Analysis
    const localCheck = runLocalFastCheck(priceTracker);

    const findings: Finding[] = localCheck.findings.map(classifyPartialFinding);
    const riskAssessment = computeCalibratedRiskAssessment(findings);
    const transparencyScore = computeTransparencyScore(findings);

    const findings_by_pattern: Record<string, number> = {};
    for (const f of findings) {
      findings_by_pattern[f.pattern] = (findings_by_pattern[f.pattern] || 0) + 1;
    }

    const localResult: ExtensionScanResult = {
      scan_id: `loc-${Date.now().toString(36)}`,
      url: window.location.href,
      status: "done",
      findings,
      risk_assessment: riskAssessment,
      transparency_score: transparencyScore,
      scan_coverage: {
        stages_scanned: [classifyPageState()],
        checkout_reached: classifyPageState() === "checkout",
        coverage_score: 50,
        items: [],
      },
      findings_by_pattern,
      target_metadata: {
        title: document.title || "Target Site",
        final_url: window.location.href,
      },
      started_at: Date.now() / 1000,
      completed_at: Date.now() / 1000,
    };

    // 2. Transmit structured, sanitized payload to background worker
    chrome.runtime.sendMessage({
      type: "LEVEL_1_PAGE_SIGNALS",
      payload: {
        url: window.location.href,
        title: document.title || "Target Site",
        dom: getSanitizedDOMSnippet(),
        visible_text: getSanitizedVisibleText(),
        page_state: classifyPageState(),
        localResult,
        hasSuspiciousSignals: localCheck.hasSuspiciousSignals,
        reason,
      },
    });
  } catch (err) {
    // Content script inspection safety boundary
  }
}

// ─── In-Page Highlight Overlay & Floating Tooltip ─────────────────────────────

function clearHighlights() {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
  activeHighlightElements.forEach(el => el.remove());
  activeHighlightElements = [];
}

function highlightFindingElement(finding: Finding) {
  clearHighlights();

  // 1. Locate DOM element
  let targetElement: HTMLElement | null = null;

  if (finding.dom_evidence && finding.dom_evidence.length > 0) {
    for (const ev of finding.dom_evidence) {
      if (ev.selector) {
        try {
          const el = document.querySelector<HTMLElement>(ev.selector);
          if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
            targetElement = el;
            break;
          }
        } catch {
          // invalid selector syntax fallback
        }
      }
    }
  }

  // Fallback: search for snippet text
  if (!targetElement && finding.text_snippets && finding.text_snippets.length > 0) {
    const rawSnippet = finding.text_snippets[0].replace(/^(Timer|Scarcity|Deadline|Social proof|Pre-selected|Decline text|Wording|Terms|Primary):\s*"?/i, "").replace(/"$/, "").trim();
    if (rawSnippet.length >= 4) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.includes(rawSnippet)) {
          if (node.parentElement && node.parentElement.offsetWidth > 0) {
            targetElement = node.parentElement;
            break;
          }
        }
      }
    }
  }

  if (!targetElement) return;

  // 2. Scroll into view smoothly
  targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

  // 3. Create Highlight Box
  const rect = targetElement.getBoundingClientRect();
  const highlightBox = document.createElement("div");
  highlightBox.className = `darkshield-highlight-box severity-${finding.severity || "high"}`;

  Object.assign(highlightBox.style, {
    position: "absolute",
    left: `${rect.left + window.scrollX - 4}px`,
    top: `${rect.top + window.scrollY - 4}px`,
    width: `${rect.width + 8}px`,
    height: `${rect.height + 8}px`,
    zIndex: "2147483640",
  });

  // 4. Create Floating Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "darkshield-tooltip-container";

  // Calculate tooltip placement (above or below)
  const placeAbove = rect.top > 220;
  const tooltipTop = placeAbove
    ? rect.top + window.scrollY - 180
    : rect.bottom + window.scrollY + 10;
  const tooltipLeft = Math.max(10, Math.min(window.innerWidth - 350, rect.left + window.scrollX));

  Object.assign(tooltip.style, {
    position: "absolute",
    left: `${tooltipLeft}px`,
    top: `${tooltipTop}px`,
  });

  const confPercent = Math.round((finding.confidence || 0.85) * 100);
  const snippetText = finding.text_snippets?.[0] || finding.title;

  tooltip.innerHTML = `
    <div class="darkshield-tooltip-header">
      <span class="darkshield-tooltip-badge">🛡️ DarkShield Evidence</span>
      <button class="darkshield-tooltip-close" title="Dismiss highlight">✕</button>
    </div>
    <div class="darkshield-tooltip-title">${escapeHTML(finding.title)}</div>
    <div class="darkshield-tooltip-confidence">
      ${confPercent}% Confidence · ${finding.confidence_tier || 'HIGH'} Tier · ${escapeHTML(finding.ccpa_regulation || 'CCPA 2023')}
    </div>
    <div class="darkshield-tooltip-evidence">"${escapeHTML(snippetText)}"</div>
    <div class="darkshield-tooltip-explanation">${escapeHTML(finding.explanation)}</div>
    <button class="darkshield-tooltip-dismiss-btn">Dismiss Highlight</button>
  `;

  // Attach event listeners
  const closeBtn = tooltip.querySelector(".darkshield-tooltip-close");
  const dismissBtn = tooltip.querySelector(".darkshield-tooltip-dismiss-btn");

  closeBtn?.addEventListener("click", clearHighlights);
  dismissBtn?.addEventListener("click", clearHighlights);

  document.body.appendChild(highlightBox);
  document.body.appendChild(tooltip);

  activeHighlightElements.push(highlightBox, tooltip);

  // Auto-dismiss after 15 seconds
  autoDismissTimer = setTimeout(() => {
    clearHighlights();
  }, 15000);
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Dynamic DOM Observer (Debounced) ─────────────────────────────────────────

const observer = new MutationObserver((mutations) => {
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);

  scanDebounceTimer = setTimeout(() => {
    // Check if added nodes contain modals, popups, or pricing components
    const hasMeaningfulAddition = mutations.some(m =>
      Array.from(m.addedNodes).some(node => {
        if (!(node instanceof HTMLElement)) return false;
        const tag = node.tagName.toLowerCase();
        const classes = (node.className && typeof node.className === "string" ? node.className : "").toLowerCase();
        return (
          tag === "dialog" ||
          classes.includes("modal") ||
          classes.includes("popup") ||
          classes.includes("drawer") ||
          classes.includes("cart") ||
          classes.includes("price") ||
          classes.includes("checkout")
        );
      })
    );

    if (hasMeaningfulAddition) {
      runPageInspection("dynamic_content_mutation");
    }
  }, 750);
});

// ─── Chrome Message Listener ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRIGGER_CONTENT_SCAN") {
    runPageInspection("manual_trigger");
    sendResponse({ status: "scanning" });
    return true;
  }

  if (message.type === "INJECT_ELEMENT_HIGHLIGHT") {
    if (message.finding) {
      highlightFindingElement(message.finding);
    }
    sendResponse({ status: "highlighted" });
    return true;
  }

  if (message.type === "CLEAR_ALL_HIGHLIGHTS") {
    clearHighlights();
    sendResponse({ status: "cleared" });
    return true;
  }

  return true;
});

// ─── Initialize ───────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => runPageInspection("initial_dom_ready"), 800);
  });
} else {
  setTimeout(() => runPageInspection("initial_idle"), 800);
}

// Start observing mutations once body is present
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });
}
