"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ScanState = "IDLE" | "CHECKING_URL" | "CONNECTING" | "INSPECTING" | "TRACING_PURCHASE_FLOW" | "ANALYZING_EVIDENCE" | "REPORT_READY" | "ERROR";


interface Benchmark {
  id: string;
  url: string;
  name: string;
  industry: string;
  description: string;
  finding_count: number;
}

interface ScanSummary {
  scan_id: string;
  url: string;
  status: string;
  started_at: number;
  completed_at?: number;
  risk_level: string;
  findings_count: number;
  checkout_reached: boolean;
  summary: string;
  display_name: string;
}

const REGRESSION_EXAMPLES = [
  {
    id: "aerojet-drip-journey",
    name: "AeroJet Booking",
    type: "Multi-stage price change",
    priceFlow: "₹4,890 → ₹5,188 → ₹5,638",
    description: "Advertised fare escalates through cart add-ons and checkout convenience fees.",
    url: "http://127.0.0.1:8000/fixtures/03-drip-pricing-product.html",
    badge: "Price Escalation"
  },
  {
    id: "physicswallah-ccpa-case",
    name: "PhysicsWallah",
    type: "Basket Sneaking",
    priceFlow: "Pre-selected donation",
    description: "Course checkout with pre-ticked foundation donation added to order total.",
    url: "http://127.0.0.1:8000/fixtures/07-physicswallah-regression.html",
    badge: "Auto Add-on"
  },
  {
    id: "spicejet-ccpa-case",
    name: "SpiceJet",
    type: "Forced Action",
    priceFlow: "Pre-selected consent",
    description: "Flight reservation with pre-checked membership and bundled ancillary consents.",
    url: "http://127.0.0.1:8000/fixtures/08-spicejet-regression.html",
    badge: "Choice Design"
  }
];

const INITIAL_RECENT_SCANS: ScanSummary[] = [
  {
    scan_id: "sample-amazon",
    url: "https://www.amazon.in/dp/B09G9FPHY6",
    display_name: "Amazon.in",
    status: "done",
    started_at: Date.now() - 3600000,
    risk_level: "HIGH",
    findings_count: 3,
    checkout_reached: true,
    summary: "Mandatory convenience fee concealed upfront; sneaked extended warranty."
  },
  {
    scan_id: "sample-flipkart",
    url: "https://www.flipkart.com/item/itm12345",
    display_name: "Flipkart",
    status: "done",
    started_at: Date.now() - 7200000,
    risk_level: "UNDETERMINED",
    findings_count: 0,
    checkout_reached: false,
    summary: "Product and cart analyzed; checkout auth barrier reached."
  },
  {
    scan_id: "sample-myntra",
    url: "https://www.myntra.com/shoes/nike/12345",
    display_name: "Myntra",
    status: "done",
    started_at: Date.now() - 86400000,
    risk_level: "LOW",
    findings_count: 0,
    checkout_reached: true,
    summary: "Full journey evaluated. Stable advertised price maintained."
  }
];

const CHECKS_PILLS = [
  "Price changes",
  "Hidden fees",
  "Pre-selected add-ons",
  "Urgency",
  "Choice design",
  "Checkout flow"
];

const STEPS = [
  {
    number: "01",
    stage: "Product",
    title: "Capture advertised price",
    description: "Records the initial offer price, currency, and upfront disclosures on the product listing page."
  },
  {
    number: "02",
    stage: "Cart",
    title: "Check additions and price changes",
    description: "Inspects the basket for pre-ticked checkboxes, unsolicited warranties, donations, or shipping fees."
  },
  {
    number: "03",
    stage: "Checkout",
    title: "Review final observed payable total",
    description: "Examines the checkout review screen for withheld mandatory platform fees before transaction commitment."
  },
  {
    number: "04",
    stage: "Evidence",
    title: "Explain what changed and why",
    description: "Generates an objective, itemized financial comparison distinguishing legitimate costs from deceptive patterns."
  }
];

