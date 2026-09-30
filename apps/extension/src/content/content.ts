/**
 * DarkShield — Content Script
 *
 * Runs in the context of every webpage.
 * Responsibilities:
 *  1. Run Layer 2 (Analyzer) + Layer 3 (Detector) on page load
 *  2. Set up MutationObserver for dynamic DOM changes
 *  3. Track page state transitions (product → cart → checkout)
 *  4. Inject highlight overlay for findings
 *  5. Communicate findings to background service worker
 */

import { runFullDetection, PriceJourneyTracker, CartDiffTracker } from "../detector/detection-engine";
import { classifyDetectionResult } from "../classifier/classifier";
import { capturePageState, classifyPageState } from "../analyzer/page-analyzer";
import type { Finding, ScanResult } from "@darkshield/schemas";

// ─── State ────────────────────────────────────────────────────────────────────

const priceTracker = new PriceJourneyTracker();
const cartTracker = new CartDiffTracker();
let currentPageState = classifyPageState();
let scanTimeout: ReturnType<typeof setTimeout> | null = null;
let lastUrl = window.location.href;

// ─── Mutation Observer ────────────────────────────────────────────────────────

const observer = new MutationObserver((mutations) => {
  // Debounce: wait 800ms after last mutation before re-scanning
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    const newState = classifyPageState();
    const urlChanged = window.location.href !== lastUrl;

    if (urlChanged || newState !== currentPageState) {
      lastUrl = window.location.href;
      currentPageState = newState;
      runScan("navigation");
    } else {
      // Quick DOM-only rescan for dynamic content (popups, modals)
      const hasSignificantChange = mutations.some(m =>
        m.addedNodes.length > 0 &&
        Array.from(m.addedNodes).some(n =>
          n instanceof HTMLElement &&
          (n.tagName === "DIALOG" ||
            n.classList.contains("modal") ||
            n.classList.contains("popup") ||
            n.classList.contains("overlay"))
        )
      );
      if (hasSignificantChange) runScan("modal");
    }
  }, 800);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: false,
  attributes: false,
});

// ─── Main Scan Function ───────────────────────────────────────────────────────

async function runScan(trigger: string = "initial") {
  try {
    // Capture price snapshot for this state
    priceTracker.captureSnapshot();

    // Run detection
    const detection = runFullDetection(priceTracker, cartTracker);
    const classified = classifyDetectionResult(detection);

    const result: Partial<ScanResult> = {
      url: window.location.href,
      mode: "extension",
      status: "done",
      started_at: Date.now(),
      completed_at: Date.now(),
      findings: classified.findings,
      transparency_score: classified.transparency_score,
      findings_by_pattern: classified.findings_by_pattern,
      pages_analyzed: 1,
      interaction_states: priceTracker["snapshots"]?.length || 1,
    };

    // Highlight findings on page
    if (classified.findings.length > 0) {
      injectHighlights(classified.findings);
    }

    // Send to background worker
    chrome.runtime.sendMessage({
      type: "SCAN_RESULT",
      payload: result,
      trigger,
    });

    // Update badge
    const count = classified.findings.length;
    chrome.runtime.sendMessage({
      type: "UPDATE_BADGE",
      count,
      score: classified.transparency_score.total,
    });

  } catch (err) {
    console.error("[DarkShield] Scan error:", err);
  }
}

// ─── Highlight Overlay ────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  high: "rgba(239, 68, 68, 0.25)",    // red
  medium: "rgba(251, 191, 36, 0.25)", // amber
  low: "rgba(59, 130, 246, 0.25)",    // blue
};

const SEVERITY_BORDER: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#3b82f6",
};

let injectedHighlights: HTMLElement[] = [];

function injectHighlights(findings: Finding[]) {
  // Remove old highlights
  injectedHighlights.forEach(el => el.remove());
  injectedHighlights = [];

  for (const finding of findings) {
    if (!finding.dom_evidence) continue;

    for (const evidence of finding.dom_evidence) {
      const target = document.querySelector<HTMLElement>(evidence.selector);
      if (!target || !evidence.visible) continue;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const overlay = document.createElement("div");
      overlay.setAttribute("data-darkshield", "highlight");
      overlay.setAttribute("data-finding-id", finding.id);
      overlay.setAttribute("data-pattern", finding.pattern);

      Object.assign(overlay.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        backgroundColor: SEVERITY_COLORS[finding.severity],
        border: `2px solid ${SEVERITY_BORDER[finding.severity]}`,
        borderRadius: "4px",
        zIndex: "999998",
        pointerEvents: "none",
        boxSizing: "border-box",
        transition: "opacity 0.3s ease",
      });

      // Tooltip label
      const label = document.createElement("div");
      Object.assign(label.style, {
        position: "absolute",
        top: "-22px",
        left: "0",
        backgroundColor: SEVERITY_BORDER[finding.severity],
        color: "#fff",
        fontSize: "11px",
        fontWeight: "600",
        padding: "2px 6px",
        borderRadius: "3px",
        whiteSpace: "nowrap",
        fontFamily: "system-ui, -apple-system, sans-serif",
        letterSpacing: "0.3px",
      });
      label.textContent = `⚠ ${finding.title}`;
      overlay.appendChild(label);

      document.body.appendChild(overlay);
      injectedHighlights.push(overlay);
    }
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FORCE_SCAN") {
    runScan("popup_request");
    sendResponse({ status: "scanning" });
  }
  if (message.type === "CLEAR_HIGHLIGHTS") {
    injectedHighlights.forEach(el => el.remove());
    injectedHighlights = [];
    sendResponse({ status: "cleared" });
  }
  if (message.type === "GET_PAGE_STATE") {
    sendResponse({
      url: window.location.href,
      state: classifyPageState(),
      prices: priceTracker["snapshots"]?.length || 0,
    });
  }
  return true;
});

// ─── Initial Scan ─────────────────────────────────────────────────────────────

// Slight delay to allow dynamic content to settle
setTimeout(() => runScan("initial"), 1500);
