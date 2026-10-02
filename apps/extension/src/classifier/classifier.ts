/**
 * DarkShield — Layer 4: Pattern Classification & Risk Assessment
 *
 * Maps local or backend findings to the canonical DarkShield schema:
 *  - 13 CCPA 2023 Categories
 *  - Honest Calibrated Risk Assessment & Score (0-100)
 *  - CCPA Section references (§ 5(1) through § 5(13))
 *  - Evidence-backed explanations and consumer advice
 */

import type {
  Finding,
  TransparencyScore,
  ScoreDeduction,
  CCPAPattern,
  RiskAssessment,
  ScanCoverage,
  ConfidenceTier,
} from "@darkshield/schemas";

import type { PartialFinding } from "../detector/detection-engine";

// ─── Pattern Metadata Map ─────────────────────────────────────────────────────

export const PATTERN_META: Record<
  CCPAPattern,
  {
    title: string;
    ccpa_section: string;
    consumer_advice: string;
    remediation_hint: string;
    icon: string;
    color: string;
    score_weight: number;
  }
> = {
  FALSE_URGENCY: {
    title: "False Urgency",
    ccpa_section: "CCPA Guidelines 2023 § 5(1)",
    consumer_advice: "This website may be using artificial time pressure or stock scarcity to rush your decision. Take your time — genuine deals rarely disappear in minutes.",
    remediation_hint: "Ensure countdown timers reflect verified time-limited offers and stock quantities are real-time accurate.",
    icon: "⏰",
    color: "#f59e0b",
    score_weight: 15,
  },
  BASKET_SNEAKING: {
    title: "Basket Sneaking",
    ccpa_section: "CCPA Guidelines 2023 § 5(2)",
    consumer_advice: "Check your cart carefully before checkout. Items, warranties, or services may have been pre-selected without your explicit consent.",
    remediation_hint: "Remove pre-selected checkboxes for optional add-ons. All additions must require affirmative user opt-in.",
    icon: "🛒",
    color: "#ef4444",
    score_weight: 20,
  },
  CONFIRM_SHAMING: {
    title: "Confirm Shaming",
    ccpa_section: "CCPA Guidelines 2023 § 5(3)",
    consumer_advice: "The option to decline is worded to induce guilt, shame, or fear. You have the right to decline without manipulative emotional pressure.",
    remediation_hint: "Rewrite decline options using neutral, respectful language (e.g. replace 'No, I hate saving' with 'No thanks').",
    icon: "😔",
    color: "#a855f7",
    score_weight: 15,
  },
  FORCED_ACTION: {
    title: "Forced Action",
    ccpa_section: "CCPA Guidelines 2023 § 5(4)",
    consumer_advice: "You should not be compelled to perform unrelated actions or share superfluous personal information to complete your purchase.",
    remediation_hint: "Eliminate bundled mandatory consents or unrelated app downloads required to proceed.",
    icon: "🔒",
    color: "#ef4444",
    score_weight: 18,
  },
  SUBSCRIPTION_TRAP: {
    title: "Subscription Trap",
    ccpa_section: "CCPA Guidelines 2023 § 5(5)",
    consumer_advice: "Inspect auto-renewal terms carefully and ensure cancellation is as simple as signing up.",
    remediation_hint: "Provide an equally prominent, single-click online cancellation mechanism for recurring charges.",
    icon: "♾️",
    color: "#ef4444",
    score_weight: 20,
  },
  INTERFACE_INTERFERENCE: {
    title: "Interface Interference",
    ccpa_section: "CCPA Guidelines 2023 § 5(6)",
    consumer_advice: "The visual design intentionally obscures alternative choices through visual asymmetry, low contrast, or tiny fonts.",
    remediation_hint: "Ensure accept and decline options have comparable visual prominence and legible contrast.",
    icon: "🎭",
    color: "#f97316",
    score_weight: 15,
  },
  DRIP_PRICING: {
    title: "Drip Pricing",
    ccpa_section: "CCPA Guidelines 2023 § 5(7)",
    consumer_advice: "The final checkout total is higher than the price initially advertised. Review itemized fees to see what was tacked on.",
    remediation_hint: "Disclose all mandatory fees (including platform and handling charges) upfront in the advertised price.",
    icon: "💸",
    color: "#ef4444",
    score_weight: 20,
  },
  TRICK_WORDING: {
    title: "Trick Wording",
    ccpa_section: "CCPA Guidelines 2023 § 5(8)",
    consumer_advice: "Read consent options carefully. Confusing phrasing or double negatives can lead you to authorize unintended options.",
    remediation_hint: "Use plain, unambiguous language for all toggle descriptions and disclosures.",
    icon: "💬",
    color: "#ec4899",
    score_weight: 15,
  },
  NAGGING: {
    title: "Nagging",
    ccpa_section: "CCPA Guidelines 2023 § 5(9)",
    consumer_advice: "The website repeatedly prompts you with the same offer after you have already declined.",
    remediation_hint: "Respect user choice once declined without displaying repeated intrusive prompts.",
    icon: "🔔",
    color: "#84cc16",
    score_weight: 10,
  },
  BAIT_AND_SWITCH: {
    title: "Bait and Switch",
    ccpa_section: "CCPA Guidelines 2023 § 5(10)",
    consumer_advice: "The product or terms observed in later stages differ substantially from the initial representation.",
    remediation_hint: "Honor advertised offers and specifications throughout the complete purchase flow.",
    icon: "🔄",
    color: "#f97316",
    score_weight: 18,
  },
  DISGUISED_ADVERTISEMENT: {
    title: "Disguised Advertisement",
    ccpa_section: "CCPA Guidelines 2023 § 5(11)",
    consumer_advice: "Some results or editorial content are sponsored promotions without clear disclosure.",
    remediation_hint: "Prominently display clear 'Sponsored' or 'Ad' indicators on promotional listings.",
    icon: "📢",
    color: "#6366f1",
    score_weight: 12,
  },
  SAAS_BILLING: {
    title: "SaaS Billing",
    ccpa_section: "CCPA Guidelines 2023 § 5(12)",
    consumer_advice: "Check recurring billing frequencies and trial conversion policies carefully.",
    remediation_hint: "Disclose post-trial recurring billing amounts clearly before collecting payment credentials.",
    icon: "💳",
    color: "#f59e0b",
    score_weight: 16,
  },
  ROGUE_MALWARE: {
    title: "Rogue Malware",
    ccpa_section: "CCPA Guidelines 2023 § 5(13)",
    consumer_advice: "Deceptive download prompts or unauthorized software installation attempts detected. Do not proceed.",
    remediation_hint: "Cease all bundled software installation attempts without explicit affirmative consent.",
    icon: "☠️",
    color: "#ef4444",
    score_weight: 25,
  },
};

