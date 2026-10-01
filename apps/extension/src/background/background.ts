/**
 * DarkShield — Manifest V3 Background Service Worker
 *
 * Responsibilities:
 *  - Manages per-tab audit state & result caches
 *  - Orchestrates Level 2 Backend Analysis (FastAPI: /api/extension/analyze)
 *  - Handles graceful local fallbacks when backend is offline
 *  - Updates browser action badges
 *  - Dispatches extension-to-website audit workflows
 */

import type {
  ExtensionScanResult,
  Finding,
  AnalyzeRequest,
} from "@darkshield/schemas";

const BACKEND_URL = "http://localhost:8000";
const WEB_APP_URL = "http://localhost:3000";

interface TabAuditState {
  tabId: number;
  url: string;
  status: "idle" | "analyzing" | "done" | "error" | "restricted";
  backendOnline: boolean;
  result?: ExtensionScanResult;
  lastScanAt?: number;
  error?: string;
  progressStep?: string;
}

const tabStates = new Map<number, TabAuditState>();

function getOrCreateTabState(tabId: number, url: string = ""): TabAuditState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, {
      tabId,
      url,
      status: "idle",
      backendOnline: true,
    });
  }
  const state = tabStates.get(tabId)!;
  if (url && state.url !== url) {
    state.url = url;
  }
  return state;
}

// ─── Badge Updater ────────────────────────────────────────────────────────────

function updateActionBadge(tabId: number, count: number, riskLevel: string = "LOW") {
  if (count === 0) {
    chrome.action.setBadgeText({ text: "✓", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId }); // emerald green
    return;
  }

  chrome.action.setBadgeText({ text: String(count), tabId });
  let color = "#3b82f6"; // blue
  if (riskLevel === "MODERATE" || riskLevel === "ELEVATED") color = "#f59e0b"; // amber
  if (riskLevel === "HIGH" || riskLevel === "VERY HIGH") color = "#ef4444"; // red

  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// ─── Level 2: Backend Escalation ──────────────────────────────────────────────

async function escalateToBackend(requestData: AnalyzeRequest): Promise<ExtensionScanResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${BACKEND_URL}/api/extension/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data: ExtensionScanResult = await response.json();
      return data;
    }
  } catch (err) {
    // Backend unreachable or timeout
  }
  return null;
}

// ─── Tab Message Router ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;

  // 1. Content Script reports Level 1 Local Analysis + page data
  if (message.type === "LEVEL_1_PAGE_SIGNALS" && senderTabId) {
    handlePageSignalReport(senderTabId, message.payload);
    sendResponse({ status: "acknowledged" });
    return true;
  }

  // 2. Popup queries current tab status
  if (message.type === "GET_POPUP_STATE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        sendResponse({ status: "restricted", error: "No active browser tab found." });
        return;
      }

      const activeUrl = activeTab.url || "";
      if (
        !activeUrl ||
        activeUrl.startsWith("chrome://") ||
        activeUrl.startsWith("edge://") ||
        activeUrl.startsWith("chrome-extension://") ||
        activeUrl.startsWith("about:")
      ) {
        sendResponse({
          status: "restricted",
          url: activeUrl,
          error: "Internal browser pages cannot be inspected.",
        });
        return;
      }

      const state = getOrCreateTabState(activeTab.id, activeUrl);

      // If never scanned or idle, trigger immediate scan
      if (state.status === "idle") {
        state.status = "analyzing";
        state.progressStep = "Inspecting page structure...";
        chrome.tabs.sendMessage(activeTab.id, { type: "TRIGGER_CONTENT_SCAN" }, () => {});
      }

      sendResponse({
        status: state.status,
        url: activeUrl,
        result: state.result,
        backendOnline: state.backendOnline,
        progressStep: state.progressStep || "Analyzing page...",
        error: state.error,
      });
    });
    return true; // async
  }

  // 3. Popup requests force rescan
  if (message.type === "FORCE_RESCAN") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        const state = getOrCreateTabState(activeTab.id, activeTab.url || "");
        state.status = "analyzing";
        state.progressStep = "Re-evaluating page structure & components...";
        chrome.tabs.sendMessage(activeTab.id, { type: "TRIGGER_CONTENT_SCAN", force: true });
        sendResponse({ status: "rescan_initiated" });
      }
    });
    return true;
  }

  // 4. Relay Highlight command from popup to active tab content script
  if (message.type === "HIGHLIGHT_ELEMENT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: "INJECT_ELEMENT_HIGHLIGHT",
          finding: message.finding,
        });
        sendResponse({ status: "highlight_dispatched" });
      }
    });
    return true;
  }

  // 5. Run Full DarkShield Audit on Web Platform
  if (message.type === "RUN_FULL_AUDIT") {
    const targetUrl = message.url;
    if (targetUrl) {
      const auditUrl = `${WEB_APP_URL}/?url=${encodeURIComponent(targetUrl)}&auto=true`;
      chrome.tabs.create({ url: auditUrl });
      sendResponse({ status: "audit_opened", auditUrl });
    }
    return true;
  }

  // 6. View Existing Report on Web Platform
  if (message.type === "OPEN_FULL_REPORT") {
    const scanId = message.scanId;
    const targetUrl = message.url;
    if (scanId) {
      const reportUrl = `${WEB_APP_URL}/scan/${scanId}`;
      chrome.tabs.create({ url: reportUrl });
      sendResponse({ status: "report_opened", reportUrl });
    } else if (targetUrl) {
      const reportUrl = `${WEB_APP_URL}/?url=${encodeURIComponent(targetUrl)}&auto=true`;
      chrome.tabs.create({ url: reportUrl });
      sendResponse({ status: "report_opened", reportUrl });
    }
    return true;
  }

  return true;
});

// ─── Handle Signals & Run Level 2 Backend Pipeline ────────────────────────────

async function handlePageSignalReport(
  tabId: number,
  payload: {
    url: string;
    title: string;
    dom: string;
    visible_text: string;
    page_state: string;
    localResult: ExtensionScanResult;
    hasSuspiciousSignals: boolean;
  }
) {
  const state = getOrCreateTabState(tabId, payload.url);
  state.status = "analyzing";
  state.progressStep = "Inspecting page structure...";

  // Check if we should escalate to backend
  if (payload.hasSuspiciousSignals) {
    state.progressStep = "Evaluating with DarkShield backend engine...";

    const backendResult = await escalateToBackend({
      url: payload.url,
      dom: payload.dom,
      visible_text: payload.visible_text,
      page_state: payload.page_state as any,
      title: payload.title,
    });

    if (backendResult) {
      state.backendOnline = true;
      state.result = backendResult;
      state.status = "done";
      state.lastScanAt = Date.now();
      updateActionBadge(tabId, backendResult.findings.length, backendResult.risk_assessment.risk_level);
      return;
    } else {
      // Backend offline: use local fallback
      state.backendOnline = false;
    }
  }

  // Fallback / Level 1 result
  state.result = payload.localResult;
  state.status = "done";
  state.lastScanAt = Date.now();
  updateActionBadge(
    tabId,
    payload.localResult.findings.length,
    payload.localResult.risk_assessment.risk_level
  );
}

// ─── Tab Event Listeners ──────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    const state = getOrCreateTabState(tabId, tab.url);
    state.status = "idle";
    state.result = undefined;
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});
