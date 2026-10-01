"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { Shield, ChevronDown, ChevronRight, Check, AlertTriangle, ArrowRight, MousePointer2 } from "lucide-react";

// --- Types (Preserved) ---
type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";
type CoverageStatus = "DETECTED" | "EVALUATED_CLEAN" | "NOT_EVALUATED";
interface BoundingBox { x: number; y: number; width: number; height: number; }
interface DOMEvidence { selector: string; text_content: string; tag: string; attributes?: Record<string, string>; bounding_box?: BoundingBox; finding?: string; }
interface VisualProminenceScore { element_selector: string; label: string; area_px: number; font_size_px: number; contrast_ratio: number; position_score: number; visibility_score: number; prominence: number; }
interface PriceComponent { component_type: string; label: string; amount: number; is_mandatory: boolean; disclosed_early: boolean; added_in_stage?: string; first_observed_stage?: string; first_seen_stage?: string; last_seen_stage?: string; carryover?: boolean; is_aggregate?: boolean; previously_disclosed?: boolean; is_delivery_dependent?: boolean; }
interface PriceStage { stage: string; stage_label: string; total?: number | null; is_captured?: boolean; components: PriceComponent[]; url: string; screenshot_b64?: string; extraction_source?: string; extraction_confidence?: string; }
interface PriceComponentExplanation { label: string; amount: number; component_type?: string; category?: string; stage_added?: string; disclosure_stage?: string; assessment_status?: string; reason?: string; assessment_reason?: string; }
interface PriceJourney { stages: PriceStage[]; initial_price?: number | null; cart_price?: number | null; final_observed_price?: number | null; delta_01?: number | null; delta_12?: number | null; delta_total?: number | null; percentage_increase?: number | null; component_explanations?: PriceComponentExplanation[]; new_charges: PriceComponent[]; reconciled_carryover_note?: string; dark_pattern_assessment?: "DETECTED" | "POTENTIAL_SIGNAL" | "EVALUATED_CLEAN" | "INCONCLUSIVE"; is_drip_pricing: boolean; potential_drip?: boolean; checkout_reached: boolean; explanation?: string; }
interface Finding { id: string; pattern: string; confidence: number; confidence_tier?: ConfidenceTier; severity: "low" | "medium" | "high"; url: string; page_state: string; ccpa_category: string; ccpa_regulation: string; title: string; explanation: string; consumer_advice: string; remediation_hint?: string; text_snippets: string[]; detection_methods: string[]; rule_ids: string[]; dom_evidence?: DOMEvidence[]; visual_evidence?: VisualProminenceScore[]; }
interface ScoreDeduction { pattern: string; points_deducted: number; reason: string; }
interface TransparencyDimensions { price_transparency: number; choice_neutrality: number; consent_clarity: number; urgency_signals: number; flow_transparency: number; }
interface TransparencyScore { total: number; dimensions: TransparencyDimensions; deductions: ScoreDeduction[]; disclaimer: string; }
interface PatternCoverageItem { pattern: string; pattern_name: string; ccpa_section: string; status: CoverageStatus; reason: string; }
interface ScanCoverage { stages_scanned: string[]; checkout_reached: boolean; coverage_score: number; items: PatternCoverageItem[]; }
interface RiskAssessment { risk_level: "LOW" | "ELEVATED" | "HIGH" | "UNDETERMINED"; risk_score: number; checks_performed: number; signals_found: number; high_confidence_count: number; medium_confidence_count: number; low_confidence_count: number; summary: string; coverage_sufficient?: boolean; }
interface AuditLogEntry { timestamp: string; stage: string; message: string; details?: string; }
interface TargetMetadata { title?: string; http_status?: number; final_url?: string; latency_ms?: number; dom_elements_count?: number; forms_count?: number; inputs_count?: number; screenshot_captured?: boolean; }
interface ScanResult { scan_id: string; url: string; status: "queued" | "running" | "done" | "error"; started_at: number; completed_at?: number; pages_analyzed: number; interaction_states: number; findings: Finding[]; risk_assessment?: RiskAssessment; scan_coverage?: ScanCoverage; price_journey?: PriceJourney; transparency_score?: TransparencyScore; findings_by_pattern: Record<string, number>; screenshot_base64?: string; audit_logs?: AuditLogEntry[]; target_metadata?: TargetMetadata; error?: string; }


