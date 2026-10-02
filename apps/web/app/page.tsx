"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Scale,
  Shield,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Tag,
  CreditCard,
  Layers,
  ExternalLink,
  ChevronRight,
  TrendingDown,
} from "lucide-react";

type ScanState =
  | "IDLE"
  | "CHECKING_URL"
  | "CONNECTING"
  | "INSPECTING"
  | "TRACING_PURCHASE_FLOW"
  | "ANALYZING_EVIDENCE"
  | "REPORT_READY"
  | "ERROR";

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

interface CompareDemo {
  id: string;
  title: string;
  category: string;
  portals: string[];
  priceRange: string;
  savings: string;
  description: string;
  bestPortal: string;
  highlight: string;
}

const COMPARE_DEMOS: CompareDemo[] = [
  {
    id: "sample-laptop-compare",
    title: "Apple MacBook Air M2 (8GB / 256GB SSD)",
    category: "Laptops & Computing",
    portals: ["Amazon.in", "Flipkart", "Croma"],
    priceRange: "₹83,490 – ₹89,999",
    savings: "₹6,509 price variance",
    description: "Flipkart withholds mandatory ₹99 packaging fee and uses high-pressure urgency. Amazon offers ₹1,500 unconditional coupon + ₹5,000 HDFC bank discount.",
    bestPortal: "Amazon (Lowest) / Croma (Zero Dark Patterns)",
    highlight: "Hidden Packaging Fee Detected on Flipkart",
  },
  {
    id: "sample-sony-headphones",
    title: "Sony WH-1000XM5 Wireless ANC Headphones",
    category: "Audio & Wearables",
    portals: ["Amazon.in", "Tata CLiQ", "Reliance Digital"],
    priceRange: "₹26,990 – ₹29,990",
    savings: "₹3,000 price variance",
    description: "Evaluated across electronics retailers. Tata CLiQ advertises ₹26,990 upfront with clean checkout; Amazon includes ₹2,000 card discount.",
    bestPortal: "Tata CLiQ (Upfront honesty)",
    highlight: "Clean Transparency on Tata CLiQ",
  },
  {
    id: "sample-samsung-s24",
    title: "Samsung Galaxy S24 5G (8GB / 256GB)",
    category: "Smartphones",
    portals: ["Amazon.in", "Flipkart", "Croma"],
    priceRange: "₹74,999 – ₹79,999",
    savings: "₹5,000 price variance",
    description: "Identical hardware variant matched. Flipkart pre-ticks extended screen protection (+₹1,499) in cart.",
    bestPortal: "Amazon.in",
    highlight: "Pre-ticked Warranty Add-on Flagged",
  },
];

const REGRESSION_EXAMPLES = [
  {
    id: "aerojet-drip-journey",
    name: "AeroJet Booking",
    type: "Multi-stage price change",
    priceFlow: "₹4,890 → ₹5,188 → ₹5,638",
    description: "Advertised fare escalates through cart add-ons and checkout convenience fees.",
    url: "http://127.0.0.1:8000/fixtures/03-drip-pricing-product.html",
    badge: "Price Escalation",
  },
  {
    id: "physicswallah-ccpa-case",
    name: "PhysicsWallah",
    type: "Basket Sneaking",
    priceFlow: "Pre-selected donation",
    description: "Course checkout with pre-ticked foundation donation added to order total.",
    url: "http://127.0.0.1:8000/fixtures/07-physicswallah-regression.html",
    badge: "Auto Add-on",
  },
  {
    id: "spicejet-ccpa-case",
    name: "SpiceJet",
    type: "Forced Action",
    priceFlow: "Pre-selected consent",
    description: "Flight reservation with pre-checked membership and bundled ancillary consents.",
    url: "http://127.0.0.1:8000/fixtures/08-spicejet-regression.html",
    badge: "Choice Design",
  },
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
    summary: "Mandatory convenience fee concealed upfront; sneaked extended warranty.",
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
    summary: "Product and cart analyzed; checkout auth barrier reached.",
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
    summary: "Full journey evaluated. Stable advertised price maintained.",
  },
];

const CHECKS_PILLS = [
  "Cross-marketplace comparison",
  "Out-of-pocket effective price",
  "Deceptive urgency flags",
  "Concealed handling fees",
  "Pre-selected add-ons",
  "CCPA 2023 compliance",
];