// ─── Classification Helper ────────────────────────────────────────────────────

function determineConfidenceTier(conf: number): ConfidenceTier {
  if (conf >= 0.85) return "HIGH";
  if (conf >= 0.65) return "MEDIUM";
  return "LOW";
}

export function classifyPartialFinding(partial: PartialFinding): Finding {
  const meta = PATTERN_META[partial.pattern];
  const confTier = determineConfidenceTier(partial.confidence);

  return {
    id: `ds-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    pattern: partial.pattern,
    sub_signals: partial.sub_signals,
    confidence: partial.confidence,
    confidence_tier: confTier,
    evidence_sources: partial.detection_methods,
    severity: partial.severity,
    url: partial.url,
    page_state: (partial.page_state as Finding["page_state"]) || "product",
    dom_evidence: partial.dom_evidence || [],
    price_journey: partial.price_journey,
    text_snippets: partial.text_snippets || [],
    visual_evidence: partial.visual_evidence || [],
    detection_methods: partial.detection_methods,
    rule_ids: partial.rule_ids,
    ccpa_category: partial.pattern,
    ccpa_regulation: meta.ccpa_section,
    title: partial.raw_title || meta.title,
    explanation: partial.explanation || `Evidence of potential ${meta.title} detected on this page.`,
    consumer_advice: partial.consumer_advice || meta.consumer_advice,
    remediation_hint: meta.remediation_hint,
    timestamp: Date.now() / 1000,
  };
}

// ─── Honest Calibrated Risk Assessment ─────────────────────────────────────────

export function computeCalibratedRiskAssessment(findings: Finding[]): RiskAssessment {
  const highCount = findings.filter(f => f.confidence_tier === "HIGH" || f.confidence >= 0.85).length;
  const medCount = findings.filter(f => f.confidence_tier === "MEDIUM" || (f.confidence >= 0.65 && f.confidence < 0.85)).length;
  const lowCount = findings.filter(f => f.confidence_tier === "LOW" || f.confidence < 0.65).length;

  // Weighted risk score (0 to 100)
  const risk_score = Math.min(100, highCount * 30 + medCount * 15 + lowCount * 5);

  let risk_level = "LOW";
  let summary = "No critical dark pattern indicators observed on evaluated page.";

  if (highCount >= 1 || risk_score >= 60) {
    risk_level = "HIGH";
    summary = `${findings.length} potential dark pattern(s) detected with ${highCount} high-confidence violation(s).`;
  } else if (medCount >= 1 || risk_score >= 25) {
    risk_level = "MODERATE";
    summary = `${findings.length} potential dark pattern signal(s) identified. Verification advised.`;
  } else if (findings.length > 0) {
    risk_level = "LOW";
    summary = `${findings.length} low-confidence signal(s) noted. Proceed normally.`;
  } else {
    risk_level = "LOW";
    summary = "No deceptive UX patterns detected on this page.";
  }

  return {
    risk_level,
    risk_score,
    checks_performed: 14,
    signals_found: findings.length,
    high_confidence_count: highCount,
    medium_confidence_count: medCount,
    low_confidence_count: lowCount,
    coverage_sufficient: true,
    summary,
  };
}

// ─── Transparency Score Calculator ───────────────────────────────────────────

export function computeTransparencyScore(findings: Finding[]): TransparencyScore {
  const deductions: ScoreDeduction[] = [];
  let totalDeductions = 0;

  for (const f of findings) {
    const meta = PATTERN_META[f.pattern];
    const weight = meta ? meta.score_weight : 15;
    const pts = Math.round(weight * f.confidence);
    totalDeductions += pts;
    deductions.push({
      pattern: f.pattern,
      finding_id: f.id,
      points_deducted: pts,
      reason: f.title,
    });
  }

  const total = Math.max(0, Math.min(100, 100 - Math.round(totalDeductions * 0.75)));

  return {
    total,
    dimensions: {
      price_transparency: Math.max(0, 100 - (findings.filter(f => f.pattern === "DRIP_PRICING" || f.pattern === "SAAS_BILLING").length * 30)),
      choice_neutrality: Math.max(0, 100 - (findings.filter(f => f.pattern === "INTERFACE_INTERFERENCE" || f.pattern === "FORCED_ACTION").length * 25)),
      consent_clarity: Math.max(0, 100 - (findings.filter(f => f.pattern === "BASKET_SNEAKING" || f.pattern === "SUBSCRIPTION_TRAP").length * 30)),
      urgency_signals: Math.max(0, 100 - (findings.filter(f => f.pattern === "FALSE_URGENCY" || f.pattern === "NAGGING").length * 25)),
      flow_transparency: Math.max(0, 100 - (findings.filter(f => f.pattern === "CONFIRM_SHAMING" || f.pattern === "TRICK_WORDING").length * 25)),
    },
    deductions,
    disclaimer: "DarkShield Transparency Score is an evidentiary product metric, not an official CCPA compliance certification.",
  };
}
