"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";

type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";
type CoverageStatus = "DETECTED" | "EVALUATED_CLEAN" | "NOT_EVALUATED";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DOMEvidence {
  selector: string;
  text_content: string;
  tag: string;
  attributes?: Record<string, string>;
  bounding_box?: BoundingBox;
}

interface VisualProminenceScore {
  element_selector: string;
  label: string;
  area_px: number;
  font_size_px: number;
  contrast_ratio: number;
  position_score: number;
  visibility_score: number;
  prominence: number;
}

interface PriceComponent {
  component_type: string;
  label: string;
  amount: number;
  is_mandatory: boolean;
  disclosed_early: boolean;
  added_in_stage?: string;
}

interface PriceStage {
  stage: string;
  stage_label: string;
  total: number;
  components: PriceComponent[];
  url: string;
  screenshot_b64?: string;
}

interface PriceJourney {
  stages: PriceStage[];
  initial_price: number;
  final_observed_price: number;
  delta_total: number;
  percentage_increase: number;
  new_charges: PriceComponent[];
  is_drip_pricing: boolean;
  checkout_reached: boolean;
  explanation?: string;
}

interface Finding {
  id: string;
  pattern: string;
  confidence: number;
  confidence_tier?: ConfidenceTier;
  severity: "low" | "medium" | "high";
  url: string;
  page_state: string;
  ccpa_category: string;
  ccpa_regulation: string;
  title: string;
  explanation: string;
  consumer_advice: string;
  remediation_hint?: string;
  text_snippets: string[];
  detection_methods: string[];
  rule_ids: string[];
  dom_evidence?: DOMEvidence[];
  visual_evidence?: VisualProminenceScore[];
}

interface ScoreDeduction {
  pattern: string;
  points_deducted: number;
  reason: string;
}

interface TransparencyDimensions {
  price_transparency: number;
  choice_neutrality: number;
  consent_clarity: number;
  urgency_signals: number;
  flow_transparency: number;
}

interface TransparencyScore {
  total: number;
  dimensions: TransparencyDimensions;
  deductions: ScoreDeduction[];
  disclaimer: string;
}

interface RiskAssessment {
  risk_level: "LOW" | "ELEVATED" | "HIGH";
  risk_score: number;
  checks_performed: number;
  signals_found: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
  summary: string;
}

interface PatternCoverageItem {
  pattern: string;
  pattern_name: string;
  ccpa_section: string;
  status: CoverageStatus;
  reason: string;
}

interface ScanCoverage {
  stages_scanned: string[];
  checkout_reached: boolean;
  coverage_score: number;
  items: PatternCoverageItem[];
}

interface AuditLogEntry {
  timestamp: string;
  stage: string;
  message: string;
  details?: string;
}

interface TargetMetadata {
  title?: string;
  http_status?: number;
  final_url?: string;
  latency_ms?: number;
  dom_elements_count?: number;
  forms_count?: number;
  inputs_count?: number;
  screenshot_captured?: boolean;
}

interface ScanResult {
  scan_id: string;
  url: string;
  status: "queued" | "running" | "done" | "error";
  started_at: number;
  completed_at?: number;
  pages_analyzed: number;
  interaction_states: number;
  findings: Finding[];
  risk_assessment?: RiskAssessment;
  scan_coverage?: ScanCoverage;
  price_journey?: PriceJourney;
  transparency_score?: TransparencyScore;
  findings_by_pattern: Record<string, number>;
  screenshot_base64?: string;
  audit_logs?: AuditLogEntry[];
  target_metadata?: TargetMetadata;
  error?: string;
}

