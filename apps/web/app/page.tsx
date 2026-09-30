"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Benchmark {
  id: string;
  url: string;
  name: string;
  industry: string;
  description: string;
  finding_count: number;
}

const CCPA_RULES = [
  { sec: "5.1", name: "False Urgency", desc: "Artificial time pressure or resetting countdown timers without real-time inventory backing.", risk: "High", layer: "DOM & NLP" },
  { sec: "5.2", name: "Basket Sneaking", desc: "Pre-ticked optional add-ons, warranties, insurance, or donations added automatically.", risk: "Critical", layer: "State Diff" },
  { sec: "5.3", name: "Confirm Shaming", desc: "Phrasing decline options to induce guilt, shame, or consumer anxiety.", risk: "Medium", layer: "NLP Sentiment" },
  { sec: "5.4", name: "Forced Action", desc: "Mandating unnecessary downloads, registrations, or permissions to proceed.", risk: "Critical", layer: "Graph Flow" },
  { sec: "5.5", name: "Subscription Trap", desc: "Concealing recurring charges or imposing complex cancellation hurdles.", risk: "Critical", layer: "State Graph" },
  { sec: "5.6", name: "Interface Interference", desc: "Visual asymmetry favoring seller options while obscuring consumer alternatives.", risk: "High", layer: "CSS Geometry" },
  { sec: "5.7", name: "Drip Pricing", desc: "Concealing mandatory fees until final checkout step rather than early disclosure.", risk: "Critical", layer: "Price Journey" },
  { sec: "5.8", name: "Trick Wording", desc: "Employing double negatives or confusing grammar to mislead consent choices.", risk: "High", layer: "NLP Grammar" },
  { sec: "5.9", name: "Nagging", desc: "Persistent interruptions demanding assent despite previous rejections.", risk: "Medium", layer: "Event Loop" },
  { sec: "5.10", name: "Bait and Switch", desc: "Advertising a specific price or term but switching product at purchase.", risk: "Critical", layer: "Entity Match" },
  { sec: "5.11", name: "Disguised Ads", desc: "Masking paid promotions or sponsored links as organic content.", risk: "Medium", layer: "DOM Rules" },
  { sec: "5.12", name: "SaaS Billing", desc: "Recurring billing cycles lacking pre-debit notices or simple opt-outs.", risk: "High", layer: "Billing Graph" },
  { sec: "5.13", name: "Rogue Malware", desc: "Scareware tactics or fake security alerts compelling unnecessary purchases.", risk: "Critical", layer: "Browser Sandbox" },
];

