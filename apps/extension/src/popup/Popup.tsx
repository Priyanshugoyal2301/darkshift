import React, { useEffect, useState, useCallback } from "react";
import type { Finding, TransparencyScore, ScanResult, CCPAPattern } from "@darkshield/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopupState {
  loading: boolean;
  scanning: boolean;
  scanResult?: Partial<ScanResult>;
  expandedFinding: string | null;
  activeTab: "findings" | "score" | "about";
}

// ─── Pattern display config ───────────────────────────────────────────────────

const PATTERN_CONFIG: Record<CCPAPattern, { icon: string; color: string; shortName: string }> = {
  FALSE_URGENCY:          { icon: "⏰", color: "#f59e0b", shortName: "False Urgency" },
  BASKET_SNEAKING:        { icon: "🛒", color: "#ef4444", shortName: "Basket Sneaking" },
  DRIP_PRICING:           { icon: "💸", color: "#ef4444", shortName: "Drip Pricing" },
  CONFIRM_SHAMING:        { icon: "😔", color: "#a855f7", shortName: "Confirm Shaming" },
  INTERFACE_INTERFERENCE: { icon: "🎭", color: "#f97316", shortName: "Interface Interference" },
  FORCED_ACTION:          { icon: "🔒", color: "#ef4444", shortName: "Forced Action" },
  SUBSCRIPTION_TRAP:      { icon: "♾️", color: "#ef4444", shortName: "Subscription Trap" },
  BAIT_AND_SWITCH:        { icon: "🔄", color: "#f97316", shortName: "Bait & Switch" },
  DISGUISED_ADVERTISEMENT:{ icon: "📢", color: "#6366f1", shortName: "Disguised Ad" },
  NAGGING:                { icon: "🔔", color: "#84cc16", shortName: "Nagging" },
  TRICK_WORDING:          { icon: "💬", color: "#ec4899", shortName: "Trick Wording" },
  SAAS_BILLING:           { icon: "💳", color: "#f59e0b", shortName: "SaaS Billing" },
  ROGUE_MALWARE:          { icon: "☠️", color: "#ef4444", shortName: "Rogue Malware" },
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "Good" : score >= 40 ? "Caution" : "At Risk";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        {/* Background ring */}
        <circle cx={50} cy={50} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        {/* Score ring */}
        <circle
          cx={50} cy={50} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s ease" }}
        />
        {/* Score text */}
        <text x={50} y={46} textAnchor="middle" fill="#f1f5f9" fontSize={20} fontWeight="700">
          {score}
        </text>
        <text x={50} y={62} textAnchor="middle" fill="#94a3b8" fontSize={10}>
          / 100
        </text>
      </svg>
      <span style={{
        fontSize: 13, fontWeight: 600,
        color,
        background: `${color}20`,
        padding: "3px 10px",
        borderRadius: 20,
        letterSpacing: "0.5px",
      }}>
        {label}
      </span>
    </div>
  );
};

// ─── Finding Card ─────────────────────────────────────────────────────────────

