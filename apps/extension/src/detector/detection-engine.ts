/**
 * DarkShield — Layer 3: Detection Engine (Level 1 Fast Local Analysis)
 *
 * Runs instantly in the browser without network latency.
 * Combines:
 *  A. Rule Engine (deterministic DOM/text)
 *  B. Visual/CSS Prominence Detector (Interface Interference)
 *  C. Price Journey & Cart Diff Tracker (Drip Pricing / Basket Sneaking)
 *  D. Trick Wording & Subscription Trap Heuristics
 *
 * If suspicious signals are found, Level 2 escalates to the backend API.
 */

import type {
  CCPAPattern,
  PatternSubSignal,
  DetectionMethod,
  DOMEvidence,
  PriceJourney,
  PricePoint,
  VisualProminenceScore,
} from "@darkshield/schemas";

import {
  findCountdownTimers,
  findUrgencyScarcityText,
  findPreCheckedCheckboxes,
  findConfirmShamingElements,
  findTrickWordingElements,
  findSubscriptionTrapElements,
  extractDOMEvidence,
  analyzeButtonPair,
  classifyPageState,
  extractPricesFromDOM,
} from "../analyzer/page-analyzer";

// ─── Partial Finding Interface ────────────────────────────────────────────────

export interface PartialFinding {
  pattern: CCPAPattern;
  sub_signals: PatternSubSignal[];
  confidence: number;
  severity: "low" | "medium" | "high";
  detection_methods: DetectionMethod[];
  rule_ids: string[];
  dom_evidence?: DOMEvidence[];
  price_journey?: PriceJourney;
  text_snippets?: string[];
  visual_evidence?: VisualProminenceScore[];
  url: string;
  page_state: string;
  raw_title?: string;
  explanation?: string;
  consumer_advice?: string;
}

// ─── A. Deterministic Rule Engine ─────────────────────────────────────────────

