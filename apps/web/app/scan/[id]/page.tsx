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
  first_observed_stage?: string;
  first_seen_stage?: string;
  last_seen_stage?: string;
  carryover?: boolean;
  is_aggregate?: boolean;
  previously_disclosed?: boolean;
  is_delivery_dependent?: boolean;
}

interface PriceStage {
  stage: string;
  stage_label: string;
  total?: number | null;
  is_captured?: boolean;
  components: PriceComponent[];
  url: string;
  screenshot_b64?: string;
  extraction_source?: string;
  extraction_confidence?: string;
}

interface PriceComponentExplanation {
  label: string;
  amount: number;
  component_type?: string;
  category?: string;
  stage_added?: string;
  disclosure_stage?: string;
  assessment_status?: string;
  reason?: string;
  assessment_reason?: string;
}

interface PriceJourney {
  stages: PriceStage[];
  initial_price?: number | null;
  cart_price?: number | null;
  final_observed_price?: number | null;
  delta_01?: number | null;
  delta_12?: number | null;
  delta_total?: number | null;
  percentage_increase?: number | null;
  component_explanations?: PriceComponentExplanation[];
  new_charges: PriceComponent[];
  reconciled_carryover_note?: string;
  dark_pattern_assessment?: "DETECTED" | "POTENTIAL_SIGNAL" | "EVALUATED_CLEAN" | "INCONCLUSIVE";
  is_drip_pricing: boolean;
  potential_drip?: boolean;
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

interface RiskAssessment {
  risk_level: "LOW" | "ELEVATED" | "HIGH" | "UNDETERMINED";
  risk_score: number;
  checks_performed: number;
  signals_found: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
  summary: string;
  coverage_sufficient?: boolean;
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

  const highFindingsCount = findings.filter(
    (f) => f.confidence_tier === "HIGH" || f.severity === "high"
  ).length;

  const risk = scan?.risk_assessment || {
    risk_level: "LOW" as const,
    risk_score: 0,
    checks_performed: 14,
    signals_found: findings.length,
    high_confidence_count: highFindingsCount,
    medium_confidence_count: findings.filter((f) => f.confidence_tier === "MEDIUM").length,
    low_confidence_count: findings.filter((f) => f.confidence_tier === "LOW").length,
    summary:
      findings.length === 0
        ? "No deceptive patterns identified on evaluated pages."
        : `${findings.length} potential dark patterns observed.`,
  };

  const coverage = scan?.scan_coverage;
  const journey = scan?.price_journey;
  const stages = journey?.stages || [];

  const stageP0 = stages.find((s) => s.stage === "product");
  const stageP1 = stages.find((s) => s.stage === "cart");
  const stageP2 = stages.find((s) => s.stage === "checkout");

  const p0 = stageP0?.is_captured ? stageP0.total : journey?.initial_price;
  const p1 = stageP1?.is_captured ? stageP1.total : journey?.cart_price;
  const p2 = stageP2?.is_captured ? stageP2.total : journey?.final_observed_price;

  const stagesScanned = coverage?.stages_scanned || stages.map((s) => s.stage);

  // Extract clean hostname for title
  let hostname = "example.com";
  try {
    if (scan?.url) {
      hostname = new URL(scan.url).hostname;
    }
  } catch (e) {}

  const displayName = scan?.target_metadata?.title || hostname;

  // Use reconciled new charges directly from price journey
  const reconciledCharges: PriceComponent[] = journey?.new_charges || [];

  // Extract primary potential issue explanation
  const dripFinding = findings.find((f) => f.pattern === "DRIP_PRICING");
  const sneakingFinding = findings.find((f) => f.pattern === "BASKET_SNEAKING");
  let potentialIssueText = "";
  if (dripFinding) {
    potentialIssueText = dripFinding.explanation;
  } else if (sneakingFinding) {
    potentialIssueText = sneakingFinding.explanation;
  } else if (journey?.explanation && journey.explanation.includes("withheld")) {
    potentialIssueText = journey.explanation;
  } else if (journey?.delta_total && journey.delta_total > 0) {
    potentialIssueText = `Payable total escalated by +₹${journey.delta_total.toLocaleString()} (${journey.percentage_increase}%) beyond the initial advertised listing price.`;
  }

