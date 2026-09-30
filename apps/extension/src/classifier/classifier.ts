/**
 * DarkShield — Layer 4: Pattern Classification & Evidence
 *
 * Maps PartialFindings from the detection engine to:
 *  - Full CCPA-mapped Finding objects
 *  - Transparency Score
 *  - Human-readable titles and explanations
 *
 * IMPORTANT: This layer does NOT invent findings.
 * It only classifies evidence that the detection engine already collected.
 * The LLM (if available) enriches explanations only — it does not alter confidence.
 */

import type {
  Finding,
  TransparencyScore,
  ScoreDeduction,
  CCPAPattern,
  ScanResult,
} from "@darkshield/schemas";

import type { PartialFinding, DetectionResult } from "../detector/detection-engine";

// ─── Pattern Metadata ─────────────────────────────────────────────────────────

const PATTERN_META: Record<CCPAPattern, { title: string; consumer_advice: string; score_weight: number }> = {
  FALSE_URGENCY: {
    title: "False Urgency",
    consumer_advice:
      "This website may be using artificial time pressure or stock scarcity to rush your decision. Take your time — genuine deals rarely disappear in minutes.",
    score_weight: 15,
  },
  BASKET_SNEAKING: {
    title: "Basket Sneaking",
    consumer_advice:
      "Check your cart carefully before checkout. Items or services may have been added without your explicit consent.",
    score_weight: 20,
  },
  DRIP_PRICING: {
    title: "Drip Pricing",
    consumer_advice:
      "The final price shown at checkout is higher than the price initially displayed. Review the price breakdown to understand what was added.",
    score_weight: 20,
  },
  CONFIRM_SHAMING: {
    title: "Confirm Shaming",
    consumer_advice:
      "The option to decline is worded to make you feel guilty. You have the right to say no without shame.",
    score_weight: 15,
  },
  INTERFACE_INTERFERENCE: {
    title: "Interface Interference",
    consumer_advice:
      "The design makes it harder to choose one option over another. Look carefully for the alternative option, which may be in smaller text.",
    score_weight: 15,
  },
  FORCED_ACTION: {
    title: "Forced Action",
    consumer_advice:
      "You should not need to complete unrelated actions to proceed. Review whether any required step is genuinely necessary.",
    score_weight: 18,
  },
  SUBSCRIPTION_TRAP: {
    title: "Subscription Trap",
    consumer_advice:
      "Watch for auto-renewal terms and check how to cancel before signing up.",
    score_weight: 20,
  },
  BAIT_AND_SWITCH: {
    title: "Bait and Switch",
    consumer_advice:
      "The product or offer shown may differ from what you will actually receive. Compare carefully before purchasing.",
    score_weight: 18,
  },
  DISGUISED_ADVERTISEMENT: {
    title: "Disguised Advertisement",
    consumer_advice:
      "Some results or content on this page may be sponsored advertisements not clearly labeled as such.",
    score_weight: 10,
  },
  NAGGING: {
    title: "Nagging",
    consumer_advice:
      "The website repeatedly shows the same prompt or offer. You are always entitled to decline.",
    score_weight: 10,
  },
  TRICK_WORDING: {
    title: "Trick Wording",
    consumer_advice:
      "Read the options carefully. Double negatives or confusing language may cause you to opt into something you did not intend.",
    score_weight: 15,
  },
  SAAS_BILLING: {
    title: "SaaS Billing",
    consumer_advice:
      "Check billing frequency, trial terms, and cancellation policy before subscribing.",
    score_weight: 18,
  },
  ROGUE_MALWARE: {
    title: "Rogue Malware / Forced Install",
    consumer_advice:
      "This page appears to be requesting software installation without clear consent. Do not proceed.",
    score_weight: 30,
  },
};

// ─── ID generator ─────────────────────────────────────────────────────────────