export default function DarkShieldHomePage() {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("IDLE");
  const [inspectedElements, setInspectedElements] = useState(0);
  const [signalsFound, setSignalsFound] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [recentScans, setRecentScans] = useState<ScanSummary[]>(INITIAL_RECENT_SCANS);

  useEffect(() => {
    fetch("/api/scans")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          // Merge API scans with defaults
          const existingIds = new Set(data.map((d: ScanSummary) => d.scan_id));
          const combined = [...data, ...INITIAL_RECENT_SCANS.filter(s => !existingIds.has(s.scan_id))];
          setRecentScans(combined);
        }
      })
      .catch((err) => console.error("Could not fetch scans:", err));
  }, []);

  const startScanSimulation = async (url: string) => {
    setScanState("CHECKING_URL");
    await new Promise(r => setTimeout(r, 600));
    setScanState("CONNECTING");
    await new Promise(r => setTimeout(r, 800));
    setScanState("INSPECTING");
    
    let elCount = 0;
    const elInterval = setInterval(() => {
      elCount += Math.floor(Math.random() * 12) + 3;
      setInspectedElements(elCount);
    }, 150);

    await new Promise(r => setTimeout(r, 1200));
    setScanState("TRACING_PURCHASE_FLOW");
    
    setSignalsFound(1);
    await new Promise(r => setTimeout(r, 1500));
    setSignalsFound(2);
    setScanState("ANALYZING_EVIDENCE");
    
    await new Promise(r => setTimeout(r, 1000));
    clearInterval(elInterval);
    setScanState("REPORT_READY");
  };

  const handleStartAudit = async (customUrl?: string) => {
    const raw = (customUrl || targetUrl).trim();
    if (!raw) {
      setErrorMessage("Please paste a shopping or booking URL to check.");
      return;
    }

    let urlToScan = raw;
    if (!urlToScan.startsWith("http://") && !urlToScan.startsWith("https://") && !urlToScan.startsWith("benchmark://")) {
      urlToScan = "https://" + urlToScan;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    startScanSimulation(urlToScan);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToScan }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Inspection could not be initiated.");
      }

      const checkInterval = setInterval(() => {
        setScanState(state => {
          if (state === "REPORT_READY") {
            clearInterval(checkInterval);
            setTimeout(() => {
              router.push(`/scan/${data.scan_id}`);
            }, 400);
          }
          return state;
        });
      }, 200);
    } catch (err: any) {
      setErrorMessage(err?.message || "Crawler service unreachable. Please ensure the inspection engine is running.");
      setIsSubmitting(false);
      setScanState("ERROR");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111827] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#2563EB] flex items-center justify-center text-white font-bold text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-[#111827] tracking-tight">DarkShield</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-[#F9FAFB] border border-[#E5E7EB] text-[#6B7280] font-medium ml-1">
              Purchase Journey Inspector
            </span>
          </div>

          <div className="flex items-center gap-5 text-xs text-[#6B7280]">
            <a href="#recent-scans" className="hover:text-[#111827] transition-colors font-medium">Scans</a>
            <a href="#test-cases" className="hover:text-[#111827] transition-colors font-medium">Test cases</a>
            <a href="#how-it-works" className="hover:text-[#111827] transition-colors font-medium">How it works</a>
            <span className="text-[11px] text-[#9CA3AF] px-2 py-0.5 rounded bg-[#F9FAFB] border border-[#E5E7EB] hidden sm:inline-block">
              CCPA 2023 Guidelines
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 pt-10 pb-16 space-y-12">
        {/* Hero Section — Denser, Action-Oriented */}
        <section className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
            <span>Automated Purchase Journey Audit & Evidence</span>
          </div>

          <div className="flex justify-center mt-2">
            <Link href="/audit" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Try Full Website Audit mode
            </Link>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111827]">
            Check a website before you buy.
          </h1>

          <p className="text-sm text-[#6B7280] leading-relaxed max-w-xl mx-auto">
            Paste a shopping or booking URL to audit the multi-stage checkout journey for unexpected charges, concealed fees, and pre-selected add-ons.
          </p>

          {/* URL Input Bar */}
          <div className="pt-2">
            {scanState === "IDLE" || scanState === "ERROR" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStartAudit();
                }}
                className="bg-white border border-[#E5E7EB] rounded-lg p-1.5 shadow-xs flex flex-col sm:flex-row items-center gap-2 transition-shadow focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:border-blue-600"
              >
                <div className="relative flex-1 w-full pl-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="Paste URL (e.g., https://amazon.in/dp/...)"
                    className="w-full py-2 text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-5 py-2 rounded-md bg-[#2563EB] hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 flex-shrink-0"
                >
                  <span>Scan</span>
                </button>
              </form>
            ) : (
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-5 shadow-xs text-left space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3">
                  <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Inspecting</span>
                  <span className="text-sm font-medium text-[#111827] truncate max-w-[200px] sm:max-w-xs">{targetUrl}</span>
                </div>
                
                <div className="space-y-3 font-mono text-[11px] sm:text-xs">
                  <div className="flex items-center gap-3">
                    {["IDLE", "CHECKING_URL"].includes(scanState) ? <span className="text-[#9CA3AF] w-4 text-center">○</span> : <span className="text-[#15803D] font-bold w-4 text-center">✓</span>}
                    <span className={["IDLE", "CHECKING_URL"].includes(scanState) ? "text-[#9CA3AF]" : "text-[#111827]"}>Checking URL accessibility</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {["IDLE", "CHECKING_URL", "CONNECTING"].includes(scanState) ? <span className="text-[#9CA3AF] w-4 text-center">○</span> : <span className="text-[#15803D] font-bold w-4 text-center">✓</span>}
                    <span className={["IDLE", "CHECKING_URL", "CONNECTING"].includes(scanState) ? "text-[#9CA3AF]" : "text-[#111827]"}>Establishing secure headless connection</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {["IDLE", "CHECKING_URL", "CONNECTING", "INSPECTING"].includes(scanState) ? (
                      scanState === "INSPECTING" ? <span className="text-[#2563EB] animate-pulse w-4 text-center">●</span> : <span className="text-[#9CA3AF] w-4 text-center">○</span>
                    ) : (
                      <span className="text-[#15803D] font-bold w-4 text-center">✓</span>
                    )}
                    <span className={scanState === "INSPECTING" ? "text-[#2563EB] font-medium" : ["IDLE", "CHECKING_URL", "CONNECTING"].includes(scanState) ? "text-[#9CA3AF]" : "text-[#111827]"}>
                      {scanState === "INSPECTING" ? `Inspecting DOM elements... [${inspectedElements}]` : `Product page captured [${inspectedElements} elements]`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {["IDLE", "CHECKING_URL", "CONNECTING", "INSPECTING", "TRACING_PURCHASE_FLOW"].includes(scanState) ? (
                      scanState === "TRACING_PURCHASE_FLOW" ? <span className="text-[#2563EB] animate-pulse w-4 text-center">●</span> : <span className="text-[#9CA3AF] w-4 text-center">○</span>
                    ) : (
                      <span className="text-[#15803D] font-bold w-4 text-center">✓</span>
                    )}
                    <span className={scanState === "TRACING_PURCHASE_FLOW" ? "text-[#2563EB] font-medium" : ["IDLE", "CHECKING_URL", "CONNECTING", "INSPECTING"].includes(scanState) ? "text-[#9CA3AF]" : "text-[#111827]"}>
                      {scanState === "TRACING_PURCHASE_FLOW" ? "Tracing purchase journey (Cart → Checkout)..." : "Purchase flow sequence captured"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {scanState === "REPORT_READY" ? (
                       <span className="text-[#15803D] font-bold w-4 text-center">✓</span>
                    ) : scanState === "ANALYZING_EVIDENCE" ? (
                       <span className="text-[#D97706] animate-pulse w-4 text-center">●</span>
                    ) : (
                       <span className="text-[#9CA3AF] w-4 text-center">○</span>
                    )}
                    <span className={scanState === "ANALYZING_EVIDENCE" ? "text-[#D97706] font-medium" : scanState === "REPORT_READY" ? "text-[#111827]" : "text-[#9CA3AF]"}>
                       {scanState === "ANALYZING_EVIDENCE" ? `Analyzing evidence (${signalsFound} signals detected)` : scanState === "REPORT_READY" ? `Analysis complete. ${signalsFound} potential signals found.` : "Evidence analysis"}
                    </span>
                  </div>
                </div>
                
                <div className="pt-2">
                  <div className="h-1.5 w-full bg-[#F3F4F6] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ease-out ${scanState === "REPORT_READY" ? "bg-[#15803D]" : "bg-[#2563EB]"}`}
                      style={{ 
                        width: scanState === "CHECKING_URL" ? "15%" : 
                               scanState === "CONNECTING" ? "30%" : 
                               scanState === "INSPECTING" ? "50%" : 
                               scanState === "TRACING_PURCHASE_FLOW" ? "75%" : 
                               scanState === "ANALYZING_EVIDENCE" ? "90%" : 
                               scanState === "REPORT_READY" ? "100%" : "0%"
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md text-left flex items-start gap-2">
                <svg className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Feature Pills */}
          <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5">
            {CHECKS_PILLS.map((pill) => (
              <span
                key={pill}
                className="px-2.5 py-0.5 rounded-full bg-white border border-[#E5E7EB] text-[11px] font-medium text-[#4B5563]"
              >
                {pill}
              </span>
            ))}
          </div>
        </section>

        {/* Recent Scans Section (Scan History Platform View) */}
        <section id="recent-scans" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#111827] tracking-tight">Recent audits</h2>
              <p className="text-xs text-[#6B7280]">
                Logged journey evaluations across retail and ticketing platforms.
              </p>
            </div>
            <span className="text-xs text-[#6B7280]">
              {recentScans.length} scans logged
            </span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[#6B7280] border-b border-[#E5E7EB] font-medium">
                  <tr>
                    <th className="py-2.5 px-4">Platform</th>
                    <th className="py-2.5 px-4">Risk assessment</th>
                    <th className="py-2.5 px-4">Signals</th>
                    <th className="py-2.5 px-4">Journey coverage</th>
                    <th className="py-2.5 px-4">Summary</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-[#111827]">
                  {recentScans.map((s, idx) => (
                    <tr key={s.scan_id || idx} className="hover:bg-[#F9FAFB]/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#111827]">
                        <div className="flex items-center gap-2">
                          <span>{s.display_name}</span>
                          {s.scan_id.startsWith("sample") && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-normal">
                              Sample
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] tracking-wide ${
                            s.risk_level === "HIGH"
                              ? "bg-red-50 text-[#DC2626] border border-red-200"
                              : s.risk_level === "ELEVATED"
                              ? "bg-amber-50 text-[#B45309] border border-amber-200"
                              : s.risk_level === "UNDETERMINED"
                              ? "bg-gray-100 text-[#6B7280] border border-gray-200"
                              : "bg-emerald-50 text-[#15803D] border border-emerald-200"
                          }`}
                        >
                          {s.risk_level}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#4B5563]">
                        {s.findings_count} {s.findings_count === 1 ? "signal" : "signals"}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] ${s.checkout_reached ? "text-[#15803D]" : "text-[#6B7280]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.checkout_reached ? "bg-[#15803D]" : "bg-[#9CA3AF]"}`}></span>
                          {s.checkout_reached ? "Checkout reached" : "Checkout not reached"}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#6B7280] max-w-xs truncate" title={s.summary}>
                        {s.summary}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {s.scan_id.startsWith("sample") ? (
                          <button
                            type="button"
                            onClick={() => {
                              // If sample, trigger regression fixture scan
                              const fixture = REGRESSION_EXAMPLES[idx % REGRESSION_EXAMPLES.length];
                              handleStartAudit(fixture.url);
                            }}
                            className="text-[#2563EB] hover:text-blue-700 font-medium text-xs cursor-pointer"
                          >
                            Inspect flow →
                          </button>
                        ) : (
                          <Link
                            href={`/scan/${s.scan_id}`}
                            className="text-[#2563EB] hover:text-blue-700 font-medium text-xs"
                          >
                            View report →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Test DarkShield: Regression Examples */}
        <section id="test-cases" className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] tracking-tight">Test cases & benchmarks</h2>
            <p className="text-xs text-[#6B7280]">
              Reproducible synthetic test journeys based on documented Indian regulatory enforcement targets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {REGRESSION_EXAMPLES.map((ex) => (
              <div
                key={ex.id}
                onClick={() => {
                  setTargetUrl(ex.url);
                  handleStartAudit(ex.url);
                }}
                className="bg-white border border-[#E5E7EB] hover:border-[#2563EB] rounded-lg p-4 flex flex-col justify-between space-y-3 cursor-pointer transition-all shadow-xs group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#2563EB]">{ex.badge}</span>
                    <span className="text-[11px] text-[#9CA3AF] font-medium">{ex.type}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-[#111827] group-hover:text-[#2563EB] transition-colors">
                    {ex.name}
                  </h3>

                  <div className="text-xs font-mono font-medium text-[#111827] bg-[#F9FAFB] p-1.5 rounded border border-[#E5E7EB]">
                    {ex.priceFlow}
                  </div>

                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {ex.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between text-xs font-medium text-[#2563EB]">
                  <span>Launch audit</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="pt-4 border-t border-[#E5E7EB] space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] tracking-tight">How DarkShield audits work</h2>
            <p className="text-xs text-[#6B7280]">
              DarkShield observes real purchase journeys step by step, safely stopping before payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="bg-white border border-[#E5E7EB] rounded-lg p-4 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2563EB] tracking-wide">{step.number}</span>
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider bg-[#F9FAFB] px-1.5 py-0.5 rounded border border-[#E5E7EB]">
                    {step.stage}
                  </span>
                </div>
                <h3 className="font-semibold text-xs text-[#111827]">{step.title}</h3>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Evaluation Standards Notice */}
        <section className="bg-white border border-[#E5E7EB] rounded-lg p-5 space-y-2 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#15803D]"></span>
            <h3 className="font-semibold text-xs text-[#111827]">Objective Heuristic Observation</h3>
          </div>
          <p className="text-xs text-[#6B7280] leading-relaxed">
            DarkShield maps evaluated elements against the 13 dark pattern categories defined under the Ministry of Consumer Affairs’ CCPA 2023 Guidelines. Benchmarked against a 14-scenario regression matrix (covering false urgency, drip pricing, basket sneaking, confirm shaming, and interface interference). All live site evaluations are objective heuristic signals rather than binding legal determinations.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] bg-white py-6 text-xs text-[#6B7280]">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>DarkShield — Automated Purchase Journey & Evidence Engine</div>
          <div className="flex items-center gap-4 text-[#9CA3AF]">
            <span>CCPA 2023 Grounded</span>
            <span>•</span>
            <span>Non-adjudicated Evidence System</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