export default function DualModeAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const scanId = resolvedParams.id;

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [activeMode, setActiveMode] = useState<"consumer" | "auditor">("consumer");
  
  // Auditor State
  const [auditorView, setAuditorView] = useState<"FINDINGS" | "EVIDENCE" | "TRACE">("FINDINGS");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [evidenceTab, setEvidenceTab] = useState<"JOURNEY" | "DOM" | "SCREENSHOTS">("JOURNEY");
  const [selectedStageIdx, setSelectedStageIdx] = useState<number>(0);
  const [showTechDetails, setShowTechDetails] = useState(false);

  // Consumer State
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`);
      if (!res.ok) return;
      const data: ScanResult = await res.json();
      setScan(data);
      if (!selectedFindingId && data.findings?.length > 0) {
        setSelectedFindingId(data.findings[0].id);
      }
    } catch (err) { console.error(err); }
  }, [scanId, selectedFindingId]);

  useEffect(() => {
    fetchScan();
    if (!scan || scan.status === "queued" || scan.status === "running") {
      const interval = setInterval(() => {
        setScan(prev => {
          if (prev?.status === "done" || prev?.status === "error") {
            clearInterval(interval);
          }
          return prev;
        });
        fetchScan();
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [fetchScan, scan?.status]);

  const findings = scan?.findings || [];
  const risk = scan?.risk_assessment;
  const journey = scan?.price_journey;
  const stages = journey?.stages || [];
  const reconciledCharges = journey?.new_charges || [];

  const toggleConsumerFinding = (id: string) => {
    setExpandedFindings(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getRiskColor = (level?: string) => {
    switch (level) {
      case "HIGH": return "text-red-700";
      case "ELEVATED": return "text-amber-700";
      case "LOW": return "text-emerald-700";
      default: return "text-gray-500";
    }
  };

  // --------------------------------------------------------------------------------
  // CONSUMER VIEW (Light, Editorial, Asymmetrical Report)
  // --------------------------------------------------------------------------------
  if (activeMode === "consumer") {
    return (
      <div className="min-h-screen bg-[#F9FAFB] text-gray-900 font-sans selection:bg-blue-100">
        
        {/* Minimal Header */}
        <header className="border-b border-gray-200 bg-white sticky top-0 z-30 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-bold text-sm tracking-tight text-gray-900">
                <Shield className="w-4 h-4 text-blue-600" />
                DarkShield
              </Link>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                <Link href="/" className="hover:text-gray-900 transition-colors">← Back to scans</Link>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-100 p-0.5 rounded border border-gray-200">
                <button className="px-3 py-1.5 text-xs font-semibold bg-white shadow-sm rounded text-gray-900">
                  Consumer Report
                </button>
                <button 
                  onClick={() => setActiveMode("auditor")}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Auditor Workbench
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-12">
          {/* Asymmetrical Layout */}
          <div className="flex flex-col lg:flex-row items-start gap-16">
            
            {/* LEFT COLUMN: Identity & Risk (35%) */}
            <div className="w-full lg:w-[35%] lg:sticky lg:top-24 space-y-8">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 leading-tight">
                  {scan?.target_metadata?.title || "Evaluating Website"}
                </h1>
                <div className="text-sm text-gray-500 font-mono break-words">
                  {scan?.url}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Risk Assessment</div>
                <div className={`text-4xl font-black tracking-tighter ${getRiskColor(risk?.risk_level)}`}>
                  {risk?.risk_level || "PENDING"}
                </div>
              </div>

              {findings.length > 0 && (
                <div className="pt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">{findings.length}</span> potential dark pattern signals detected during the purchase flow.
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Analysis & Evidence (65%) */}
            <div className="w-full lg:w-[65%] space-y-16">
              
              {/* Analysis: Price Journey */}
              {journey && stages.length > 0 && (
                <div className="space-y-6">
                  <h2 className="text-lg font-bold tracking-tight text-gray-900">What changed?</h2>
                  
                  {journey.delta_total && journey.delta_total > 0 ? (
                    <div className="text-base text-gray-700 leading-relaxed max-w-xl">
                      The final payable price increased after additional charges appeared during the purchase journey.
                    </div>
                  ) : (
                    <div className="text-base text-gray-700 leading-relaxed max-w-xl">
                      The advertised price remained consistent through checkout.
                    </div>
                  )}

                  {/* 3-Stage Price Journey: Advertised → Cart → Checkout */}
                  <div className="flex flex-wrap items-center gap-4 py-6 border-y border-gray-200">
                    {/* P0: Advertised */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Advertised</div>
                      <div className="text-xl font-bold text-gray-900">
                        {journey.initial_price !== null && journey.initial_price !== undefined ? `₹${journey.initial_price.toLocaleString()}` : "—"}
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

                    {/* P1: Cart */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cart</div>
                      <div className={`text-xl font-bold ${
                        journey.cart_price !== null && journey.cart_price !== undefined ? "text-gray-900" : "text-gray-400"
                      }`}>
                        {journey.cart_price !== null && journey.cart_price !== undefined
                          ? `₹${journey.cart_price.toLocaleString()}`
                          : "Not captured"}
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />

                    {/* P2: Checkout — only show real price if checkout was actually reached */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Checkout</div>
                      <div className={`text-xl font-bold ${
                        journey.checkout_reached && journey.final_observed_price !== null && journey.final_observed_price !== undefined
                          ? "text-gray-900" : "text-gray-400"
                      }`}>
                        {journey.checkout_reached && journey.final_observed_price !== null && journey.final_observed_price !== undefined
                          ? `₹${journey.final_observed_price.toLocaleString()}`
                          : journey.cart_price !== null && journey.cart_price !== undefined
                            ? "Not reached"
                            : "—"}
                      </div>
                    </div>

                    {/* Delta Badge — only show if checkout was reached and there's an increase */}
                    {journey.checkout_reached && journey.delta_total && journey.delta_total > 0 ? (
                      <div className="ml-auto flex flex-col items-end space-y-1">
                         <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Increase</div>
                         <div className="text-lg font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                           +₹{journey.delta_total.toLocaleString()}
                         </div>
                      </div>
                    ) : journey.cart_price && journey.delta_01 && journey.delta_01 > 0 ? (
                      <div className="ml-auto flex flex-col items-end space-y-1">
                         <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cart Increase</div>
                         <div className="text-lg font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                           +₹{journey.delta_01.toLocaleString()}
                         </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Reconciled Charges (Editorial Table) */}
                  {reconciledCharges.length > 0 && (
                    <div className="pt-2">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-gray-200 text-gray-500">
                          <tr>
                            <th className="pb-3 font-medium">Charge added</th>
                            <th className="pb-3 font-medium text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {reconciledCharges.map((fee, idx) => (
                            <tr key={idx}>
                              <td className="py-4 text-gray-900">{fee.label}</td>
                              <td className="py-4 text-right text-gray-900 font-medium">+₹{fee.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Analysis: Findings List */}
              <div className="space-y-6">
                <h2 className="text-lg font-bold tracking-tight text-gray-900">Things worth checking</h2>
                
                {findings.length === 0 ? (
                  <div className="text-gray-500 text-sm">No deceptive patterns observed.</div>
                ) : (
                  <div className="space-y-0 border-t border-gray-200">
                    {findings.map((f, idx) => {
                      const isExpanded = expandedFindings[f.id];
                      return (
                        <div key={f.id} className="border-b border-gray-200">
                          {/* Compact Row */}
                          <button 
                            onClick={() => toggleConsumerFinding(f.id)}
                            className="w-full flex flex-col sm:flex-row sm:items-baseline justify-between py-5 text-left group"
                          >
                            <div className="flex items-baseline gap-4">
                              <span className="text-xs font-mono font-bold text-gray-300 w-5">{(idx + 1).toString().padStart(2, '0')}</span>
                              <span className="text-xs font-bold tracking-widest uppercase text-gray-500 w-40">{f.pattern.replace(/_/g, " ")}</span>
                              <span className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{f.title}</span>
                            </div>
                            <div className="hidden sm:block text-gray-400 group-hover:text-gray-900 transition-colors">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </div>
                          </button>
                          
                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="pl-[5.5rem] pb-6 pr-4 space-y-6 animate-in slide-in-from-top-1">
                              <div className="space-y-2">
                                <div className="text-base text-gray-700 leading-relaxed">{f.explanation}</div>
                              </div>
                              {f.consumer_advice && (
                                <div className="bg-blue-50/50 p-4 rounded text-sm text-blue-900 leading-relaxed border border-blue-100">
                                  <span className="font-bold block mb-1">What to do:</span>
                                  {f.consumer_advice}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------------------------------------
  // AUDITOR VIEW (Dark, Technical, Inspection Workbench)
  // --------------------------------------------------------------------------------
  const selectedFinding = findings.find(f => f.id === selectedFindingId) || findings[0];

  return (
    <div className="min-h-screen bg-[#0E1117] text-[#C9D1D9] font-sans flex flex-col selection:bg-[#1F6FEB]/30">
      
      {/* Workbench Header */}
      <header className="h-12 border-b border-[#30363D] bg-[#161B22] flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Shield className="w-4 h-4 text-[#58A6FF]" />
          <span className="text-xs font-bold text-white tracking-wide">DARKSHIELD WORKBENCH</span>
        </div>
        <div className="flex items-center bg-[#0D1117] rounded border border-[#30363D] p-0.5">
          <button 
            onClick={() => setActiveMode("consumer")}
            className="px-3 py-1 text-[11px] font-semibold text-[#8B949E] hover:text-white transition-colors"
          >
            Consumer Report
          </button>
          <button className="px-3 py-1 text-[11px] font-semibold bg-[#21262D] text-white rounded border border-[#30363D] shadow-sm">
            Auditor Workbench
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden h-[calc(100vh-3rem)]">
        
        {/* LEFT RAIL (Navigation) */}
        <aside className="w-64 border-r border-[#30363D] bg-[#161B22] flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-[#30363D] space-y-1">
            <div className="text-[10px] font-mono text-[#8B949E]">AUDIT ID</div>
            <div className="text-xs font-mono text-white truncate">{scanId}</div>
          </div>

          <nav className="p-2 space-y-4">
            
            {/* View: Findings */}
            <div>
              <button 
                onClick={() => setAuditorView("FINDINGS")}
                className={`w-full text-left px-2 py-1.5 rounded text-xs font-semibold flex items-center justify-between ${auditorView === "FINDINGS" ? "bg-[#1F6FEB]/10 text-[#58A6FF]" : "text-[#C9D1D9] hover:bg-[#21262D]"}`}
              >
                <span>FINDINGS</span>
                <span className="text-[10px] bg-[#30363D] px-1.5 rounded">{findings.length}</span>
              </button>
              
              {auditorView === "FINDINGS" && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {findings.map((f, idx) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFindingId(f.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono truncate transition-colors ${selectedFindingId === f.id ? "bg-[#21262D] text-white border-l-2 border-[#58A6FF]" : "text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D]/50 border-l-2 border-transparent"}`}
                    >
                      {(idx + 1).toString().padStart(2, '0')} {f.pattern}
                    </button>
                  ))}
                  {findings.length === 0 && <div className="px-2 py-1.5 text-[11px] text-[#8B949E]">No findings</div>}
                </div>
              )}
            </div>

            {/* View: Evidence */}
            <div>
              <button 
                onClick={() => setAuditorView("EVIDENCE")}
                className={`w-full text-left px-2 py-1.5 rounded text-xs font-semibold flex items-center justify-between ${auditorView === "EVIDENCE" ? "bg-[#1F6FEB]/10 text-[#58A6FF]" : "text-[#C9D1D9] hover:bg-[#21262D]"}`}
              >
                <span>EVIDENCE FILE</span>
              </button>
              {auditorView === "EVIDENCE" && (
                <div className="mt-1 space-y-0.5 pl-2">
                  <button onClick={() => setEvidenceTab("JOURNEY")} className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${evidenceTab === "JOURNEY" ? "bg-[#21262D] text-white border-l-2 border-[#58A6FF]" : "text-[#8B949E] hover:bg-[#21262D]/50 border-l-2 border-transparent"}`}>Price Journey</button>
                  <button onClick={() => setEvidenceTab("DOM")} className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${evidenceTab === "DOM" ? "bg-[#21262D] text-white border-l-2 border-[#58A6FF]" : "text-[#8B949E] hover:bg-[#21262D]/50 border-l-2 border-transparent"}`}>DOM Nodes</button>
                  <button onClick={() => setEvidenceTab("SCREENSHOTS")} className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono transition-colors ${evidenceTab === "SCREENSHOTS" ? "bg-[#21262D] text-white border-l-2 border-[#58A6FF]" : "text-[#8B949E] hover:bg-[#21262D]/50 border-l-2 border-transparent"}`}>Screenshots</button>
                </div>
              )}
            </div>

            {/* View: Trace */}
            <div>
              <button 
                onClick={() => setAuditorView("TRACE")}
                className={`w-full text-left px-2 py-1.5 rounded text-xs font-semibold flex items-center justify-between ${auditorView === "TRACE" ? "bg-[#1F6FEB]/10 text-[#58A6FF]" : "text-[#C9D1D9] hover:bg-[#21262D]"}`}
              >
                <span>EXECUTION TRACE</span>
                <span className="text-[10px] bg-[#30363D] px-1.5 rounded">{scan?.audit_logs?.length || 0}</span>
              </button>
            </div>

          </nav>
        </aside>

        {/* RIGHT AREA (Investigation Canvas) */}
        <div className="flex-1 overflow-y-auto bg-[#0D1117] p-8">
          
          {/* FINDINGS WORKSPACE */}
          {auditorView === "FINDINGS" && selectedFinding && (
            <div className="max-w-3xl space-y-12">
              
              {/* Finding Header */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${selectedFinding.confidence_tier === "HIGH" ? "bg-[#F85149]/10 text-[#FF7B72] border-[#F85149]/30" : "bg-[#D29922]/10 text-[#E3B341] border-[#D29922]/30"}`}>
                    {selectedFinding.confidence_tier} CONFIDENCE
                  </span>
                  <span className="text-[10px] font-mono text-[#8B949E]">{selectedFinding.pattern}</span>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{selectedFinding.title}</h2>
              </div>

              {/* Observation */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider border-b border-[#30363D] pb-2">Observation</h3>
                <div className="text-sm text-[#C9D1D9] leading-relaxed">
                  {selectedFinding.explanation}
                </div>
              </div>

              {/* Visual Evidence Anchor */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider border-b border-[#30363D] pb-2">Evidence</h3>
                
                {/* Try to show screenshot if relevant stage can be deduced, else fallback to text/DOM */}
                <div className="bg-[#161B22] border border-[#30363D] rounded p-4 space-y-4">
                  {/* Text/DOM snippet as evidence */}
                  {(selectedFinding.text_snippets.length > 0 || selectedFinding.dom_evidence?.length) ? (
                    <div className="space-y-2">
                      {selectedFinding.text_snippets.map((snip, idx) => (
                        <div key={idx} className="p-3 bg-[#0D1117] border border-[#30363D] rounded text-xs font-mono text-[#58A6FF] break-words">
                          "{snip}"
                        </div>
                      ))}
                      {selectedFinding.dom_evidence?.map((dom, idx) => (
                        <div key={`dom-${idx}`} className="p-3 bg-[#0D1117] border border-[#30363D] rounded text-xs font-mono text-[#58A6FF] break-words">
                          "{dom.text_content}"
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-[#8B949E]">No specific text/DOM snippet extracted for this finding.</div>
                  )}
                  
                  {/* Mention screenshots */}
                  <div className="flex items-center gap-2 text-xs text-[#8B949E] mt-2">
                    <MousePointer2 className="w-3.5 h-3.5" />
                    <span>View full viewport captures in the Evidence File.</span>
                  </div>
                </div>
              </div>

              {/* Remediation */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider border-b border-[#30363D] pb-2">Remediation</h3>
                <div className="text-sm text-[#C9D1D9] leading-relaxed">
                  {selectedFinding.remediation_hint || selectedFinding.consumer_advice}
                </div>
              </div>

              {/* Technical Details (Expandable) */}
              <div className="pt-8">
                <button 
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  className="flex items-center gap-2 text-xs font-mono text-[#58A6FF] hover:text-[#79C0FF] transition-colors"
                >
                  {showTechDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  TECHNICAL DETAILS
                </button>
                
                {showTechDetails && (
                  <div className="mt-4 p-4 bg-[#161B22] border border-[#30363D] rounded space-y-4 text-xs font-mono">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-[#8B949E]">RULE ID</div>
                      <div className="col-span-2 text-white">{selectedFinding.rule_ids?.join(", ")}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-[#8B949E]">CCPA REF</div>
                      <div className="col-span-2 text-white">{selectedFinding.ccpa_regulation}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-[#8B949E]">CONFIDENCE SCORE</div>
                      <div className="col-span-2 text-white">{selectedFinding.confidence}</div>
                    </div>
                    
                    {selectedFinding.dom_evidence && selectedFinding.dom_evidence.length > 0 && (
                      <div className="pt-4 border-t border-[#30363D]">
                        <div className="text-[#8B949E] mb-2">RAW DOM SELECTORS</div>
                        {selectedFinding.dom_evidence.map((dom, i) => (
                          <div key={i} className="text-[#79C0FF] break-all">{dom.selector}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
          {auditorView === "FINDINGS" && !selectedFinding && (
             <div className="text-sm font-mono text-[#8B949E]">Select a finding from the left rail to view details.</div>
          )}

          {/* EVIDENCE WORKSPACE */}
          {auditorView === "EVIDENCE" && (
            <div className="max-w-4xl space-y-8">
              
              {evidenceTab === "JOURNEY" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Price Reconciliation Ledger</h2>
                  <div className="border border-[#30363D] rounded overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#161B22] text-[#8B949E] border-b border-[#30363D]">
                        <tr>
                          <th className="py-2.5 px-4 font-normal">STAGE</th>
                          <th className="py-2.5 px-4 font-normal">AMOUNT</th>
                          <th className="py-2.5 px-4 font-normal">SOURCE</th>
                          <th className="py-2.5 px-4 font-normal">DELTA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#30363D]">
                        {stages.map((st, i) => {
                          const p0 = journey?.initial_price;
                          const delta = (i > 0 && st.total && p0) ? st.total - p0 : null;
                          return (
                            <tr key={i} className="bg-[#0D1117]">
                              <td className="py-3 px-4 font-bold text-white uppercase">{st.stage_label}</td>
                              <td className="py-3 px-4">{st.total !== null && st.total !== undefined ? `₹${st.total.toLocaleString()}` : "NULL"}</td>
                              <td className="py-3 px-4 text-[#79C0FF]">{st.extraction_source || "SEMANTIC_DOM"}</td>
                              <td className={`py-3 px-4 ${delta && delta > 0 ? 'text-[#FF7B72]' : 'text-[#8B949E]'}`}>
                                {i === 0 ? "BASELINE" : (delta && delta > 0 ? `+₹${delta.toLocaleString()}` : "N/A")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {evidenceTab === "DOM" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Extracted DOM Evidence</h2>
                  <div className="space-y-4">
                    {findings.flatMap(f => f.dom_evidence?.map(dom => ({ ...dom, finding: f.pattern })) || []).map((dom, i) => (
                      <div key={i} className="border border-[#30363D] bg-[#161B22] rounded p-4 text-xs font-mono space-y-3">
                        <div className="flex items-center justify-between border-b border-[#30363D] pb-2 text-[#8B949E]">
                          <span>&lt;{dom.tag}&gt;</span>
                          <span className="text-[#E3B341]">LINKED: {dom.finding}</span>
                        </div>
                        <div>
                          <div className="text-[#8B949E] mb-1">SELECTOR</div>
                          <div className="text-[#79C0FF] break-all">{dom.selector}</div>
                        </div>
                        <div>
                          <div className="text-[#8B949E] mb-1">CONTENT</div>
                          <div className="text-white break-words">"{dom.text_content}"</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {evidenceTab === "SCREENSHOTS" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Viewport Captures</h2>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {stages.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedStageIdx(idx)}
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors uppercase ${
                          selectedStageIdx === idx
                            ? "bg-[#21262D] text-white border border-[#8B949E]"
                            : "bg-[#161B22] text-[#8B949E] border border-[#30363D] hover:bg-[#21262D]"
                        }`}
                      >
                        {s.stage_label}
                      </button>
                    ))}
                  </div>

                  {stages[selectedStageIdx]?.screenshot_b64 || scan?.screenshot_base64 ? (
                    <div className="border border-[#30363D] rounded overflow-hidden">
                      <img
                        src={stages[selectedStageIdx]?.screenshot_b64 || scan?.screenshot_base64}
                        alt="Viewport snapshot"
                        className="w-full object-contain max-h-[800px]"
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs font-mono text-[#8B949E] border border-[#30363D] rounded">
                      No visual snapshot captured for this stage.
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* TRACE WORKSPACE */}
          {auditorView === "TRACE" && (
            <div className="max-w-4xl space-y-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Playwright Execution Trace</h2>
              <div className="bg-[#161B22] border border-[#30363D] rounded font-mono text-xs overflow-hidden">
                <div className="p-4 space-y-3">
                  {scan?.audit_logs?.map((l, i) => (
                    <div key={i} className="flex items-start gap-4 hover:bg-[#21262D] px-2 py-1 -mx-2 rounded transition-colors">
                      <span className="text-[#8B949E] w-20 flex-shrink-0">{l.timestamp.split('T')[1]?.substring(0,8) || l.timestamp}</span>
                      <span className="text-[#79C0FF] font-bold w-24 flex-shrink-0">[{l.stage}]</span>
                      <span className="text-[#C9D1D9]">{l.message}</span>
                    </div>
                  ))}
                  {(!scan?.audit_logs || scan.audit_logs.length === 0) && (
                    <div className="text-[#8B949E]">No execution trace logs available.</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