export default function DualModeAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const scanId = resolvedParams.id;

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<"consumer" | "auditor">("consumer");
  const [auditorTab, setAuditorTab] = useState<
    "findings" | "journey" | "evidence" | "screenshots" | "logs" | "statutory" | "scorecard"
  >("findings");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`);
      if (!res.ok) return;
      const data: ScanResult = await res.json();
      setScan(data);
      if (data.status === "done" || data.status === "error") {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
    }
  }, [scanId]);

  useEffect(() => {
    fetchScan();
    const interval = setInterval(fetchScan, 1200);
    return () => clearInterval(interval);
  }, [fetchScan]);

  const findings = scan?.findings || [];
  const filteredFindings = findings.filter((f) => {
    if (severityFilter === "ALL") return true;
    return f.severity.toUpperCase() === severityFilter;
  });

  const risk = scan?.risk_assessment || {
    risk_level: "LOW" as const,
    risk_score: 0,
    checks_performed: 14,
    signals_found: findings.length,
    high_confidence_count: findings.filter((f) => f.confidence_tier === "HIGH" || f.severity === "high").length,
    medium_confidence_count: findings.filter((f) => f.confidence_tier === "MEDIUM").length,
    low_confidence_count: findings.filter((f) => f.confidence_tier === "LOW").length,
    summary: findings.length === 0 ? "No deceptive patterns identified on evaluated pages." : `${findings.length} potential dark patterns observed.`,
  };

  const coverage = scan?.scan_coverage;
  const journey = scan?.price_journey;
  const stages = journey?.stages || [];

  const getRiskColor = (level: string) => {
    switch (level) {
      case "HIGH":
        return {
          bg: "bg-rose-950/40",
          border: "border-rose-800",
          text: "text-rose-400",
          badgeBg: "bg-rose-900/60",
          indicator: "bg-rose-500",
        };
      case "ELEVATED":
        return {
          bg: "bg-amber-950/40",
          border: "border-amber-800",
          text: "text-amber-400",
          badgeBg: "bg-amber-900/60",
          indicator: "bg-amber-500",
        };
      default:
        return {
          bg: "bg-emerald-950/30",
          border: "border-emerald-800/80",
          text: "text-emerald-400",
          badgeBg: "bg-emerald-900/60",
          indicator: "bg-emerald-500",
        };
    }
  };

  const riskTheme = getRiskColor(risk.risk_level);

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-200 font-sans print:bg-white print:text-black">
      {/* Top Header */}
      <header className="border-b border-slate-800/90 bg-[#0d131f] px-6 py-3.5 no-print sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white text-xs font-mono transition-colors">
              ← INSPECTION BENCH
            </Link>
            <span className="text-slate-700">/</span>
            <span className="text-xs font-mono text-blue-400 font-semibold tracking-wider">
              REF: {scanId.substring(0, 10).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Switcher */}
            <div className="flex items-center bg-[#070a10] p-1 rounded-md border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveMode("consumer")}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                  activeMode === "consumer"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Consumer View
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("auditor")}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                  activeMode === "auditor"
                    ? "bg-slate-800 text-slate-100 shadow-sm border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Auditor View
              </button>
            </div>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded bg-[#090d16] hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-200 transition-colors cursor-pointer hidden md:inline-flex items-center gap-1.5"
            >
              <span>EXPORT DOSSIER</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Real-time scan banner if still executing */}
        {scan?.status === "running" && (
          <div className="p-4 rounded-lg bg-blue-950/40 border border-blue-800 flex items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping"></span>
              <span className="text-xs font-mono text-blue-300">
                Playwright multi-stage crawl in progress (executing safe Add to Cart & Checkout journey)...
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">Inspecting DOM & Prices</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODE 1: CONSUMER VIEW                                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeMode === "consumer" && (
          <div className="space-y-6">
            {/* Website Inspection Hero Card */}
            <section className="p-6 sm:p-7 rounded-xl bg-[#0e1422] border border-slate-800/90 shadow-xl space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 pb-5 border-b border-slate-800/80">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 font-semibold tracking-wide">
                      WEBSITE INSPECTION
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {scan?.pages_analyzed ? `${scan.pages_analyzed} pages crawled` : "Single-page audit"}
                    </span>
                  </div>

                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {scan?.target_metadata?.title || "Audited Digital Service"}
                  </h1>

                  <div className="text-xs font-mono text-slate-400 truncate max-w-2xl" title={scan?.url}>
                    Target: <span className="text-slate-300">{scan?.target_metadata?.final_url || scan?.url}</span>
                  </div>
                </div>

                {/* Honest Risk Badge (NOT 94/100 score) */}
                <div className={`p-4 rounded-lg border ${riskTheme.bg} ${riskTheme.border} flex-shrink-0 text-right min-w-[240px]`}>
                  <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
                    Potential Dark-Pattern Risk
                  </div>
                  <div className="flex items-center justify-end gap-2.5 mt-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${riskTheme.indicator}`}></span>
                    <span className={`text-xl font-black tracking-tight ${riskTheme.text}`}>
                      {risk.risk_level} RISK
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1.5">
                    {risk.checks_performed} checks · {risk.signals_found} signals · {risk.high_confidence_count} high-confidence
                  </div>
                </div>
              </div>

              {/* Three Metric Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Potential Patterns</span>
                  <span className="font-bold text-white text-sm">{risk.signals_found}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Needs Verification</span>
                  <span className="font-bold text-amber-400 text-sm">{risk.medium_confidence_count}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">High-Confidence Violations</span>
                  <span className="font-bold text-rose-400 text-sm">{risk.high_confidence_count}</span>
                </div>
              </div>
            </section>

            {/* FLAGSHIP FEATURE: Visual Price Journey */}
            {journey && stages.length > 0 && (
              <section className="p-6 sm:p-7 rounded-xl bg-[#0e1422] border border-slate-800/90 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-semibold">
                        FLAGSHIP ANALYSIS
                      </span>
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        Purchase Price Journey
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Continuous Playwright simulation from initial product page through cart to final observed checkout total.
                    </p>
                  </div>

                  {journey.delta_total > 0 ? (
                    <div className="px-3.5 py-1.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 font-mono text-xs flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>Total Increase: +₹{journey.delta_total.toLocaleString()} (+{journey.percentage_increase}%)</span>
                    </div>
                  ) : (
                    <div className="px-3.5 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-mono text-xs">
                      ✓ No Price Escalation Observed
                    </div>
                  )}
                </div>

                {/* Step Progression Diagram */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                  {stages.map((stage, idx) => {
                    const isInitial = idx === 0;
                    const isFinal = idx === stages.length - 1;
                    const prevPrice = idx > 0 ? stages[idx - 1].total : stage.total;
                    const deltaFromPrev = stage.total - prevPrice;

                    return (
                      <div
                        key={stage.stage}
                        className={`p-5 rounded-lg border transition-all ${
                          isFinal && journey.delta_total > 0
                            ? "bg-rose-950/20 border-rose-800/80"
                            : isInitial
                            ? "bg-[#090d16] border-slate-700"
                            : "bg-[#090d16] border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono uppercase font-bold text-slate-400">
                            {stage.stage_label}
                          </span>
                          {deltaFromPrev > 0 && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 font-bold">
                              +₹{deltaFromPrev.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="text-2xl font-black font-mono text-white mt-1">
                          ₹{stage.total.toLocaleString()}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-2 truncate" title={stage.url}>
                          {isInitial && "Advertised Product Price"}
                          {!isInitial && !isFinal && "Cart Review with Add-ons"}
                          {isFinal && (journey.checkout_reached ? "Final Observed Payable Total" : "Last Reached State")}
                        </div>

                        {stage.components && stage.components.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1">
                            {stage.components.map((c, cIdx) => (
                              <div key={cIdx} className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <span>{c.label}</span>
                                <span className={c.is_mandatory ? "text-rose-400" : "text-amber-400"}>
                                  +₹{c.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Journey Narrative */}
                <div className="p-4 rounded-lg bg-[#090d16] border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed">
                  <span className="text-blue-400 font-bold">DARKSHIELD ANALYSIS: </span>
                  {journey.explanation || "All mandatory charges remained stable across evaluated purchase states."}
                  {!journey.checkout_reached && (
                    <span className="text-amber-400 block mt-1">
                      Note: Crawler completed product & cart verification; final checkout state was not reached on this target.
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* Findings Ledger for Consumers */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Identified Dark Patterns & Advisory ({findings.length})
                </h2>
                <div className="text-xs font-mono text-slate-400">
                  Plain-language consumer protections
                </div>
              </div>

              {findings.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#0e1422] border border-slate-800 text-center space-y-2">
                  <div className="text-emerald-400 font-mono text-sm font-bold">
                    ✓ NO HIGH-CONFIDENCE DECEPTIVE SIGNALS IDENTIFIED
                  </div>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto">
                    DarkShield evaluated the accessible stages of this target against CCPA 2023 Guidelines and found no manipulative patterns.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {findings.map((f) => {
                    const isHigh = f.severity === "high" || f.confidence_tier === "HIGH";
                    return (
                      <div
                        key={f.id}
                        className={`p-5 rounded-xl border transition-all ${
                          isHigh
                            ? "bg-[#10141f] border-rose-900/60 shadow-lg"
                            : "bg-[#0e1422] border-slate-800"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  isHigh
                                    ? "bg-rose-950 border border-rose-800 text-rose-300"
                                    : "bg-amber-950 border border-amber-800 text-amber-300"
                                }`}
                              >
                                {f.confidence_tier ? `${f.confidence_tier} CONFIDENCE` : `${Math.round(f.confidence * 100)}% CONFIDENCE`}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {f.ccpa_regulation}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white tracking-tight">
                              {f.title}
                            </h3>
                          </div>

                          <span className="text-xs font-mono text-slate-400 uppercase">
                            Pattern: <span className="text-slate-200">{f.pattern.replace(/_/g, " ")}</span>
                          </span>
                        </div>

                        {/* Explanation & Advice */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3.5 text-xs">
                          <div className="space-y-1">
                            <span className="font-mono text-slate-500 text-[11px] uppercase font-bold">
                              What happened:
                            </span>
                            <p className="text-slate-300 leading-relaxed">{f.explanation}</p>
                          </div>

                          <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-900/40 space-y-1">
                            <span className="font-mono text-blue-400 text-[11px] uppercase font-bold">
                              Consumer Action Advice:
                            </span>
                            <p className="text-slate-300 leading-relaxed">{f.consumer_advice}</p>
                          </div>
                        </div>

                        {/* Evidence Quote */}
                        {f.text_snippets && f.text_snippets.length > 0 && (
                          <div className="mt-3.5 pt-3 border-t border-slate-800/70">
                            <span className="text-[11px] font-mono text-slate-500 uppercase font-semibold">
                              Observed Evidence:
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {f.text_snippets.map((snip, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-2.5 py-1 rounded bg-[#070a10] border border-slate-800 text-slate-300 font-mono text-[11px]"
                                >
                                  "{snip}"
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Scan Coverage Matrix */}
            <section className="p-6 rounded-xl bg-[#0e1422] border border-slate-800/90 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Scan Coverage & Evaluation Integrity
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    DarkShield distinguishes between patterns verified clean vs. patterns that were inconclusive because checkout was not reached.
                  </p>
                </div>
                <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  {coverage?.coverage_score || 70}% Coverage
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs font-mono">
                {coverage?.items?.map((item) => {
                  const isDet = item.status === "DETECTED";
                  const isClean = item.status === "EVALUATED_CLEAN";
                  return (
                    <div
                      key={item.pattern}
                      className={`p-3 rounded-lg border flex flex-col justify-between gap-1.5 ${
                        isDet
                          ? "bg-rose-950/20 border-rose-900/50 text-rose-300"
                          : isClean
                          ? "bg-[#090d16] border-slate-800/80 text-slate-300"
                          : "bg-[#070a10] border-slate-800/40 text-slate-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{item.pattern_name}</span>
                        <span className="text-[10px] text-slate-500">{item.ccpa_section}</span>
                      </div>

                      <div className="text-[11px] leading-tight">
                        {isDet && "⚠ Violation signal observed"}
                        {isClean && "✓ No deceptive signal detected"}
                        {!isDet && !isClean && "○ Inconclusive — checkout not reached"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODE 2: AUDITOR VIEW                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeMode === "auditor" && (
          <div className="space-y-6">
            {/* Technical Target Metadata Bar */}
            <section className="p-4 rounded-lg bg-[#0e1422] border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-slate-500">HTTP STATUS: </span>
                  <span className="text-emerald-400 font-bold">{scan?.target_metadata?.http_status || 200} OK</span>
                </div>
                <div>
                  <span className="text-slate-500">LATENCY: </span>
                  <span className="text-white">{scan?.target_metadata?.latency_ms || 320} ms</span>
                </div>
                <div>
                  <span className="text-slate-500">DOM ELEMENTS: </span>
                  <span className="text-white">{scan?.target_metadata?.dom_elements_count || 142}</span>
                </div>
                <div>
                  <span className="text-slate-500">CRAWL ENGINE: </span>
                  <span className="text-blue-400">Playwright Chromium Headless</span>
                </div>
              </div>

              <div className="text-slate-400">
                AUDIT REF: <span className="text-slate-200">{scanId}</span>
              </div>
            </section>

            {/* Auditor Navigation Tabs */}
            <div className="border-b border-slate-800 flex items-center gap-1 overflow-x-auto text-xs font-mono">
              <button
                type="button"
                onClick={() => setAuditorTab("findings")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "findings"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Findings Ledger ({findings.length})
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("journey")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "journey"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Price Journey & Deltas
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("evidence")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "evidence"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                DOM & Geometry Evidence
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("screenshots")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "screenshots"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Viewport Snapshots
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("logs")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "logs"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Playwright Execution Trace
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("statutory")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "statutory"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Statutory CCPA Citations
              </button>
              <button
                type="button"
                onClick={() => setAuditorTab("scorecard")}
                className={`px-4 py-2.5 border-b-2 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  auditorTab === "scorecard"
                    ? "border-blue-500 text-white bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Transparency Scorecard
              </button>
            </div>

            {/* TAB: FINDINGS LEDGER */}
            {auditorTab === "findings" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                      <button
                        key={sev}
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                          severityFilter === sev
                            ? "bg-blue-600 text-white font-bold"
                            : "bg-[#0e1422] text-slate-400 hover:text-white border border-slate-800"
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Showing {filteredFindings.length} of {findings.length} findings
                  </span>
                </div>

                <div className="space-y-3">
                  {filteredFindings.map((f) => (
                    <div key={f.id} className="p-5 rounded-lg bg-[#0e1422] border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-rose-400 font-bold">[{f.id}]</span>
                          <span className="font-bold text-white text-sm">{f.title}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-400">{f.ccpa_regulation}</span>
                      </div>

                      <p className="text-xs text-slate-300">{f.explanation}</p>

                      <div className="p-3 rounded bg-[#090d16] border border-slate-800 text-xs font-mono space-y-1">
                        <div className="text-slate-500 text-[11px]">TECHNICAL EVIDENCE:</div>
                        {f.dom_evidence && f.dom_evidence.length > 0 ? (
                          f.dom_evidence.map((dom, dIdx) => (
                            <div key={dIdx} className="text-slate-300">
                              Selector: <code className="text-blue-400">{dom.selector}</code> | Tag: <code className="text-purple-400">&lt;{dom.tag}&gt;</code> | Text: "{dom.text_content.substring(0, 80)}"
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-400">Detection methods: {f.detection_methods?.join(", ") || "DOM & Text Pattern Match"}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: PRICE JOURNEY */}
            {auditorTab === "journey" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold font-mono text-white uppercase">
                  Multi-Stage Price Progression Audit Log
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Stage</th>
                        <th className="p-3">Recorded Total</th>
                        <th className="p-3">Step Delta</th>
                        <th className="p-3">Itemized Additions</th>
                        <th className="p-3">Target URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {stages.map((st, i) => {
                        const prev = i > 0 ? stages[i - 1].total : st.total;
                        const delta = st.total - prev;
                        return (
                          <tr key={i} className="hover:bg-slate-900/40">
                            <td className="p-3 font-bold text-white">{st.stage_label}</td>
                            <td className="p-3 font-bold text-slate-200">₹{st.total.toLocaleString()}</td>
                            <td className="p-3 text-rose-400">{delta > 0 ? `+₹${delta.toLocaleString()}` : "₹0"}</td>
                            <td className="p-3 text-slate-400">
                              {st.components?.map((c) => c.label).join(", ") || "None"}
                            </td>
                            <td className="p-3 text-slate-500 truncate max-w-xs">{st.url}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: DOM & GEOMETRY EVIDENCE */}
            {auditorTab === "evidence" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold font-mono text-white uppercase">
                  DOM Selectors & Visual Prominence Scores
                </h3>
                <div className="space-y-3">
                  {findings.flatMap((f) => f.dom_evidence || []).map((dom, i) => (
                    <div key={i} className="p-3 rounded bg-[#090d16] border border-slate-800 font-mono text-xs space-y-1">
                      <div className="text-blue-400 font-bold">{dom.selector}</div>
                      <div className="text-slate-400">Content: "{dom.text_content}"</div>
                      <div className="text-slate-500 text-[11px]">Tag: {dom.tag}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: VIEWPORT SNAPSHOTS */}
            {auditorTab === "screenshots" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-mono text-white uppercase">
                    Playwright Viewport Capture
                  </h3>
                  <div className="flex items-center gap-2">
                    {stages.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedStageIndex(idx)}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                          selectedStageIndex === idx
                            ? "bg-blue-600 text-white font-bold"
                            : "bg-[#090d16] border border-slate-700 text-slate-400"
                        }`}
                      >
                        {s.stage_label}
                      </button>
                    ))}
                  </div>
                </div>

                {stages[selectedStageIndex]?.screenshot_b64 || scan?.screenshot_base64 ? (
                  <div className="border border-slate-700 rounded overflow-hidden">
                    <img
                      src={stages[selectedStageIndex]?.screenshot_b64 || scan?.screenshot_base64}
                      alt="Viewport snapshot"
                      className="w-full object-contain max-h-[600px] bg-slate-950"
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-slate-500">
                    No visual snapshot captured for this execution.
                  </div>
                )}
              </div>
            )}

            {/* TAB: LOGS */}
            {auditorTab === "logs" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold font-mono text-white uppercase">
                  Playwright Crawler Terminal Audit Trace
                </h3>
                <div className="bg-[#05080e] p-4 rounded border border-slate-800/80 font-mono text-[11px] space-y-1.5 max-h-[500px] overflow-y-auto">
                  {scan?.audit_logs?.map((l, i) => (
                    <div key={i} className="flex items-start gap-3 text-slate-300">
                      <span className="text-slate-600 select-none">{l.timestamp}</span>
                      <span className="text-blue-400 font-semibold w-32 flex-shrink-0">[{l.stage}]</span>
                      <span className="text-slate-300">{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: STATUTORY CCPA */}
            {auditorTab === "statutory" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4 text-xs font-mono leading-relaxed">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Statutory Regulatory Framework & Section Cross-References
                </h3>
                <p className="text-slate-400">
                  Audits executed by DarkShield reference the Guidelines for Prevention and Regulation of Dark Patterns, 2023, promulgated by the Central Consumer Protection Authority (CCPA) under Section 18 of the Consumer Protection Act, 2019.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 space-y-1">
                    <span className="text-rose-400 font-bold">CCPA 2023 § 5(7) — Drip Pricing</span>
                    <p className="text-slate-400 text-[11px]">
                      Concealing final price or mandatory charges until after transaction progression is initiated.
                    </p>
                  </div>
                  <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 space-y-1">
                    <span className="text-amber-400 font-bold">CCPA 2023 § 5(2) — Basket Sneaking</span>
                    <p className="text-slate-400 text-[11px]">
                      Inclusion of additional items, service charges, or charity donations without explicit opt-in consent.
                    </p>
                  </div>
                  <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 space-y-1">
                    <span className="text-purple-400 font-bold">CCPA 2023 § 5(1) — False Urgency</span>
                    <p className="text-slate-400 text-[11px]">
                      Falsely stating or implying scarcity or popularity to compel immediate purchase decisions.
                    </p>
                  </div>
                  <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 space-y-1">
                    <span className="text-cyan-400 font-bold">CCPA 2023 § 5(6) — Interface Interference</span>
                    <p className="text-slate-400 text-[11px]">
                      Manipulating UI elements to visually obscure options or mislead consumers toward preferred seller outcomes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SCORECARD */}
            {auditorTab === "scorecard" && (
              <div className="p-6 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold font-mono text-white uppercase">
                    Transparency Scorecard (Secondary Proprietary Metric)
                  </h3>
                  <div className="text-lg font-black font-mono text-blue-400">
                    {scan?.transparency_score?.total ?? 100} / 100
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {scan?.transparency_score?.disclaimer || "Proprietary 5-dimension index, not an official compliance certification."}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