export default function DarkShieldHomePage() {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);

  useEffect(() => {
    fetch("/api/benchmarks")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBenchmarks(data);
      })
      .catch((err) => console.error("Could not fetch benchmarks:", err));
  }, []);

  const handleStartAudit = async (customUrl?: string) => {
    const raw = (customUrl || targetUrl).trim();
    if (!raw) {
      setErrorMessage("Enter a valid URL to begin inspection.");
      return;
    }

    let urlToScan = raw;
    if (!urlToScan.startsWith("http://") && !urlToScan.startsWith("https://") && !urlToScan.startsWith("benchmark://")) {
      urlToScan = "https://" + urlToScan;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToScan }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Audit execution rejected by engine.");
      }

      router.push(`/scan/${data.scan_id}`);
    } catch (err: any) {
      setErrorMessage(err?.message || "Crawler backend unreachable.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-200 font-sans selection:bg-blue-600/30">
      {/* Top Header */}
      <header className="border-b border-slate-800/90 bg-[#0d131f] px-6 py-3.5 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono font-bold text-sm">
              🛡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white tracking-wide">DARKSHIELD</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold">
                  CCPA 2023 INSPECTOR
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Multi-Stage E-Commerce Purchase Journey & Evidence-First Deceptive Design Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>PLAYWRIGHT CHROMIUM V1243</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-300 hidden sm:inline-block">
              PORT 8000 LIVE
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-400">
              13 CCPA CLAUSES
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Inspection Input Panel */}
        <section className="p-7 rounded-xl bg-[#0e1422] border border-slate-800/90 shadow-xl space-y-5">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Evidence-First Dark Pattern & Purchase Journey Inspector
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Automates multi-page purchase flows (Product Listing → Add to Cart → Cart Review → Checkout Total) to capture late-stage drip pricing, auto-checked add-ons, and manipulative interface interference under India's CCPA 2023 Guidelines.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartAudit();
            }}
            className="flex flex-col sm:flex-row gap-2.5 max-w-4xl"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Enter URL to audit (e.g. https://www.amazon.in, https://flipkart.com, or test fixture)"
                className="w-full bg-[#090d16] border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs tracking-wider font-mono flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer flex-shrink-0 shadow-md"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>INSPECTING JOURNEY...</span>
                </>
              ) : (
                <span>LAUNCH AUDIT</span>
              )}
            </button>
          </form>

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-900 text-red-300 text-xs font-mono rounded-lg">
              {errorMessage}
            </div>
          )}
        </section>

        {/* Official Ground-Truth & Enforcement Regression Benchmarks */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
                Calibrated Test Suites: Ground-Truth & Regulatory Enforcement Targets
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Standardized regression targets spanning multi-stage booking flows, documented CCPA enforcement actions, and clean controls.
              </p>
            </div>
            <span className="text-[11px] font-mono text-blue-400 font-semibold">
              PRESET REPRODUCIBLE CASES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {benchmarks.map((b) => (
              <div
                key={b.id}
                onClick={() => {
                  setTargetUrl(b.url);
                  handleStartAudit(b.url);
                }}
                className="p-5 rounded-xl bg-[#0e1422] border border-slate-800/90 hover:border-blue-500/50 hover:bg-[#12192b] transition-all cursor-pointer flex flex-col justify-between group space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span className="text-blue-400 font-bold">[{b.industry}]</span>
                    <span>{b.finding_count} Expected Signals</span>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                    {b.name}
                  </h3>

                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {b.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span className="truncate max-w-[200px]">{b.url}</span>
                  <span className="text-blue-400 font-bold group-hover:translate-x-0.5 transition-transform">
                    Run Audit →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Multi-Stage Purchase Journey Architecture */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
              DarkShield Architecture: Multi-Stage Purchase Pipeline
            </h2>
            <span className="text-[11px] font-mono text-slate-400">PURCHASE LIFECYCLE</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-[#0e1422] border border-slate-800 space-y-2">
              <div className="text-blue-400 font-mono text-[11px] font-bold">STAGE 1 // PRODUCT</div>
              <div className="font-semibold text-slate-100 text-xs">Initial Listing Capture (P0)</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Extracts advertised price, currency, discount claims, and checks for ungrounded scarcity counters.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0e1422] border border-slate-800 space-y-2">
              <div className="text-purple-400 font-mono text-[11px] font-bold">STAGE 2 // SAFE ACTION</div>
              <div className="font-semibold text-slate-100 text-xs">Add to Cart Navigation</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Executes safe action policy on "Add to Cart" / "Add to Bag", safely blocking payment buttons while transitioning states.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0e1422] border border-slate-800 space-y-2">
              <div className="text-cyan-400 font-mono text-[11px] font-bold">STAGE 3 // CART REVIEW</div>
              <div className="font-semibold text-slate-100 text-xs">Basket Add-on Audit (P1)</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Inspects cart DOM for pre-ticked insurance, carbon donations, and early shipping surcharges.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0e1422] border border-slate-800 space-y-2">
              <div className="text-rose-400 font-mono text-[11px] font-bold">STAGE 4 // CHECKOUT</div>
              <div className="font-semibold text-slate-100 text-xs">Final Observed Payable (P2)</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Captures late convenience fees, computes total price delta ($\Delta$), and verifies CCPA Section 5(7) compliance.
              </p>
            </div>
          </div>
        </section>

        {/* 13 CCPA Pattern Registry Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
              India CCPA 2023 Guidelines — Evaluated Pattern Matrix
            </h2>
            <span className="text-[11px] font-mono text-slate-400">13 STATUTORY CATEGORIES</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CCPA_RULES.map((r) => (
              <div key={r.sec} className="p-4 rounded-xl bg-[#0e1422] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-blue-400 font-bold">CCPA § {r.sec}</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      r.risk === "Critical"
                        ? "bg-rose-950 border border-rose-800 text-rose-300"
                        : r.risk === "High"
                        ? "bg-amber-950 border border-amber-800 text-amber-300"
                        : "bg-slate-800 border border-slate-700 text-slate-300"
                    }`}
                  >
                    {r.risk}
                  </span>
                </div>
                <div className="font-bold text-white text-xs">{r.name}</div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{r.desc}</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Engine: {r.layer}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