const FindingCard: React.FC<{
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
}> = ({ finding, expanded, onToggle }) => {
  const config = PATTERN_CONFIG[finding.pattern];
  const severityColor =
    finding.severity === "high" ? "#ef4444" :
    finding.severity === "medium" ? "#f59e0b" : "#3b82f6";

  return (
    <div
      onClick={onToggle}
      style={{
        background: expanded ? "#1e293b" : "#111827",
        border: `1px solid ${expanded ? config.color + "50" : "#1e293b"}`,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{config.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{finding.title}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {config.shortName} · CCPA 2023
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: severityColor,
            background: `${severityColor}20`,
            padding: "2px 7px",
            borderRadius: 20,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            {finding.severity}
          </span>
          <span style={{ color: "#475569", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
          {/* Confidence bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Detection Confidence</span>
              <span style={{ fontSize: 11, color: config.color, fontWeight: 600 }}>
                {Math.round(finding.confidence * 100)}%
              </span>
            </div>
            <div style={{ background: "#0f172a", borderRadius: 4, height: 4, overflow: "hidden" }}>
              <div style={{
                width: `${finding.confidence * 100}%`,
                height: "100%",
                background: config.color,
                borderRadius: 4,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>

          {/* Explanation */}
          <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 10 }}>
            {finding.explanation}
          </p>

          {/* Evidence snippets */}
          {finding.text_snippets && finding.text_snippets.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Evidence
              </div>
              {finding.text_snippets.slice(0, 3).map((snippet, i) => (
                <div key={i} style={{
                  background: "#0f172a",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11,
                  color: "#e2e8f0",
                  fontFamily: "monospace",
                  marginBottom: 4,
                  borderLeft: `2px solid ${config.color}`,
                }}>
                  {snippet}
                </div>
              ))}
            </div>
          )}

          {/* Consumer advice */}
          <div style={{
            background: `${config.color}15`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}>
            <span style={{ fontWeight: 600, color: config.color }}>💡 Advice: </span>
            {finding.consumer_advice}
          </div>

          {/* Detection methods */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {finding.detection_methods.map(m => (
              <span key={m} style={{
                fontSize: 9, fontWeight: 600,
                color: "#64748b",
                background: "#0f172a",
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {m.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Score Breakdown ──────────────────────────────────────────────────────────

const ScoreBreakdown: React.FC<{ score: TransparencyScore }> = ({ score }) => {
  const dims = [
    { key: "price_transparency", label: "Price Transparency", icon: "💸" },
    { key: "choice_neutrality", label: "Choice Neutrality", icon: "⚖️" },
    { key: "consent_clarity", label: "Consent Clarity", icon: "✅" },
    { key: "urgency_signals", label: "Urgency Signals", icon: "⏰" },
    { key: "flow_transparency", label: "Flow Transparency", icon: "🔄" },
  ] as const;

  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
        {score.disclaimer}
      </div>
      {dims.map(({ key, label, icon }) => {
        const val = score.dimensions[key];
        const color = val >= 70 ? "#22c55e" : val >= 40 ? "#f59e0b" : "#ef4444";
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>{icon} {label}</span>
              <span style={{ fontSize: 12, color, fontWeight: 600 }}>{val}</span>
            </div>
            <div style={{ background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{
                width: `${val}%`,
                height: "100%",
                background: color,
                borderRadius: 4,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Popup ───────────────────────────────────────────────────────────────

export const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    loading: true,
    scanning: false,
    expandedFinding: null,
    activeTab: "findings",
  });

  const fetchResult = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    chrome.runtime.sendMessage({ type: "GET_SCAN_RESULT" }, (response) => {
      setState(s => ({
        ...s,
        loading: false,
        scanResult: response?.scanResult,
      }));
    });
  }, []);

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  const requestScan = useCallback(() => {
    setState(s => ({ ...s, scanning: true }));
    chrome.runtime.sendMessage({ type: "REQUEST_SCAN" }, () => {
      setTimeout(() => {
        fetchResult();
        setState(s => ({ ...s, scanning: false }));
      }, 2500);
    });
  }, [fetchResult]);

  const findings = state.scanResult?.findings || [];
  const score = state.scanResult?.transparency_score;
  const severeCounts = {
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 500 }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
        padding: "16px 18px 14px",
        borderBottom: "1px solid #1e293b",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: -30, right: -30,
          width: 100, height: 100,
          background: "radial-gradient(circle, #6366f140 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
              boxShadow: "0 0 16px #6366f140",
            }}>
              🛡️
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.3px" }}>
                DarkShield
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>CCPA Dark Pattern Detector</div>
            </div>
          </div>

          {/* Scan button */}
          <button
            onClick={requestScan}
            disabled={state.scanning}
            style={{
              background: state.scanning
                ? "#1e293b"
                : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: state.scanning ? "not-allowed" : "pointer",
              opacity: state.scanning ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
          >
            {state.scanning ? "Scanning..." : "↻ Scan"}
          </button>
        </div>

        {/* Summary row */}
        {!state.loading && score && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 12,
            background: "#0f172a",
            borderRadius: 10,
            padding: "10px 14px",
          }}>
            <ScoreRing score={score.total} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>
                {findings.length}
                <span style={{ fontSize: 13, fontWeight: 400, color: "#64748b", marginLeft: 6 }}>
                  potential {findings.length === 1 ? "issue" : "issues"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {severeCounts.high > 0 && (
                  <span style={{
                    fontSize: 10, color: "#ef4444",
                    background: "#ef444420", padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                  }}>
                    {severeCounts.high} high
                  </span>
                )}
                {severeCounts.medium > 0 && (
                  <span style={{
                    fontSize: 10, color: "#f59e0b",
                    background: "#f59e0b20", padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                  }}>
                    {severeCounts.medium} medium
                  </span>
                )}
                {findings.length === 0 && (
                  <span style={{
                    fontSize: 10, color: "#22c55e",
                    background: "#22c55e20", padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                  }}>
                    ✓ Clean
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
      }}>
        {(["findings", "score", "about"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setState(s => ({ ...s, activeTab: tab }))}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "none",
              border: "none",
              borderBottom: state.activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
              color: state.activeTab === tab ? "#6366f1" : "#64748b",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              textTransform: "capitalize",
            }}
          >
            {tab === "findings" ? `Findings (${findings.length})` : tab === "score" ? "Score" : "About"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px" }}>
        {state.loading ? (
          <div style={{ textAlign: "center", paddingTop: 60, color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14 }}>Analyzing page...</div>
          </div>
        ) : state.activeTab === "findings" ? (
          findings.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 40, color: "#475569" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e", marginBottom: 6 }}>
                No dark patterns detected
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                DarkShield found no dark patterns on this page. This is a signal, not a guarantee — always review your purchase carefully.
              </div>
            </div>
          ) : (
            <div>
              {findings.map(finding => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  expanded={state.expandedFinding === finding.id}
                  onToggle={() => setState(s => ({
                    ...s,
                    expandedFinding: s.expandedFinding === finding.id ? null : finding.id,
                  }))}
                />
              ))}
            </div>
          )
        ) : state.activeTab === "score" ? (
          score ? (
            <ScoreBreakdown score={score} />
          ) : (
            <div style={{ textAlign: "center", paddingTop: 40, color: "#475569", fontSize: 13 }}>
              Run a scan first to see score breakdown.
            </div>
          )
        ) : (
          // About tab
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14, marginBottom: 10 }}>
              About DarkShield
            </div>
            <p style={{ marginBottom: 12 }}>
              DarkShield is an evidence-first dark pattern detector built around India's
              <strong style={{ color: "#6366f1" }}> CCPA Dark Pattern Guidelines 2023</strong>.
            </p>
            <p style={{ marginBottom: 12 }}>
              It detects 13 categories of deceptive UX practices across e-commerce, travel,
              subscription, and digital service platforms.
            </p>
            <div style={{
              background: "#1e293b",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 11,
              borderLeft: "3px solid #6366f1",
            }}>
              <strong style={{ color: "#6366f1" }}>⚠ Important: </strong>
              DarkShield detects <em>potential</em> dark patterns and provides evidence-based
              warnings. Findings are not legal determinations. DarkShield never claims
              a website is "illegal."
            </div>
            <div style={{
              background: "#1e293b",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 11,
              borderLeft: "3px solid #22c55e",
            }}>
              <strong style={{ color: "#22c55e" }}>🔒 Privacy: </strong>
              All detection runs locally in your browser. No webpage content is sent to
              external servers by default.
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "#475569" }}>
              v1.0.0 · Built for India's digital consumers<br />
              CCPA reference: Guidelines for Prevention and Regulation of Dark Patterns, 2023
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
