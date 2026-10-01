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
      setErrorMessage("Please paste a shopping or booking URL to check.");
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
        throw new Error(data.detail || "Inspection could not be initiated.");
      }

      router.push(`/scan/${data.scan_id}`);
    } catch (err: any) {
      setErrorMessage(err?.message || "Crawler service unreachable. Please ensure the inspection engine is running.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111827] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#2563EB] flex items-center justify-center text-white font-bold text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-semibold text-base text-[#111827] tracking-tight">DarkShield</span>
            <span className="text-xs px-2 py-0.5 rounded bg-[#F9FAFB] border border-[#E5E7EB] text-[#6B7280] font-medium ml-1">
              Purchase Journey Inspector
            </span>
          </div>

          <div className="flex items-center gap-6 text-sm text-[#6B7280]">
            <a href="#how-it-works" className="hover:text-[#111827] transition-colors">How it works</a>
            <a href="#test-cases" className="hover:text-[#111827] transition-colors">Test cases</a>
            <span className="text-xs text-[#9CA3AF] px-2.5 py-1 rounded bg-[#F9FAFB] border border-[#E5E7EB]">
              CCPA 2023 Guidelines
            </span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-16 pb-24 space-y-16">
        <section className="text-center max-w-2xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
            <span>Automated Consumer Protection & Compliance</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#111827]">
            Check a website before you buy.
          </h1>

          <p className="text-base text-[#6B7280] leading-relaxed">
            Paste a shopping or booking URL and DarkShield checks the purchase journey for potentially deceptive design, unexpected charges, and pre-selected add-ons.
          </p>

          {/* URL Input Box */}
          <div className="pt-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStartAudit();
              }}
              className="bg-white border border-[#E5E7EB] rounded-lg p-1.5 shadow-sm flex flex-col sm:flex-row items-center gap-2 transition-shadow focus-within:ring-2 focus-within:ring-blue-600/20 focus-within:border-blue-600"
            >
              <div className="relative flex-1 w-full pl-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/product"
                  className="w-full py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] bg-transparent focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-[#2563EB] hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 flex-shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Checking...</span>
                  </>
                ) : (
                  <span>Scan</span>
                )}
              </button>
            </form>

            {errorMessage && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md text-left">
                {errorMessage}
              </div>
            )}
          </div>

          {/* What DarkShield checks */}
          <div className="pt-2">
            <div className="text-xs text-[#6B7280] font-medium mb-3">What DarkShield checks</div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CHECKS_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="px-3 py-1 rounded-full bg-white border border-[#E5E7EB] text-xs font-medium text-[#4B5563] shadow-xs"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="pt-8 border-t border-[#E5E7EB] space-y-8">
          <div>
            <h2 className="text-xl font-bold text-[#111827] tracking-tight">How it works</h2>
            <p className="text-sm text-[#6B7280] mt-1">
              DarkShield observes real purchase journeys step by step, safely stopping before payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STEPS.map((step, idx) => (
              <div
                key={step.number}
                className="bg-white border border-[#E5E7EB] rounded-lg p-5 space-y-3 relative shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2563EB] tracking-wide">{step.number}</span>
                  <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider bg-[#F9FAFB] px-2 py-0.5 rounded border border-[#E5E7EB]">
                    {step.stage}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-[#111827] leading-snug">{step.title}</h3>
                <p className="text-xs text-[#6B7280] leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Test DarkShield: Regression Examples */}
        <section id="test-cases" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#111827] tracking-tight">Test DarkShield</h2>
              <p className="text-sm text-[#6B7280] mt-1">
                Regression examples based on documented Indian regulatory enforcement targets and real purchase flows.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REGRESSION_EXAMPLES.map((ex) => (
              <div
                key={ex.id}
                onClick={() => {
                  setTargetUrl(ex.url);
                  handleStartAudit(ex.url);
                }}
                className="bg-white border border-[#E5E7EB] hover:border-[#2563EB] rounded-lg p-5 flex flex-col justify-between space-y-4 cursor-pointer transition-all shadow-xs group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2563EB]">{ex.badge}</span>
                    <span className="text-xs text-[#9CA3AF] font-medium">{ex.type}</span>
                  </div>

                  <h3 className="text-base font-semibold text-[#111827] group-hover:text-[#2563EB] transition-colors">
                    {ex.name}
                  </h3>

                  <div className="text-xs font-medium text-[#111827] bg-[#F9FAFB] p-2 rounded border border-[#E5E7EB]">
                    {ex.priceFlow}
                  </div>

                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {ex.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#F3F4F6] flex items-center justify-between text-xs font-medium text-[#2563EB]">
                  <span>View test</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Evaluation Standards Notice */}
        <section className="bg-white border border-[#E5E7EB] rounded-lg p-6 space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#15803D]"></span>
            <h3 className="font-semibold text-sm text-[#111827]">Objective Regulatory Grounding</h3>
          </div>
          <p className="text-xs text-[#6B7280] leading-relaxed">
            DarkShield maps evaluated elements against the 13 dark pattern categories defined under the Ministry of Consumer Affairs’ CCPA 2023 Guidelines. Findings represent automated observations of purchase journeys; they are presented as high-confidence potential signals rather than definitive legal adjudications.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] bg-white py-8 text-xs text-[#6B7280]">
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