export function runRuleEngine(): PartialFinding[] {
  const findings: PartialFinding[] = [];
  const url = window.location.href;
  const pageState = classifyPageState();

  // 1. Countdown Timers (False Urgency)
  const timers = findCountdownTimers();
  if (timers.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["COUNTDOWN_TIMER"],
      confidence: 0.85,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_COUNTDOWN_TIMER"],
      dom_evidence: timers.map(t => extractDOMEvidence(t.element)),
      text_snippets: timers.map(t => `Timer: ${t.text}`),
      url,
      page_state: pageState,
      raw_title: "Countdown Timer Detected",
      explanation: "A live countdown timer was detected on this page. Artificial timers create urgency to induce immediate checkout decisions.",
      consumer_advice: "Check whether this offer is genuinely expiring or if the timer resets upon page reload.",
    });
  }

  // 2. Scarcity & Deadline Text
  const textSignals = findUrgencyScarcityText();
  const scarcitySignals = textSignals.filter(s => s.pattern_type === "SCARCITY");
  const deadlineSignals = textSignals.filter(s => s.pattern_type === "DEADLINE");
  const socialProofSignals = textSignals.filter(s => s.pattern_type === "SOCIAL_PROOF");

  if (scarcitySignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["SCARCITY_CLAIM"],
      confidence: 0.82,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_SCARCITY_CLAIM"],
      dom_evidence: scarcitySignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: scarcitySignals.map(s => `Scarcity: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Stock Scarcity Claim Detected",
      explanation: `The page displays an urgent stock claim ("${scarcitySignals[0].text}"). Platforms often show ungrounded scarcity cues to discourage comparison shopping.`,
      consumer_advice: "Take your time. Stock scarcity claims on digital storefronts are frequently unverified.",
    });
  }

  if (deadlineSignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["DEADLINE_LANGUAGE"],
      confidence: 0.78,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_DEADLINE_TEXT"],
      dom_evidence: deadlineSignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: deadlineSignals.map(s => `Deadline: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Artificial Deadline Language",
      explanation: `High-pressure deadline language was found: "${deadlineSignals[0].text}".`,
      consumer_advice: "Verify if promotional pricing is genuinely limited or a standard catalog discount.",
    });
  }

  if (socialProofSignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["SOCIAL_PROOF_PRESSURE"],
      confidence: 0.72,
      severity: "low",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_SOCIAL_PROOF"],
      dom_evidence: socialProofSignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: socialProofSignals.map(s => `Social proof: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Social Proof Pressure Cue",
      explanation: `Page asserts high competitive activity: "${socialProofSignals[0].text}".`,
      consumer_advice: "Viewer counts and concurrent buyer counters are often generated client-side.",
    });
  }

  // 3. Basket Sneaking (Pre-ticked Addon Checkboxes)
  const checkboxes = findPreCheckedCheckboxes();
  const addonCheckboxes = checkboxes.filter(c => c.is_optional_addon);
  if (addonCheckboxes.length > 0) {
    findings.push({
      pattern: "BASKET_SNEAKING",
      sub_signals: ["PRE_TICKED_CHECKBOX"],
      confidence: 0.92,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["BS_PRE_TICKED_CHECKBOX"],
      dom_evidence: addonCheckboxes.map(c => extractDOMEvidence(c.element)),
      text_snippets: addonCheckboxes.map(c => `Pre-selected: "${c.label_text || 'Add-on'}"`),
      url,
      page_state: pageState,
      raw_title: "Pre-Ticked Add-On Checkbox",
      explanation: `An optional ancillary service ("${addonCheckboxes[0].label_text || 'Add-on'}") is pre-checked by default without explicit affirmative user consent.`,
      consumer_advice: "Inspect your order total and uncheck unsolicited items or insurance before proceeding.",
    });
  }

  // 4. Confirm Shaming
  const shamingElements = findConfirmShamingElements();
  if (shamingElements.length > 0) {
    findings.push({
      pattern: "CONFIRM_SHAMING",
      sub_signals: ["SHAME_LANGUAGE"],
      confidence: 0.90,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["CS_SHAME_DECLINE"],
      dom_evidence: shamingElements.map(s => extractDOMEvidence(s.element)),
      text_snippets: shamingElements.map(s => `Decline text: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Confirm Shaming Language",
      explanation: `The option to decline uses manipulative or guilt-inducing phrasing ("${shamingElements[0].text}") to discourage refusal.`,
      consumer_advice: "You have the right to decline optional products and subscriptions neutrally without social stigma.",
    });
  }

  // 5. Trick Wording (Double Negatives)
  const trickElements = findTrickWordingElements();
  if (trickElements.length > 0) {
    findings.push({
      pattern: "TRICK_WORDING",
      sub_signals: ["DOUBLE_NEGATIVE"],
      confidence: 0.86,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["TW_DOUBLE_NEGATIVE"],
      dom_evidence: trickElements.map(s => extractDOMEvidence(s.element)),
      text_snippets: trickElements.map(s => `Wording: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Trick Wording / Double Negative",
      explanation: `The interface employs confusing double-negative phrasing ("${trickElements[0].text}") that obscures whether opting in or out is selected.`,
      consumer_advice: "Read consent options carefully to confirm the actual effect of checking or unchecking the box.",
    });
  }

  // 6. Subscription Trap
  const subElements = findSubscriptionTrapElements();
  if (subElements.length > 0) {
    findings.push({
      pattern: "SUBSCRIPTION_TRAP",
      sub_signals: ["MANDATORY_FEE"],
      confidence: 0.84,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["ST_AUTO_RENEWAL"],
      dom_evidence: subElements.map(s => extractDOMEvidence(s.element)),
      text_snippets: subElements.map(s => `Terms: "${s.text}"`),
      url,
      page_state: pageState,
      raw_title: "Potential Subscription Trap",
      explanation: `Recurring billing or onerous cancellation language detected ("${subElements[0].text}").`,
      consumer_advice: "Ensure cancellation steps are simple and straightforward before authorizing recurring charges.",
    });
  }

  return findings;
}

// ─── B. Visual / CSS Detector (Interface Interference) ───────────────────────

export function runVisualDetector(): PartialFinding[] {
  const findings: PartialFinding[] = [];
  const url = window.location.href;
  const pageState = classifyPageState();

  // Find accept/primary buttons
  const primaryButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button[class*='primary'], button[class*='accept'], button[class*='confirm'], button[class*='agree'], button[class*='continue'], .btn-primary, .cta-primary, button[type='submit']"
    )
  ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

  // Find decline/secondary actions
  const declineActions = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button[class*='secondary'], button[class*='skip'], a[class*='skip'], [class*='no-thanks'], [class*='not-now'], [class*='maybe-later'], button[class*='decline'], a[class*='decline'], .btn-link"
    )
  ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

  if (primaryButtons.length > 0 && declineActions.length > 0) {
    const primary = primaryButtons[0];
    const decline = declineActions[0];

    const { accept, decline: declineScore, ratio } = analyzeButtonPair(primary, decline);

    if (ratio >= 3.5) {
      findings.push({
        pattern: "INTERFACE_INTERFERENCE",
        sub_signals: ["VISUAL_ASYMMETRY"],
        confidence: Math.min(0.70 + (ratio - 3.5) * 0.04, 0.95),
        severity: ratio >= 6 ? "high" : "medium",
        detection_methods: ["CSS_GEOMETRY"],
        rule_ids: ["II_VISUAL_ASYMMETRY"],
        visual_evidence: [accept, declineScore],
        dom_evidence: [extractDOMEvidence(decline), extractDOMEvidence(primary)],
        text_snippets: [
          `Primary: "${accept.label}" vs Alternative: "${declineScore.label}"`,
          `Visual Prominence Disparity: ${ratio.toFixed(1)}×`,
        ],
        url,
        page_state: pageState,
        raw_title: "Visual Asymmetry Between Choices",
        explanation: `Significant visual bias detected between primary and alternative actions (${ratio.toFixed(1)}× prominence ratio). The platform design obscures the alternative choice.`,
        consumer_advice: "Look carefully for subtle or muted links if you wish to skip or decline optional services.",
      });
    }
  }

  return findings;
}

// ─── C. Price Journey Tracker (Drip Pricing) ─────────────────────────────────

export interface PriceSnapshot {
  state: string;
  prices: number[];
  highestPrice: number;
  timestamp: number;
}

export class PriceJourneyTracker {
  private snapshots: PriceSnapshot[] = [];

  captureSnapshot(): PriceSnapshot {
    const state = classifyPageState();
    const prices = extractPricesFromDOM();
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const snap: PriceSnapshot = {
      state,
      prices,
      highestPrice,
      timestamp: Date.now(),
    };
    this.snapshots.push(snap);
    return snap;
  }

  getSnapshots(): PriceSnapshot[] {
    return this.snapshots;
  }

  getDripPricingFinding(): PartialFinding | null {
    if (this.snapshots.length < 2) return null;

    const first = this.snapshots[0];
    const latest = this.snapshots[this.snapshots.length - 1];

    if (first.highestPrice <= 0 || latest.highestPrice <= 0) return null;

    const delta = latest.highestPrice - first.highestPrice;
    if (delta > 20) {
      return {
        pattern: "DRIP_PRICING",
        sub_signals: ["MANDATORY_FEE"],
        confidence: Math.min(0.75 + delta / 1000, 0.95),
        severity: delta > 150 ? "high" : "medium",
        detection_methods: ["PRICE_JOURNEY"],
        rule_ids: ["DP_PRICE_INCREASE_JOURNEY"],
        text_snippets: [
          `Advertised price: ₹${first.highestPrice.toLocaleString('en-IN')}`,
          `Checkout total: ₹${latest.highestPrice.toLocaleString('en-IN')}`,
          `Undisclosed increase: +₹${delta.toLocaleString('en-IN')}`,
        ],
        url: window.location.href,
        page_state: latest.state,
        raw_title: "Observed Price Escalation (Drip Pricing)",
        explanation: `The observed total increased by ₹${delta.toLocaleString('en-IN')} as you navigated from ${first.state} to ${latest.state}. Mandatory fees were withheld upfront.`,
        consumer_advice: "Examine the itemized price breakdown to identify mandatory convenience or platform charges.",
      };
    }

    return null;
  }
}

// ─── Main Ensemble Runner ─────────────────────────────────────────────────────

export interface FastLocalCheckResult {
  hasSuspiciousSignals: boolean;
  findings: PartialFinding[];
  signalCount: number;
  highSeverityCount: number;
  summary: string;
}

export function runLocalFastCheck(priceTracker?: PriceJourneyTracker): FastLocalCheckResult {
  const ruleFindings = runRuleEngine();
  const visualFindings = runVisualDetector();
  const allFindings = [...ruleFindings, ...visualFindings];

  if (priceTracker) {
    const drip = priceTracker.getDripPricingFinding();
    if (drip) allFindings.push(drip);
  }

  const highCount = allFindings.filter(f => f.severity === "high").length;

  return {
    hasSuspiciousSignals: allFindings.length > 0,
    findings: allFindings,
    signalCount: allFindings.length,
    highSeverityCount: highCount,
    summary:
      allFindings.length === 0
        ? "No significant dark-pattern signals detected on this page."
        : `${allFindings.length} suspicious pattern indicator(s) identified.`,
  };
}