  return (
    <div className={`min-h-screen ${activeMode === "consumer" ? "bg-[#F7F8FA] text-[#111827]" : "bg-[#090d14] text-slate-200 font-mono"}`}>
      {/* Top Header */}
      <header className={`border-b ${activeMode === "consumer" ? "bg-white border-[#E5E7EB]" : "bg-[#0d131f] border-slate-800"} px-6 py-3.5 sticky top-0 z-30`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className={`text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeMode === "consumer" ? "text-[#6B7280] hover:text-[#111827]" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>← Back to scans</span>
            </Link>
            <span className={activeMode === "consumer" ? "text-[#E5E7EB]" : "text-slate-700"}>|</span>
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-sm ${activeMode === "consumer" ? "text-[#111827]" : "text-white"}`}>
                DarkShield
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Consumer | Auditor Mode Switcher */}
            <div className={`flex items-center p-1 rounded-md border ${
              activeMode === "consumer" ? "bg-[#F3F4F6] border-[#E5E7EB]" : "bg-[#070a10] border-slate-800"
            }`}>
              <button
                type="button"
                onClick={() => setActiveMode("consumer")}
                className={`px-3 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
                  activeMode === "consumer"
                    ? "bg-white text-[#111827] shadow-xs font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Consumer View
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("auditor")}
                className={`px-3 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
                  activeMode === "auditor"
                    ? "bg-slate-800 text-white shadow-xs font-semibold border border-slate-700"
                    : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                Auditor View
              </button>
            </div>

            <button
              onClick={() => window.print()}
              className={`px-3 py-1.5 rounded text-xs transition-colors cursor-pointer hidden md:inline-flex items-center gap-1.5 border ${
                activeMode === "consumer"
                  ? "bg-white hover:bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
                  : "bg-[#090d16] hover:bg-slate-800 border-slate-700 text-slate-200 font-mono"
              }`}
            >
              <span>Export</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Real-time status banner if crawl is active */}
        {scan?.status === "running" && (
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between gap-4 text-xs text-blue-800">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
              <span className="font-medium">
                Inspecting purchase journey (Product → Cart → Checkout)...
              </span>
            </div>
            <span className="text-blue-600 font-medium">In Progress</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODE 1: CONSUMER VIEW (Clean Light SaaS & Regulatory Inspection)     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeMode === "consumer" && (
          <div className="space-y-6 font-sans">
            {/* Store / Target Header */}
            <section className="space-y-1">
              <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
                {displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                <span className="font-mono text-[#4B5563]">{hostname}</span>
                <span>•</span>
                <span className="flex items-center gap-1.5 text-[#15803D] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]"></span>
                  Inspection completed
                </span>
                <span>•</span>
                <span>{stagesScanned.length} stages evaluated</span>
              </div>
            </section>

            {/* Main Result Card (Exact Layout from Specification) */}
            <section className="bg-white border border-[#E5E7EB] rounded-lg p-6 shadow-xs space-y-4">
              <div className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                Risk assessment
              </div>

              <div className="flex items-baseline gap-3">
                <span
                  className={`text-3xl font-bold tracking-tight ${
                    risk.risk_level === "HIGH"
                      ? "text-[#DC2626]"
                      : risk.risk_level === "ELEVATED"
                      ? "text-[#B45309]"
                      : risk.risk_level === "UNDETERMINED"
                      ? "text-[#6B7280]"
                      : "text-[#15803D]"
                  }`}
                >
                  {risk.risk_level}
                </span>

                {risk.risk_level === "UNDETERMINED" && (
                  <span className="text-xs text-[#6B7280] bg-[#F9FAFB] px-2 py-0.5 rounded border border-[#E5E7EB]">
                    Inconclusive checkout coverage
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[#4B5563]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span>
                  <span>
                    {findings.length} potential {findings.length === 1 ? "signal" : "signals"} detected
                  </span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <span>
                    {highFindingsCount} high-confidence {highFindingsCount === 1 ? "finding" : "findings"}
                  </span>
                </div>
              </div>

              {/* Coverage Integrity Checkmarks */}
              <div className="pt-3 border-t border-[#F3F4F6] flex items-center gap-6 text-xs text-[#374151]">
                <span className="flex items-center gap-1.5 font-medium">
                  <span>Product</span>
                  <span className="text-[#15803D] font-bold">✓</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span>Cart</span>
                  {stagesScanned.includes("cart") ? (
                    stageP1?.is_captured !== false ? (
                      <span className="text-[#15803D] font-bold">✓</span>
                    ) : (
                      <span className="text-[#B45309] font-bold" title="Price not captured">?</span>
                    )
                  ) : (
                    <span className="text-[#9CA3AF]">Not reached</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span>Checkout</span>
                  {stagesScanned.includes("checkout") ? (
                    stageP2?.is_captured !== false ? (
                      <span className="text-[#15803D] font-bold">✓</span>
                    ) : (
                      <span className="text-[#B45309] font-bold" title="Price not captured">?</span>
                    )
                  ) : (
                    <span className="text-[#9CA3AF]">Not reached</span>
                  )}
                </span>
              </div>
            </section>

            {/* Price Journey: Financial Comparison Table */}
            {journey && stages.length > 0 && (
              <section className="bg-white border border-[#E5E7EB] rounded-lg p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">Price journey</h2>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Observed price changes from advertised product page to final observed checkout total.
                    </p>
                  </div>

                  {journey.delta_total && journey.delta_total > 0 ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded bg-red-50 text-[#DC2626] border border-red-200">
                      Total increase +₹{journey.delta_total.toLocaleString()} (+{journey.percentage_increase}%)
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded bg-green-50 text-[#15803D] border border-green-200">
                      Stable transparent price
                    </span>
                  )}
                </div>

                {/* Financial Comparison Columns: Advertised | Cart | Checkout */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Advertised */}
                  <div className="p-4 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-1">
                    <div className="text-xs text-[#6B7280] font-medium">Advertised</div>
                    <div className="text-2xl font-bold text-[#111827]">
                      {p0 !== null && p0 !== undefined ? `₹${p0.toLocaleString()}` : "Not captured"}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF]">Initial listing price</div>
                  </div>

                  {/* Cart */}
                  <div className="p-4 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6B7280] font-medium">Cart</span>
                      {journey?.delta_01 && journey.delta_01 > 0 && (
                        <span className="text-[11px] font-semibold text-[#DC2626]">
                          +₹{journey.delta_01.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-[#111827]">
                      {p1 !== null && p1 !== undefined
                        ? `₹${p1.toLocaleString()}`
                        : stagesScanned.includes("cart")
                        ? "Not captured"
                        : "Not reached"}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF]">Basket review stage</div>
                  </div>

                  {/* Checkout */}
                  <div className="p-4 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6B7280] font-medium">Checkout</span>
                      {journey?.delta_12 && journey.delta_12 > 0 && (
                        <span className="text-[11px] font-semibold text-[#DC2626]">
                          +₹{journey.delta_12.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-[#111827]">
                      {p2 !== null && p2 !== undefined
                        ? `₹${p2.toLocaleString()}`
                        : stagesScanned.includes("checkout")
                        ? "Not captured"
                        : "Not reached"}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF]">Final observed payable total</div>
                  </div>
                </div>

                {/* What changed? Table */}
                {reconciledCharges.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-[#111827]">What changed?</div>
                      <span className="text-xs text-[#6B7280]">
                        Reconciled itemized additions across purchase flow
                      </span>
                    </div>

                    <div className="border border-[#E5E7EB] rounded-md overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F9FAFB] text-[#6B7280] border-b border-[#E5E7EB] font-medium">
                          <tr>
                            <th className="py-2.5 px-4">Charge</th>
                            <th className="py-2.5 px-4 text-right">Amount</th>
                            <th className="py-2.5 px-4 text-right">First seen</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-[#111827]">
                          {reconciledCharges.map((fee, idx) => (
                            <tr key={idx} className="hover:bg-[#F9FAFB]/50">
                              <td className="py-2.5 px-4 font-medium">{fee.label}</td>
                              <td className="py-2.5 px-4 text-right font-medium">₹{fee.amount.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right text-[#6B7280] capitalize">
                                {fee.first_seen_stage || fee.added_in_stage || "checkout"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-[#E5E7EB] bg-[#F9FAFB] font-semibold text-xs text-[#111827]">
                          <tr>
                            <td className="py-2.5 px-4">New charges identified</td>
                            <td className="py-2.5 px-4 text-right text-[#DC2626]">
                              ₹{reconciledCharges.reduce((acc, c) => acc + c.amount, 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[#6B7280]">
                              {reconciledCharges.length} itemized
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Reconciled charges carryover notice */}
                    {journey?.reconciled_carryover_note && (
                      <div className="p-3 rounded-md bg-[#F0FDF4] border border-[#BBF7D0] flex items-start gap-2.5 text-xs text-[#15803D]">
                        <svg className="w-4 h-4 text-[#16A34A] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="leading-relaxed">
                          <span className="font-semibold">Reconciled charges: </span>
                          <span>{journey.reconciled_carryover_note}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Potential Issue Callout */}
                {potentialIssueText && (
                  <div className="p-3.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-[#B45309] space-y-1">
                    <div className="font-semibold text-amber-950">Potential issue</div>
                    <div className="text-amber-900 leading-relaxed">{potentialIssueText}</div>
                  </div>
                )}
              </section>
            )}

            {/* Findings List */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#111827]">
                  Observed findings ({findings.length})
                </h2>
                <span className="text-xs text-[#6B7280]">
                  Automated consumer protection analysis
                </span>
              </div>

              {findings.length === 0 ? (
                <div className="bg-white border border-[#E5E7EB] rounded-lg p-8 text-center space-y-2">
                  <div className="text-[#15803D] font-semibold text-sm">
                    ✓ No deceptive patterns observed
                  </div>
                  <p className="text-xs text-[#6B7280] max-w-md mx-auto">
                    DarkShield observed the accessible purchase journey stages and found no deceptive price escalation or manipulative choice architecture.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className="bg-white border border-[#E5E7EB] rounded-lg p-5 space-y-3 shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                f.confidence_tier === "HIGH" || f.severity === "high"
                                  ? "bg-red-50 text-[#DC2626] border border-red-200"
                                  : "bg-amber-50 text-[#B45309] border border-amber-200"
                              }`}
                            >
                              {f.confidence_tier === "HIGH" ? "High-confidence finding" : "Potential signal"}
                            </span>
                            <span className="text-xs text-[#9CA3AF] font-mono">{f.ccpa_regulation}</span>
                          </div>
                          <h3 className="font-semibold text-sm text-[#111827]">{f.title}</h3>
                        </div>

                        <span className="text-xs text-[#6B7280] capitalize bg-[#F9FAFB] px-2.5 py-1 rounded border border-[#E5E7EB] self-start">
                          {f.pattern.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>

                      <p className="text-xs text-[#4B5563] leading-relaxed">{f.explanation}</p>

                      {f.consumer_advice && (
                        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded p-3 text-xs text-[#374151] space-y-0.5">
                          <span className="font-semibold text-[#111827]">What to do: </span>
                          <span>{f.consumer_advice}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MODE 2: AUDITOR VIEW (Technical Evidentiary Inspection Console)     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeMode === "auditor" && (
          <div className="space-y-6 font-mono text-xs">
            {/* Technical Metadata Bar */}
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
                  <span className="text-slate-500">DOM NODES: </span>
                  <span className="text-white">{scan?.target_metadata?.dom_elements_count || 142}</span>
                </div>
                <div>
                  <span className="text-slate-500">ENGINE: </span>
                  <span className="text-blue-400">Playwright Chromium</span>
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
                Viewport Snapshots ({stages.length})
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
                Playwright Action Trace
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
                CCPA Citations
              </button>
            </div>

            {/* TAB 1: Findings Ledger */}
            {auditorTab === "findings" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400">
                    Showing {filteredFindings.length} findings with full evidentiary attributes
                  </div>
                  <div className="flex items-center gap-2">
                    {["ALL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeverityFilter(s)}
                        className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          severityFilter === s
                            ? "bg-blue-900/50 border-blue-600 text-blue-300 font-bold"
                            : "bg-[#090d16] border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredFindings.map((f) => (
                    <div key={f.id} className="p-4 rounded-lg bg-[#0e1422] border border-slate-800 space-y-3">
                      {/* Human Interpretation First */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            {f.pattern.replace(/_/g, " ")}
                          </div>
                          <div className="text-base font-bold text-white">{f.title}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>CCPA category: <span className="text-slate-300 font-medium">{f.ccpa_category || f.pattern.replace(/_/g, " ")}</span></span>
                            <span>•</span>
                            <span className="text-slate-500">{f.ccpa_regulation}</span>
                          </div>
                        </div>

                        <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">
                              {f.confidence >= 0.8 ? "High confidence" : "Potential signal"}
                            </span>
                            <span className="text-sm font-bold text-blue-400">
                              {Math.round(f.confidence * 100)}%
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            TIER: {f.confidence_tier || "MEDIUM"}
                          </div>
                        </div>
                      </div>

                      {/* Evidence Section */}
                      {(f.text_snippets?.length > 0 || (f.dom_evidence && f.dom_evidence.length > 0)) && (
                        <div className="space-y-1.5 text-[11px]">
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">EVIDENCE:</span>
                          {f.text_snippets?.length > 0 ? (
                            <div className="p-2.5 rounded bg-[#05070d] border border-slate-800/80 text-emerald-300 italic font-mono text-[11px] leading-relaxed">
                              "{f.text_snippets[0]}"
                            </div>
                          ) : f.dom_evidence && f.dom_evidence[0]?.text_content ? (
                            <div className="p-2.5 rounded bg-[#05070d] border border-slate-800/80 text-emerald-300 italic font-mono text-[11px] leading-relaxed">
                              "{f.dom_evidence[0].text_content}"
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Technical Details: Rule ID & Explanations */}
                      <div className="pt-2 border-t border-slate-800/60 space-y-2.5 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">DETECTION RULE:</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300 font-mono font-bold">
                            {f.rule_ids?.[0] || f.pattern}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <span className="text-slate-500 font-bold">TECHNICAL EXPLANATION:</span>
                            <p className="text-slate-300 mt-0.5 leading-relaxed">{f.explanation}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">REMEDIATION SPECIFICATION:</span>
                            <p className="text-slate-300 mt-0.5 leading-relaxed">{f.remediation_hint || f.consumer_advice}</p>
                          </div>
                        </div>

                        {f.dom_evidence && f.dom_evidence.length > 0 && f.dom_evidence[0]?.selector && (
                          <div className="pt-1 text-[10px]">
                            <span className="text-slate-500 font-bold">DOM SELECTOR:</span>
                            <pre className="mt-1 p-2 rounded bg-[#05070d] border border-slate-800/80 text-blue-300 overflow-x-auto font-mono">
                              {f.dom_evidence[0].selector}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: Price Journey & Deltas */}
            {auditorTab === "journey" && (
              <div className="p-5 rounded-lg bg-[#0e1422] border border-slate-800 space-y-4">
                <div className="text-sm font-bold text-white">PRICE RECONCILIATION LEDGER</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border border-slate-800">
                    <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">STAGE</th>
                        <th className="p-2.5">EXTRACTED AMOUNT</th>
                        <th className="p-2.5">SOURCE</th>
                        <th className="p-2.5">CONFIDENCE</th>
                        <th className="p-2.5">DELTA FROM P0</th>
                        <th className="p-2.5">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-200">
                      {stages.map((s, idx) => (
                        <tr key={s.stage}>
                          <td className="p-2.5 font-bold">{s.stage_label}</td>
                          <td className="p-2.5">
                            {s.total !== null && s.total !== undefined ? `₹${s.total.toLocaleString()}` : "NULL (Uncaptured)"}
                          </td>
                          <td className="p-2.5 text-blue-400">{s.extraction_source || "SEMANTIC_DOM"}</td>
                          <td className="p-2.5">{s.extraction_confidence || "HIGH"}</td>
                          <td className="p-2.5">
                            {idx === 0
                              ? "BASELINE"
                              : s.total && p0
                              ? `+₹${(s.total - p0).toLocaleString()}`
                              : "N/A"}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              s.is_captured !== false ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"
                            }`}>
                              {s.is_captured !== false ? "CAPTURED" : "NOT_CAPTURED"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-slate-400 text-[11px] leading-relaxed pt-2">
                  <span className="text-blue-400 font-bold">DRIP PRICING CALCULATION: </span>
                  {journey?.is_drip_pricing
                    ? `CONFIRMED: Mandatory charges withheld from initial stage P0 (₹${p0?.toLocaleString() || 0}) and escalated to P2 (₹${p2?.toLocaleString() || 0}) without prior disclosure.`
                    : "EVALUATED_CLEAN: No undisclosed mandatory fee escalation observed."}
                </div>
              </div>
            )}

            {/* TAB 3: DOM & Geometry Evidence */}
            {auditorTab === "evidence" && (
              <div className="space-y-3">
                {findings.map((f) => (
                  <div key={f.id} className="p-4 rounded-lg bg-[#0e1422] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span>{f.pattern}</span>
                      <span className="text-blue-400">{f.ccpa_regulation}</span>
                    </div>

                    {f.dom_evidence && f.dom_evidence.length > 0 ? (
                      <div className="space-y-2">
                        {f.dom_evidence.map((dom, dIdx) => (
                          <div key={dIdx} className="p-3 rounded bg-[#070a10] border border-slate-800 space-y-1">
                            <div className="text-slate-400">SELECTOR: <span className="text-blue-300">{dom.selector}</span></div>
                            <div className="text-slate-400">TAG: <span className="text-white">{dom.tag}</span></div>
                            <div className="text-slate-400">TEXT CONTENT: <span className="text-white">"{dom.text_content}"</span></div>
                            {dom.bounding_box && (
                              <div className="text-slate-500 text-[10px]">
                                BOUNDS: x={dom.bounding_box.x}, y={dom.bounding_box.y}, w={dom.bounding_box.width}, h={dom.bounding_box.height}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500">No raw DOM node bounding box recorded.</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: Viewport Snapshots */}
            {auditorTab === "screenshots" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {stages.map((st, idx) => (
                    <button
                      key={st.stage}
                      type="button"
                      onClick={() => setSelectedStageIndex(idx)}
                      className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                        selectedStageIndex === idx
                          ? "bg-blue-900/50 border-blue-600 text-blue-300 font-bold"
                          : "bg-[#0e1422] border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {st.stage_label}
                    </button>
                  ))}
                </div>

                {stages[selectedStageIndex]?.screenshot_b64 ? (
                  <div className="rounded-lg overflow-hidden border border-slate-800 bg-[#070a10] p-2">
                    <img
                      src={stages[selectedStageIndex].screenshot_b64}
                      alt={stages[selectedStageIndex].stage_label}
                      className="w-full h-auto rounded border border-slate-800/80"
                    />
                  </div>
                ) : (
                  <div className="p-8 rounded-lg bg-[#0e1422] border border-slate-800 text-center text-slate-500">
                    No viewport screenshot captured for {stages[selectedStageIndex]?.stage_label || "selected stage"}.
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Playwright Action Trace Logs */}
            {auditorTab === "logs" && (
              <div className="p-4 rounded-lg bg-[#0e1422] border border-slate-800 space-y-2">
                <div className="text-sm font-bold text-white mb-2">PLAYWRIGHT ENGINE EXECUTION TRACE</div>
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {scan?.audit_logs?.map((l, idx) => (
                    <div key={idx} className="flex items-start gap-3 py-1 border-b border-slate-800/40 text-[11px]">
                      <span className="text-slate-500 flex-shrink-0">{l.timestamp}</span>
                      <span className="text-blue-400 font-bold flex-shrink-0">[{l.stage}]</span>
                      <span className="text-slate-300">{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 6: CCPA Statutory Citations */}
            {auditorTab === "statutory" && (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-[#0e1422] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">STATUTORY MAPPING UNDER CCPA 2023 GUIDELINES</div>
                  <p className="text-slate-400 leading-relaxed">
                    Guidelines for Prevention and Regulation of Dark Patterns, 2023 issued by the Central Consumer Protection Authority (CCPA) under Section 18 of the Consumer Protection Act, 2019.
                  </p>
                </div>

                <div className="space-y-2">
                  {findings.map((f) => (
                    <div key={f.id} className="p-3.5 rounded-lg bg-[#070a10] border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-blue-400 font-bold">
                        <span>{f.pattern}</span>
                        <span>{f.ccpa_regulation}</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{f.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