function generateFindingId(): string {
  return `ds-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

// ─── Sub-signal → explanation text ───────────────────────────────────────────

function buildExplanation(partial: PartialFinding): string {
  const parts: string[] = [];

  if (partial.sub_signals.includes("COUNTDOWN_TIMER")) {
    parts.push(`A countdown timer was detected on this page (${partial.text_snippets?.[0] || "timer visible"}). While some time-limited offers are genuine, unverified countdown timers may be used to create artificial urgency.`);
  }
  if (partial.sub_signals.includes("SCARCITY_CLAIM")) {
    parts.push(`A low-stock or scarcity claim was found: "${partial.text_snippets?.[0] || "scarcity text"}". This claim cannot be independently verified by DarkShield.`);
  }
  if (partial.sub_signals.includes("DEADLINE_LANGUAGE")) {
    parts.push(`Deadline-creating language was detected: "${partial.text_snippets?.[0] || "deadline text"}". This may be designed to pressure you into a quick decision.`);
  }
  if (partial.sub_signals.includes("SOCIAL_PROOF_PRESSURE")) {
    parts.push(`Social pressure language was detected: "${partial.text_snippets?.[0] || "social proof"}". These figures are often unverifiable.`);
  }
  if (partial.sub_signals.includes("PRE_TICKED_CHECKBOX")) {
    parts.push(`An optional add-on checkbox was found pre-ticked by default. You may be charged for "${partial.text_snippets?.[0] || "add-on"}" unless you uncheck it.`);
  }
  if (partial.sub_signals.includes("UNSOLICITED_ITEM")) {
    parts.push(`Item(s) appeared in your cart that you did not explicitly add: ${partial.text_snippets?.join(", ") || "unknown items"}.`);
  }
  if (partial.sub_signals.includes("MANDATORY_FEE")) {
    parts.push(`${partial.text_snippets?.join(". ") || "An additional mandatory charge appeared during checkout."}`);
  }
  if (partial.sub_signals.includes("SHAME_LANGUAGE")) {
    parts.push(`The decline option uses guilt-inducing or fear-based language: "${partial.text_snippets?.[0] || "decline text"}". You have the full right to decline without being shamed.`);
  }
  if (partial.sub_signals.includes("VISUAL_ASYMMETRY")) {
    parts.push(`${partial.text_snippets?.join(" | ") || "Significant visual asymmetry detected between accept and decline options."} The primary action is significantly more prominent than the alternative.`);
  }

  if (parts.length === 0) {
    parts.push(`Evidence of potential ${partial.pattern.replace(/_/g, " ").toLowerCase()} was detected on this page.`);
  }

  return parts.join(" ");
}

// ─── Classify Single Finding ──────────────────────────────────────────────────

export function classifyFinding(partial: PartialFinding): Finding {
  const meta = PATTERN_META[partial.pattern];

  return {
    id: generateFindingId(),
    pattern: partial.pattern,
    sub_signals: partial.sub_signals,
    confidence: partial.confidence,
    severity: partial.severity,
    url: partial.url,
    page_state: partial.page_state as Finding["page_state"],
    dom_evidence: partial.dom_evidence,
    price_journey: partial.price_journey,
    text_snippets: partial.text_snippets,
    visual_evidence: partial.visual_evidence,
    detection_methods: partial.detection_methods,
    rule_ids: partial.rule_ids,
    ccpa_category: partial.pattern,
    ccpa_regulation: "CCPA_DARK_PATTERNS_2023",
    title: partial.raw_title || meta.title,
    explanation: buildExplanation(partial),
    consumer_advice: meta.consumer_advice,
    timestamp: Date.now(),
  };
}

// ─── Transparency Score Calculator ───────────────────────────────────────────

const DIMENSION_PATTERNS: Record<keyof TransparencyScore["dimensions"], CCPAPattern[]> = {
  price_transparency: ["DRIP_PRICING", "SAAS_BILLING"],
  choice_neutrality: ["INTERFACE_INTERFERENCE", "FORCED_ACTION", "BAIT_AND_SWITCH"],
  consent_clarity: ["BASKET_SNEAKING", "SUBSCRIPTION_TRAP"],
  urgency_signals: ["FALSE_URGENCY", "NAGGING"],
  flow_transparency: ["CONFIRM_SHAMING", "TRICK_WORDING", "DISGUISED_ADVERTISEMENT"],
};

export function computeTransparencyScore(findings: Finding[]): TransparencyScore {
  const deductions: ScoreDeduction[] = [];
  const dimensionDeductions: Record<keyof TransparencyScore["dimensions"], number> = {
    price_transparency: 0,
    choice_neutrality: 0,
    consent_clarity: 0,
    urgency_signals: 0,
    flow_transparency: 0,
  };

  for (const finding of findings) {
    const meta = PATTERN_META[finding.pattern];
    const pts = Math.round(meta.score_weight * finding.confidence);

    // Which dimension does this pattern affect?
    let dim: keyof TransparencyScore["dimensions"] = "flow_transparency";
    for (const [d, patterns] of Object.entries(DIMENSION_PATTERNS)) {
      if ((patterns as CCPAPattern[]).includes(finding.pattern)) {
        dim = d as keyof TransparencyScore["dimensions"];
        break;
      }
    }

    dimensionDeductions[dim] = Math.min(100, dimensionDeductions[dim] + pts);
    deductions.push({
      pattern: finding.pattern,
      finding_id: finding.id,
      points_deducted: pts,
      reason: finding.title,
    });
  }

  const dimensions: TransparencyScore["dimensions"] = {
    price_transparency: Math.max(0, 100 - dimensionDeductions.price_transparency),
    choice_neutrality: Math.max(0, 100 - dimensionDeductions.choice_neutrality),
    consent_clarity: Math.max(0, 100 - dimensionDeductions.consent_clarity),
    urgency_signals: Math.max(0, 100 - dimensionDeductions.urgency_signals),
    flow_transparency: Math.max(0, 100 - dimensionDeductions.flow_transparency),
  };

  const totalDeducted = deductions.reduce((sum, d) => sum + d.points_deducted, 0);
  const total = Math.max(0, Math.min(100, 100 - Math.round(totalDeducted * 0.5)));

  return {
    total,
    dimensions,
    deductions,
    disclaimer:
      "DarkShield Transparency Score is a product metric, not an official CCPA compliance score.",
  };
}

// ─── Full Classification Pass ─────────────────────────────────────────────────

export interface ClassificationResult {
  findings: Finding[];
  transparency_score: TransparencyScore;
  findings_by_pattern: Partial<Record<CCPAPattern, number>>;
}

export function classifyDetectionResult(detection: DetectionResult): ClassificationResult {
  const findings = detection.findings.map(classifyFinding);
  const transparency_score = computeTransparencyScore(findings);

  const findings_by_pattern: Partial<Record<CCPAPattern, number>> = {};
  for (const f of findings) {
    findings_by_pattern[f.pattern] = (findings_by_pattern[f.pattern] || 0) + 1;
  }

  return { findings, transparency_score, findings_by_pattern };
}
