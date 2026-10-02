import React, { useEffect, useState, useCallback } from "react";
import type {
  Finding,
  ExtensionScanResult,
  CCPAPattern,
} from "@darkshield/schemas";

// ─── Pattern Configuration & Icons ────────────────────────────────────────────

const PATTERN_CONFIG: Record<
  string,
  { icon: string; color: string; shortName: string }
> = {
  FALSE_URGENCY: { icon: "⏰", color: "#f59e0b", shortName: "False Urgency" },
  BASKET_SNEAKING: { icon: "🛒", color: "#ef4444", shortName: "Basket Sneaking" },
  DRIP_PRICING: { icon: "💸", color: "#ef4444", shortName: "Drip Pricing" },
  CONFIRM_SHAMING: { icon: "😔", color: "#a855f7", shortName: "Confirm Shaming" },
  INTERFACE_INTERFERENCE: { icon: "🎭", color: "#f97316", shortName: "Interface Interference" },
  FORCED_ACTION: { icon: "🔒", color: "#ef4444", shortName: "Forced Action" },
  SUBSCRIPTION_TRAP: { icon: "♾️", color: "#ef4444", shortName: "Subscription Trap" },
  BAIT_AND_SWITCH: { icon: "🔄", color: "#f97316", shortName: "Bait & Switch" },
  DISGUISED_ADVERTISEMENT: { icon: "📢", color: "#6366f1", shortName: "Disguised Ad" },
  NAGGING: { icon: "🔔", color: "#84cc16", shortName: "Nagging" },
  TRICK_WORDING: { icon: "💬", color: "#ec4899", shortName: "Trick Wording" },
  SAAS_BILLING: { icon: "💳", color: "#f59e0b", shortName: "SaaS Billing" },
  ROGUE_MALWARE: { icon: "☠️", color: "#ef4444", shortName: "Rogue Malware" },
};

interface PopupState {
  status: "analyzing" | "done" | "restricted" | "error";
  url: string;
  result?: ExtensionScanResult;
  backendOnline: boolean;
  progressStep: string;
  error?: string;
  expandedFindingId: string | null;
  activeTab: "overview" | "matrix" | "about";
  highlightSuccessId: string | null;
}

