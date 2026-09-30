/**
 * DarkShield — Background Service Worker (MV3)
 *
 * Responsibilities:
 *  - Store scan results per tab
 *  - Update extension badge
 *  - Handle popup ↔ content script messaging relay
 *  - Coordinate with backend API when LLM explanation is requested
 */

import type { ScanResult } from "@darkshield/schemas";

// ─── Per-tab state ────────────────────────────────────────────────────────────

interface TabState {
  scanResult?: Partial<ScanResult>;
  lastScanAt?: number;
  badgeCount: number;
  score: number;
}

const tabStates = new Map<number, TabState>();

function getTabState(tabId: number): TabState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, { badgeCount: 0, score: 100 });
  }
  return tabStates.get(tabId)!;
}

// ─── Badge Updates ────────────────────────────────────────────────────────────

function updateBadge(tabId: number, count: number, score: number) {
  const state = getTabState(tabId);
  state.badgeCount = count;
  state.score = score;

  if (count === 0) {
    chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  chrome.action.setBadgeText({ text: String(count), tabId });

  // Color based on transparency score
  let color = "#22c55e"; // green
  if (score < 70) color = "#f59e0b"; // amber
  if (score < 40) color = "#ef4444"; // red

  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === "SCAN_RESULT" && tabId) {
    const state = getTabState(tabId);
    state.scanResult = message.payload;
    state.lastScanAt = Date.now();
    sendResponse({ status: "stored" });
  }

  if (message.type === "UPDATE_BADGE" && tabId) {
    updateBadge(tabId, message.count, message.score);
    sendResponse({ status: "updated" });
  }

  if (message.type === "GET_SCAN_RESULT") {
    // Popup is requesting the latest scan result for the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (!activeTabId) {
        sendResponse({ error: "No active tab" });
        return;
      }
      const state = getTabState(activeTabId);
      sendResponse({ scanResult: state.scanResult, tabId: activeTabId });
    });
    return true; // async
  }

  if (message.type === "REQUEST_SCAN") {
    // Popup requested a fresh scan
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (!activeTabId) {
        sendResponse({ error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(activeTabId, { type: "FORCE_SCAN" }, (response) => {
        sendResponse(response || { status: "sent" });
      });
    });
    return true; // async
  }

  return true;
});

// ─── Tab Cleanup ──────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    // Clear badge on navigation
    const state = getTabState(tabId);
    state.scanResult = undefined;
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