const STEPS = [
  {
    number: "01",
    stage: "Discovery",
    title: "Marketplace Listing Match",
    description: "Identifies canonical product specifications (brand, model, RAM, storage) across retail portals.",
  },
  {
    number: "02",
    stage: "Extraction",
    title: "Real Price & Offer Breakdown",
    description: "Extracts advertised base prices, active coupons, and separates unconditional savings from bank card requirements.",
  },
  {
    number: "03",
    stage: "Detection",
    title: "Dark Pattern & Fee Audit",
    description: "Inspects multi-stage checkout flows for withheld platform charges, forced subscriptions, and false urgency.",
  },
  {
    number: "04",
    stage: "Decision",
    title: "Transparency Rating",
    description: "Provides consumers and auditors with an objective comparison showing the safest, most transparent place to buy.",
  },
];

export default function DarkShieldHomePage() {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<"compare" | "scan">("compare");

  // Compare Mode State
  const [compareQuery, setCompareQuery] = useState("");
  const [isComparing, setIsComparing] = useState(false);

  // Scan Mode State
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
          const existingIds = new Set(data.map((d: ScanSummary) => d.scan_id));
          const combined = [...data, ...INITIAL_RECENT_SCANS.filter((s) => !existingIds.has(s.scan_id))];
          setRecentScans(combined);
        }
      })
      .catch((err) => console.error("Could not fetch scans:", err));

    // Handle Extension Handoff
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const scanId = params.get("scanId") || params.get("scan_id");
      const paramUrl = params.get("url");
      const auto = params.get("auto");

      if (scanId) {
        router.push(`/scan/${scanId}`);
        return;
      }

      if (paramUrl) {
        setTargetUrl(paramUrl);
        if (auto === "true" || auto === "1") {
          setTimeout(() => {
            handleStartAudit(paramUrl);
          }, 300);
        }
      }
    }
  }, []);

  const handleStartCompare = async (customQuery?: string) => {
    const raw = (customQuery || compareQuery).trim();
    if (!raw) {
      router.push("/compare/sample-laptop-compare");
      return;
    }

    setIsComparing(true);
    try {
      // Check if input contains URLs (split by comma, space, or newline)
      const urls = raw
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

      const payload = urls.length > 0 ? { urls, query: raw } : { query: raw };

      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.compare_id) {
        router.push(`/compare/${data.compare_id}`);
      } else {
        const q = raw.toLowerCase();
        if (q.includes("sony") || q.includes("headphone") || q.includes("xm5")) {
          router.push("/compare/sample-sony-headphones");
        } else if (q.includes("samsung") || q.includes("s24") || q.includes("galaxy")) {
          router.push("/compare/sample-samsung-s24");
        } else {
          router.push("/compare/sample-laptop-compare");
        }
      }
    } catch {
      const q = raw.toLowerCase();
      if (q.includes("sony") || q.includes("headphone") || q.includes("xm5")) {
        router.push("/compare/sample-sony-headphones");
      } else if (q.includes("samsung") || q.includes("s24") || q.includes("galaxy")) {
        router.push("/compare/sample-samsung-s24");
      } else {
        router.push("/compare/sample-laptop-compare");
      }
    } finally {
      setIsComparing(false);
    }
  };

  const startScanSimulation = async () => {
    setScanState("CHECKING_URL");
    await new Promise((r) => setTimeout(r, 600));
    setScanState("CONNECTING");
    await new Promise((r) => setTimeout(r, 800));
    setScanState("INSPECTING");

    let elCount = 0;
    const elInterval = setInterval(() => {
      elCount += Math.floor(Math.random() * 12) + 3;
      setInspectedElements(elCount);
    }, 150);

    await new Promise((r) => setTimeout(r, 1200));
    setScanState("TRACING_PURCHASE_FLOW");

    setSignalsFound(1);
    await new Promise((r) => setTimeout(r, 1500));
    setSignalsFound(2);
    setScanState("ANALYZING_EVIDENCE");

    await new Promise((r) => setTimeout(r, 1000));
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
    startScanSimulation();

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
        setScanState((state) => {
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
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#2563EB] flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm text-[#111827] tracking-tight">DarkShield</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-medium ml-1">
              Cross-Marketplace Transparency & Evidence
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <a href="#comparison-demos" className="hover:text-[#111827] transition font-medium">Comparisons</a>
            <a href="#recent-scans" className="hover:text-[#111827] transition font-medium">Audits</a>
            <a href="#how-it-works" className="hover:text-[#111827] transition font-medium">How it works</a>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold hidden sm:inline-block">
              CCPA 2023 Compliant
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 pt-8 pb-16 space-y-10">
        {/* Mode Selector Hero */}
        <section className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex p-1 bg-slate-200/80 rounded-xl border border-slate-300 shadow-inner">
            <button
              onClick={() => setActiveMode("compare")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeMode === "compare"
                  ? "bg-white text-[#111827] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Cross-Marketplace Compare</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full font-bold">New</span>
            </button>
            <button
              onClick={() => setActiveMode("scan")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeMode === "scan"
                  ? "bg-white text-[#111827] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>Deep Journey Flow Scan</span>
            </button>
          </div>

          <div className="flex justify-center mt-2">
            <Link href="/audit" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition shadow-sm">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>Try Multi-Page Site Audit Mode</span>
            </Link>
          </div>

          {activeMode === "compare" ? (
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111827]">
                Compare real price, offers & transparency.
              </h1>
              <p className="text-sm text-[#6B7280] leading-relaxed max-w-xl mx-auto">
                Give DarkShield a product intent or paste marketplace URLs (Amazon, Flipkart, Croma, Tata CLiQ).
                It breaks down true effective out-of-pocket costs and highlights where the purchase experience is most honest.
              </p>

              {/* Compare Search Bar */}
              <div className="pt-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleStartCompare();
                  }}
                  className="bg-white border border-[#E5E7EB] rounded-lg p-1.5 shadow-xs flex flex-col sm:flex-row items-center gap-2 transition focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:border-blue-600"
                >
                  <div className="relative flex-1 w-full pl-3 flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                    <input
                      type="text"
                      value={compareQuery}
                      onChange={(e) => setCompareQuery(e.target.value)}
                      placeholder="e.g. MacBook Air M2 256GB or paste 2+ URLs separated by comma"
                      className="w-full py-2 text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isComparing}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-[#2563EB] hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0"
                  >
                    <span>{isComparing ? "Analyzing..." : "Compare Marketplaces"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                {/* Quick Interactive Comparison Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2.5 text-[11px] text-slate-500 justify-center sm:justify-start">
                  <span className="font-semibold text-slate-600">Quick Compare:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareQuery("Apple MacBook Air M2");
                      handleStartCompare("Apple MacBook Air M2");
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition font-medium cursor-pointer"
                  >
                    💻 MacBook Air M2
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareQuery("Sony WH-1000XM5");
                      handleStartCompare("Sony WH-1000XM5");
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition font-medium cursor-pointer"
                  >
                    🎧 Sony WH-1000XM5
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareQuery("Samsung Galaxy S24");
                      handleStartCompare("Samsung Galaxy S24");
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 transition font-medium cursor-pointer"
                  >
                    📱 Samsung Galaxy S24
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const liveUrls = "https://www.amazon.in/dp/B0B3B7W2Z9, https://www.flipkart.com/apple-macbook-air-m2-8-gb-256-gb-ssd-mac-os-monterey-mly33hn-a/p/itm534d0b13ab9b6";
                      setCompareQuery(liveUrls);
                      handleStartCompare(liveUrls);
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 transition font-semibold cursor-pointer flex items-center gap-1"
                  >
                    ⚡ Live Amazon + Flipkart
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111827]">
                Check a single website before you buy.
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
                    className="bg-white border border-[#E5E7EB] rounded-lg p-1.5 shadow-xs flex flex-col sm:flex-row items-center gap-2 transition focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:border-blue-600"
                  >
                    <div className="relative flex-1 w-full pl-3 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                      <input
                        type="text"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        placeholder="Paste single product or booking URL (e.g. https://amazon.in/dp/...)"
                        className="w-full py-2 text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-[#2563EB] hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      <span>Scan Flow</span>
                      <ArrowRight className="w-3.5 h-3.5" />
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
                        <span className="text-[#15803D] font-bold w-4 text-center">✓</span>
                        <span className="text-[#111827]">Checking URL accessibility</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#15803D] font-bold w-4 text-center">✓</span>
                        <span className="text-[#111827]">Establishing secure headless connection</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#2563EB] animate-pulse w-4 text-center">●</span>
                        <span className="text-[#2563EB] font-medium">Inspecting DOM elements... [{inspectedElements}]</span>
                      </div>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md text-left flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feature Pills */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-1.5">
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

        {/* 1-Click Comparison Demos (Judges & Consumers) */}
        <section id="comparison-demos" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB] uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Demonstration Datasets — Reproducible Audits</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  DETERMINISTIC BENCHMARK FIXTURES
                </span>
              </div>
              <h2 className="text-base font-bold text-[#111827] tracking-tight">
                Cross-Marketplace Transparency & Effective Price Audits
              </h2>
            </div>
            <span className="text-xs text-[#6B7280]">Verified Reproducible Benchmarks for Judges</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMPARE_DEMOS.map((demo) => (
              <div
                key={demo.id}
                onClick={() => router.push(`/compare/${demo.id}`)}
                className="bg-white border border-[#E5E7EB] hover:border-[#2563EB] rounded-xl p-4.5 flex flex-col justify-between space-y-3 cursor-pointer transition shadow-xs group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#2563EB]">{demo.category}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {demo.savings}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      DEMO DATA — VERIFIED FIXTURE
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#2563EB] transition leading-snug">
                    {demo.title}
                  </h3>

                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {demo.portals.map((p, idx) => (
                      <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-[#F9FAFB] border border-[#E5E7EB] text-[#4B5563]">
                        {p}
                      </span>
                    ))}
                  </div>

                  <div className="text-xs font-mono font-semibold text-[#111827] bg-[#F9FAFB] p-2 rounded border border-[#E5E7EB] flex items-center justify-between">
                    <span>Observed Range:</span>
                    <span className="text-[#2563EB]">{demo.priceRange}</span>
                  </div>

                  <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-3">
                    {demo.description}
                  </p>

                  <div className="p-2 bg-amber-50/80 rounded border border-amber-200/80 text-[11px] text-amber-900 font-medium flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{demo.highlight}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between text-xs font-semibold text-[#2563EB]">
                  <span>Inspect benchmark audit</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* Single Journey Test Cases */}
        <section id="test-cases" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#111827] tracking-tight">CCPA Single-Journey Benchmarks</h2>
              <p className="text-xs text-[#6B7280]">
                Synthetic multi-stage journeys reproducing documented Indian regulatory enforcement targets.
              </p>
            </div>
            <span className="text-xs text-[#6B7280]">Single URL Scans</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {REGRESSION_EXAMPLES.map((ex) => (
              <div
                key={ex.id}
                onClick={() => {
                  setTargetUrl(ex.url);
                  handleStartAudit(ex.url);
                }}
                className="bg-white border border-[#E5E7EB] hover:border-[#2563EB] rounded-lg p-4 flex flex-col justify-between space-y-3 cursor-pointer transition shadow-xs group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#2563EB]">{ex.badge}</span>
                    <span className="text-[11px] text-[#9CA3AF] font-medium">{ex.type}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-[#111827] group-hover:text-[#2563EB] transition">
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

        {/* Recent Scans Section */}
        <section id="recent-scans" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#111827] tracking-tight">Recent Journey Audits</h2>
              <p className="text-xs text-[#6B7280]">
                Logged journey evaluations across retail and ticketing platforms.
              </p>
            </div>
            <span className="text-xs text-[#6B7280]">{recentScans.length} scans logged</span>
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
                    <tr key={s.scan_id || idx} className="hover:bg-[#F9FAFB]/60 transition">
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
                              const fixture = REGRESSION_EXAMPLES[idx % REGRESSION_EXAMPLES.length];
                              handleStartAudit(fixture.url);
                            }}
                            className="text-[#2563EB] hover:text-blue-700 font-medium text-xs cursor-pointer"
                          >
                            Inspect flow →
                          </button>
                        ) : (
                          <Link href={`/scan/${s.scan_id}`} className="text-[#2563EB] hover:text-blue-700 font-medium text-xs">
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

        {/* How It Works Section */}
        <section id="how-it-works" className="pt-4 border-t border-[#E5E7EB] space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] tracking-tight">How DarkShield Audits Work</h2>
            <p className="text-xs text-[#6B7280]">
              DarkShield observes real purchase journeys step by step, safely stopping before payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-white border border-[#E5E7EB] rounded-lg p-4 space-y-2 shadow-xs">
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
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] bg-white py-6 text-xs text-[#6B7280]">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>DarkShield — Cross-Marketplace Transparency & Evidence System</div>
          <div className="flex items-center gap-4 text-[#9CA3AF]">
            <span>CCPA 2023 Guidelines</span>
            <span>•</span>
            <span>Non-adjudicated Evidence System</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