export const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    status: "analyzing",
    url: "",
    backendOnline: true,
    progressStep: "Inspecting page structure...",
    expandedFindingId: null,
    activeTab: "overview",
    highlightSuccessId: null,
  });

  // ─── Fetch Current Status from Background ─────────────────────────────────

  const syncState = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_POPUP_STATE" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setState(s => ({
          ...s,
          status: "done",
          backendOnline: false,
          progressStep: "Ready",
        }));
        return;
      }

      setState(s => ({
        ...s,
        status: response.status || "done",
        url: response.url || s.url,
        result: response.result || s.result,
        backendOnline: response.backendOnline !== false,
        progressStep: response.progressStep || s.progressStep,
        error: response.error,
        expandedFindingId: s.expandedFindingId || (response.result?.findings?.[0]?.id ?? null),
      }));
    });
  }, []);

  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, 1500);
    return () => clearInterval(interval);
  }, [syncState]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleRescan = () => {
    setState(s => ({
      ...s,
      status: "analyzing",
      progressStep: "Re-scanning current page...",
    }));
    chrome.runtime.sendMessage({ type: "FORCE_RESCAN" }, () => {
      setTimeout(syncState, 1000);
    });
  };

  const handleHighlight = (finding: Finding) => {
    chrome.runtime.sendMessage({
      type: "HIGHLIGHT_ELEMENT",
      finding,
    });
    setState(s => ({ ...s, highlightSuccessId: finding.id }));
    setTimeout(() => {
      setState(s => ({ ...s, highlightSuccessId: null }));
    }, 2500);
  };

  const handleRunFullAudit = () => {
    const currentUrl = state.url || state.result?.url;
    if (currentUrl) {
      chrome.runtime.sendMessage({
        type: "RUN_FULL_AUDIT",
        url: currentUrl,
      });
    }
  };

  const handleOpenFullReport = () => {
    chrome.runtime.sendMessage({
      type: "OPEN_FULL_REPORT",
      scanId: state.result?.scan_id,
      url: state.url,
    });
  };

  // ─── Computed Values ───────────────────────────────────────────────────────

  const domain = state.url
    ? (() => {
        try {
          return new URL(state.url).hostname.replace(/^www\./, "");
        } catch {
          return state.url;
        }
      })()
    : "Current Website";

  const findings = state.result?.findings || [];
  const riskAssessment = state.result?.risk_assessment || {
    risk_level: "LOW",
    risk_score: 0,
    checks_performed: 14,
    signals_found: 0,
    high_confidence_count: 0,
    medium_confidence_count: 0,
    low_confidence_count: 0,
    summary: "No deceptive UX patterns detected on this page.",
  };

  const riskLevel = riskAssessment.risk_level.toUpperCase();
  const riskScore = riskAssessment.risk_score;

  const riskBadgeColor =
    riskLevel === "HIGH" || riskLevel === "VERY HIGH"
      ? { text: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444" }
      : riskLevel === "MODERATE" || riskLevel === "ELEVATED"
      ? { text: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "#f59e0b" }
      : { text: "#34d399", bg: "rgba(16, 185, 129, 0.15)", border: "#10b981" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 380,
        minHeight: 520,
        maxHeight: 600,
        backgroundColor: "#090d16",
        color: "#f1f5f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* ─── Top Brand Header ────────────────────────────────────────────── */}
      <header
        style={{
          padding: "14px 16px 12px",
          background: "linear-gradient(180deg, #111827 0%, #0c1222 100%)",
          borderBottom: "1px solid #1e293b",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 14px rgba(99, 102, 241, 0.4)",
                fontSize: 18,
              }}
            >
              🛡️
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: 6 }}>
                DARKSHIELD
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#818cf8",
                    background: "rgba(99, 102, 241, 0.15)",
                    padding: "1px 5px",
                    borderRadius: 4,
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                  }}
                >
                  CCPA 2023
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>Digital Transparency Shield</div>
            </div>
          </div>

          <button
            onClick={handleRescan}
            title="Re-scan current page"
            disabled={state.status === "analyzing"}
            style={{
              background: state.status === "analyzing" ? "#1e293b" : "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: 6,
              color: "#c7d2fe",
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 9px",
              cursor: state.status === "analyzing" ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            {state.status === "analyzing" ? "Scanning..." : "↻ Re-scan"}
          </button>
        </div>

        {/* Current Website URL Pill */}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#030712",
            border: "1px solid #1f2937",
            borderRadius: 7,
            padding: "5px 10px",
            fontSize: 11,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <span style={{ color: "#64748b" }}>🌐</span>
            <span style={{ fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {domain}
            </span>
          </div>
          {!state.backendOnline && (
            <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>Local Engine</span>
          )}
        </div>
      </header>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          borderBottom: "1px solid #1e293b",
          background: "#0c1222",
        }}
      >
        {(["overview", "matrix", "about"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setState(s => ({ ...s, activeTab: tab }))}
            style={{
              flex: 1,
              padding: "8px 0",
              background: "none",
              border: "none",
              borderBottom: state.activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
              color: state.activeTab === tab ? "#818cf8" : "#64748b",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              cursor: "pointer",
            }}
          >
            {tab === "overview"
              ? `Findings (${findings.length})`
              : tab === "matrix"
              ? "Compliance"
              : "About"}
          </button>
        ))}
      </nav>

      {/* ─── Main Content Body ────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "12px 14px 16px" }}>
        {/* STATE 6: Restricted internal browser page */}
        {state.status === "restricted" ? (
          <div style={{ textAlign: "center", padding: "40px 10px", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>
              Restricted Browser Page
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: "#64748b" }}>
              Browser internal pages ({state.url || "chrome://"}) cannot be audited for dark patterns. Please navigate to a shopping, travel, or subscription website.
            </p>
          </div>
        ) : state.status === "analyzing" ? (
          /* STATE 1: Live Progressive Analysis */
          <div style={{ padding: "20px 8px" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8, animation: "spin 2s linear infinite" }}>
                🛡️
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
                DarkShield is analyzing this page...
              </div>
              <div style={{ fontSize: 11, color: "#818cf8", marginTop: 4 }}>
                {state.progressStep}
              </div>
            </div>

            <div
              style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#10b981" }}>
                <span>✓</span> <span>Inspecting page structure & DOM</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#10b981" }}>
                <span>✓</span> <span>Checking interaction signals & price components</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#818cf8" }}>
                <span style={{ animation: "pulse 1s infinite" }}>○</span>{" "}
                <span>Evaluating against 13 CCPA 2023 Guidelines</span>
              </div>
            </div>
          </div>
        ) : state.activeTab === "overview" ? (
          <>
            {/* ─── Risk Assessment Card ────────────────────────────────────── */}
            <div
              style={{
                background: "linear-gradient(145deg, #0f172a 0%, #172033 100%)",
                border: `1px solid ${riskBadgeColor.border}50`,
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Risk Level
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: riskBadgeColor.text,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        background: riskBadgeColor.bg,
                        border: `1px solid ${riskBadgeColor.border}`,
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {riskLevel} RISK
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Risk Score
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#f8fafc", marginTop: 1 }}>
                    {riskScore}
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b" }}>/100</span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden", margin: "6px 0 8px" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(5, riskScore))}%`,
                    background:
                      riskScore >= 60
                        ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                        : riskScore >= 25
                        ? "#f59e0b"
                        : "#10b981",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>

              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
                {riskAssessment.summary}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 10, fontWeight: 600 }}>
                <span style={{ color: "#f87171" }}>{riskAssessment.high_confidence_count} High</span>
                <span style={{ color: "#fbbf24" }}>{riskAssessment.medium_confidence_count} Med</span>
                <span style={{ color: "#34d399" }}>{findings.length} Pattern{findings.length === 1 ? "" : "s"} Detected</span>
              </div>
            </div>

            {/* STATE 2: Clean page with no detected patterns */}
            {findings.length === 0 ? (
              <div
                style={{
                  background: "#0d1b1e",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: 10,
                  padding: "24px 16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399", marginBottom: 6 }}>
                  No Significant Dark Patterns Detected
                </div>
                <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
                  DarkShield evaluated this page across 14 deterministic heuristics, affirmative consent checks, and pricing models. No deceptive patterns were identified on the current view.
                </p>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  Note: Deep checkout traps (such as drip pricing) may only appear after adding items to your cart.
                </div>
              </div>
            ) : (
              /* STATE 3: Findings List */
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                  Detected Deceptive Patterns ({findings.length})
                </div>

                {findings.map(finding => {
                  const pConfig = PATTERN_CONFIG[finding.pattern] || {
                    icon: "⚠️",
                    color: "#f59e0b",
                    shortName: finding.title,
                  };
                  const isExpanded = state.expandedFindingId === finding.id;
                  const confPct = Math.round((finding.confidence || 0.8) * 100);

                  return (
                    <div
                      key={finding.id}
                      style={{
                        background: isExpanded ? "#111827" : "#0d131f",
                        border: `1px solid ${isExpanded ? pConfig.color + "60" : "#1e293b"}`,
                        borderLeft: `3px solid ${pConfig.color}`,
                        borderRadius: 8,
                        padding: "10px 12px",
                        marginBottom: 8,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Card Summary Header */}
                      <div
                        onClick={() =>
                          setState(s => ({
                            ...s,
                            expandedFindingId: s.expandedFindingId === finding.id ? null : finding.id,
                          }))
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{pConfig.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
                              {finding.title}
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              {confPct}% confidence · {finding.ccpa_regulation || "CCPA 2023"}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: finding.severity === "high" ? "#f87171" : "#fbbf24",
                              background: finding.severity === "high" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                              padding: "2px 6px",
                              borderRadius: 4,
                              textTransform: "uppercase",
                            }}
                          >
                            {finding.severity}
                          </span>
                          <span style={{ color: "#64748b", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Expanded Evidence & Explanation */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1f2937" }}>
                          {/* Evidence snippet */}
                          {finding.text_snippets && finding.text_snippets.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>
                                Observed Evidence
                              </div>
                              <div
                                style={{
                                  background: "#030712",
                                  borderLeft: `2px solid ${pConfig.color}`,
                                  borderRadius: 4,
                                  padding: "6px 8px",
                                  fontFamily: "monospace",
                                  fontSize: 11,
                                  color: "#e2e8f0",
                                  wordBreak: "break-word",
                                }}
                              >
                                {finding.text_snippets[0]}
                              </div>
                            </div>
                          )}

                          {/* Why this matters */}
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>
                              Why This Matters
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                              {finding.explanation}
                            </div>
                          </div>

                          {/* Consumer advice */}
                          <div
                            style={{
                              background: "rgba(99, 102, 241, 0.1)",
                              border: "1px solid rgba(99, 102, 241, 0.2)",
                              borderRadius: 6,
                              padding: "6px 8px",
                              fontSize: 11,
                              color: "#cbd5e1",
                              lineHeight: 1.4,
                              marginBottom: 10,
                            }}
                          >
                            <strong style={{ color: "#818cf8" }}>💡 Consumer Advice: </strong>
                            {finding.consumer_advice}
                          </div>

                          {/* View Evidence In-Page Button */}
                          <button
                            onClick={() => handleHighlight(finding)}
                            style={{
                              width: "100%",
                              background:
                                state.highlightSuccessId === finding.id
                                  ? "#10b981"
                                  : "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
                              border: "1px solid #4b5563",
                              borderRadius: 6,
                              color: "#f8fafc",
                              padding: "6px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              transition: "all 0.15s ease",
                            }}
                          >
                            {state.highlightSuccessId === finding.id ? "✓ Element Highlighted on Page" : "🎯 View Evidence on Page"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : state.activeTab === "matrix" ? (
          /* CCPA Compliance Coverage Matrix */
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
              CCPA 2023 Pattern Coverage
            </div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.4 }}>
              Deterministic mapping against India's Consumer Protection Guidelines:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(PATTERN_CONFIG).map(([patternKey, cfg]) => {
                const isDetected = findings.some(f => f.pattern === patternKey);
                return (
                  <div
                    key={patternKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{cfg.icon}</span>
                      <span style={{ color: "#e2e8f0" }}>{cfg.shortName}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: isDetected ? "#f87171" : "#34d399",
                        background: isDetected ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {isDetected ? "DETECTED" : "CLEAN"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* About Tab */
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: 13, marginBottom: 8 }}>
              About DarkShield Extension
            </div>
            <p style={{ marginBottom: 10 }}>
              DarkShield acts as the real-time consumer-protection layer of the DarkShield platform, inspecting live e-commerce and digital service websites in your browser.
            </p>
            <div
              style={{
                background: "#0f172a",
                borderLeft: "3px solid #6366f1",
                padding: "8px 10px",
                borderRadius: 4,
                marginBottom: 10,
              }}
            >
              <strong style={{ color: "#818cf8" }}>Evidence-First Protocol: </strong>
              Findings are verifiable warnings backed by live DOM snapshots and NLP signals, mapped to CCPA Section 5 regulations.
            </div>
            <div
              style={{
                background: "#0f172a",
                borderLeft: "3px solid #10b981",
                padding: "8px 10px",
                borderRadius: 4,
              }}
            >
              <strong style={{ color: "#34d399" }}>Zero Data Intrusion: </strong>
              DarkShield never accesses passwords, payment credentials, or personal form inputs.
            </div>
          </div>
        )}
      </main>

      {/* ─── Bottom Actions Footer ────────────────────────────────────────── */}
      <footer
        style={{
          padding: "10px 14px",
          background: "#0c1222",
          borderTop: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          onClick={handleRunFullAudit}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            border: "none",
            borderRadius: 7,
            color: "#ffffff",
            padding: "9px 12px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(79, 70, 229, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>🚀</span> Run Full DarkShield Audit
        </button>

        <button
          onClick={handleOpenFullReport}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid #334155",
            borderRadius: 7,
            color: "#cbd5e1",
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>📊</span> View Full Platform Report
        </button>
      </footer>
    </div>
  );
};
