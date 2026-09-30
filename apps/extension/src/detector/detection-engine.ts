/**
 * DarkShield — Layer 3: Detection Engine
 *
 * Multi-engine ensemble detector.
 * Combines:
 *  A. Rule Engine (deterministic DOM/text)
 *  B. Visual/CSS Detector (Interface Interference)
 *  C. State Diff Detector (Basket Sneaking, Drip Pricing)
 *
 * Each engine produces Evidence objects.
 * Layer 4 (Classifier) maps evidence → CCPA Finding.
 */

import type {
  Finding,
  CCPAPattern,
  PatternSubSignal,
  DetectionMethod,
  DOMEvidence,
  PriceJourney,
  PricePoint,
  PageStateSnapshot,
  CartItem,
  VisualProminenceScore,
} from "@darkshield/schemas";

import {
  findCountdownTimers,
  findUrgencyScarcityText,
  findPreCheckedCheckboxes,
  findConfirmShamingElements,
  extractDOMEvidence,
  analyzeButtonPair,
  capturePageState,
  classifyPageState,
  extractPricesFromDOM,
} from "../analyzer/page-analyzer";

// ─── Partial Finding (before LLM explanation) ────────────────────────────────

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
  state_before?: PageStateSnapshot;
  state_after?: PageStateSnapshot;
  url: string;
  page_state: string;
  raw_title?: string;
}

// ─── A. Rule Engine ───────────────────────────────────────────────────────────

export function runRuleEngine(): PartialFinding[] {
  const findings: PartialFinding[] = [];
  const url = window.location.href;
  const pageState = classifyPageState();

  // ── A1. Countdown Timers ─────────────────────────────────────────
  const timers = findCountdownTimers();
  if (timers.length > 0) {
    const evidence = timers.map(t => extractDOMEvidence(t.element));
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["COUNTDOWN_TIMER"],
      confidence: 0.65,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_COUNTDOWN_TIMER"],
      dom_evidence: evidence,
      text_snippets: timers.map(t => t.text),
      url,
      page_state: pageState,
      raw_title: "Countdown Timer Detected",
    });
  }

  // ── A2. Urgency / Scarcity Text ──────────────────────────────────
  const textSignals = findUrgencyScarcityText();
  const scarcitySignals = textSignals.filter(s => s.pattern_type === "SCARCITY");
  const deadlineSignals = textSignals.filter(s => s.pattern_type === "DEADLINE");
  const socialProofSignals = textSignals.filter(s => s.pattern_type === "SOCIAL_PROOF");

  if (scarcitySignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["SCARCITY_CLAIM"],
      confidence: 0.70,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_SCARCITY_CLAIM"],
      dom_evidence: scarcitySignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: scarcitySignals.map(s => s.text),
      url,
      page_state: pageState,
      raw_title: "Scarcity Signal Detected",
    });
  }

  if (deadlineSignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["DEADLINE_LANGUAGE"],
      confidence: 0.72,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_DEADLINE_TEXT"],
      dom_evidence: deadlineSignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: deadlineSignals.map(s => s.text),
      url,
      page_state: pageState,
      raw_title: "Deadline Language Detected",
    });
  }

  if (socialProofSignals.length > 0) {
    findings.push({
      pattern: "FALSE_URGENCY",
      sub_signals: ["SOCIAL_PROOF_PRESSURE"],
      confidence: 0.68,
      severity: "medium",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["FU_SOCIAL_PROOF"],
      dom_evidence: socialProofSignals.map(s => extractDOMEvidence(s.element)),
      text_snippets: socialProofSignals.map(s => s.text),
      url,
      page_state: pageState,
      raw_title: "Social Proof Pressure Detected",
    });
  }

  // ── A3. Pre-checked Checkboxes (Basket Sneaking) ─────────────────
  const checkboxes = findPreCheckedCheckboxes();
  const addonCheckboxes = checkboxes.filter(c => c.is_optional_addon);
  if (addonCheckboxes.length > 0) {
    findings.push({
      pattern: "BASKET_SNEAKING",
      sub_signals: ["PRE_TICKED_CHECKBOX"],
      confidence: 0.85,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["BS_PRE_TICKED_CHECKBOX"],
      dom_evidence: addonCheckboxes.map(c => extractDOMEvidence(c.element)),
      text_snippets: addonCheckboxes.map(c => c.label_text),
      url,
      page_state: pageState,
      raw_title: "Pre-ticked Optional Add-on Checkbox",
    });
  }

  // ── A4. Confirm Shaming ──────────────────────────────────────────
  const shamingElements = findConfirmShamingElements();
  if (shamingElements.length > 0) {
    findings.push({
      pattern: "CONFIRM_SHAMING",
      sub_signals: ["SHAME_LANGUAGE"],
      confidence: 0.88,
      severity: "high",
      detection_methods: ["DOM_RULE"],
      rule_ids: ["CS_SHAME_DECLINE"],
      dom_evidence: shamingElements.map(s => extractDOMEvidence(s.element)),
      text_snippets: shamingElements.map(s => s.text),
      url,
      page_state: pageState,
      raw_title: "Confirm Shaming Text Detected",
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
      "button[class*='primary'], button[class*='accept'], button[class*='confirm'], button[class*='agree'], button[class*='continue'], .btn-primary, .cta-primary"
    )
  );

  // Find decline/secondary actions
  const declineActions = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button[class*='secondary'], button[class*='skip'], a[class*='skip'], [class*='no-thanks'], [class*='not-now'], [class*='maybe-later'], button[class*='decline'], a[class*='decline']"
    )
  );

  if (primaryButtons.length > 0 && declineActions.length > 0) {
    const primary = primaryButtons[0];
    const decline = declineActions[0];

    const { accept, decline: declineScore, ratio } = analyzeButtonPair(primary, decline);

    if (ratio >= 3) {
      findings.push({
        pattern: "INTERFACE_INTERFERENCE",
        sub_signals: ["VISUAL_ASYMMETRY"],
        // Higher ratio → higher confidence
        confidence: Math.min(0.60 + (ratio - 3) * 0.05, 0.95),
        severity: ratio >= 6 ? "high" : "medium",
        detection_methods: ["CSS_GEOMETRY"],
        rule_ids: ["II_VISUAL_ASYMMETRY"],
        visual_evidence: [accept, declineScore],
        text_snippets: [
          `Accept: "${accept.label}" (prominence: ${accept.prominence.toFixed(2)})`,
          `Decline: "${declineScore.label}" (prominence: ${declineScore.prominence.toFixed(2)})`,
          `Ratio: ${ratio.toFixed(1)}×`,
        ],
        url,
        page_state: pageState,
        raw_title: "Visual Asymmetry Between Choices",
      });
    }
  }

  return findings;
}

// ─── C. Price Journey Tracker (Drip Pricing) ─────────────────────────────────

export class PriceJourneyTracker {
  private snapshots: PageStateSnapshot[] = [];

  captureSnapshot(): PageStateSnapshot {
    const state = classifyPageState();
    const snapshot = capturePageState(state);
    this.snapshots.push(snapshot);
    return snapshot;
  }

  analyzeJourney(): PriceJourney | null {
    if (this.snapshots.length < 2) return null;

    const allPrices = this.snapshots.flatMap(s => s.prices);
    if (allPrices.length < 2) return null;

    // Highest price from each state
    const byState: Record<string, number> = {};
    for (const snap of this.snapshots) {
      if (snap.prices.length > 0) {
        const max = Math.max(...snap.prices.map(p => p.amount));
        const stateKey = snap.prices[0]?.state || "unknown";
        if (!byState[stateKey] || max > byState[stateKey]) {
          byState[stateKey] = max;
        }
      }
    }

    const productPrice = byState["product"] || 0;
    const checkoutPrice = byState["checkout"] || byState["cart"] || 0;
    const delta = checkoutPrice - productPrice;

    if (delta <= 0) return null;

    const points: PricePoint[] = this.snapshots.flatMap(s => s.prices);

    return {
      points,
      delta_total: delta,
      mandatory_additions: [],  // populated by backend NLP
      potential_drip: delta > 0,
    };
  }

  getDripPricingFinding(): PartialFinding | null {
    const journey = this.analyzeJourney();
    if (!journey || !journey.potential_drip) return null;

    return {
      pattern: "DRIP_PRICING",
      sub_signals: ["MANDATORY_FEE"],
      confidence: Math.min(0.70 + journey.delta_total / 1000, 0.95),
      severity: journey.delta_total > 200 ? "high" : "medium",
      detection_methods: ["PRICE_JOURNEY"],
      rule_ids: ["DP_PRICE_INCREASE_CART"],
      price_journey: journey,
      text_snippets: [
        `Price journey: ₹${Math.min(...journey.points.map(p => p.amount))} → ₹${Math.max(...journey.points.map(p => p.amount))}`,
        `Unexplained increase: ₹${journey.delta_total.toFixed(0)}`,
      ],
      url: window.location.href,
      page_state: classifyPageState(),
      raw_title: "Potential Drip Pricing",
    };
  }
}

// ─── Cart Diff Tracker (Basket Sneaking) ─────────────────────────────────────

export class CartDiffTracker {
  private cartBefore: CartItem[] = [];
  private cartAfter: CartItem[] = [];

  setCartBefore(items: CartItem[]) {
    this.cartBefore = items;
  }

  setCartAfter(items: CartItem[]) {
    this.cartAfter = items;
  }

  getBasketSneakingFinding(): PartialFinding | null {
    if (this.cartBefore.length === 0) return null;

    const beforeIds = new Set(this.cartBefore.map(i => i.id));
    const unsolicited = this.cartAfter.filter(i => !beforeIds.has(i.id) && !i.added_by_user);

    if (unsolicited.length === 0) return null;

    return {
      pattern: "BASKET_SNEAKING",
      sub_signals: ["UNSOLICITED_ITEM"],
      confidence: 0.92,
      severity: "high",
      detection_methods: ["STATE_DIFF"],
      rule_ids: ["BS_CART_ITEM_UNSOLICITED"],
      text_snippets: unsolicited.map(i => `${i.name} (₹${i.price}) — not added by user`),
      url: window.location.href,
      page_state: "cart",
      raw_title: "Unsolicited Item Added to Cart",
    };
  }
}

// ─── Main Detection Runner ────────────────────────────────────────────────────

export interface DetectionResult {
  findings: PartialFinding[];
  price_journey?: PriceJourney;
  page_state: string;
  url: string;
  timestamp: number;
}

export function runFullDetection(
  priceTracker?: PriceJourneyTracker,
  cartTracker?: CartDiffTracker
): DetectionResult {
  const ruleFindings = runRuleEngine();
  const visualFindings = runVisualDetector();

  const allFindings = [...ruleFindings, ...visualFindings];

  // Add drip pricing finding if tracker has data
  if (priceTracker) {
    const dripFinding = priceTracker.getDripPricingFinding();
    if (dripFinding) allFindings.push(dripFinding);
  }

  // Add basket sneaking finding if cart tracker has data
  if (cartTracker) {
    const basketFinding = cartTracker.getBasketSneakingFinding();
    if (basketFinding) allFindings.push(basketFinding);
  }

  return {
    findings: allFindings,
    price_journey: priceTracker?.analyzeJourney() ?? undefined,
    page_state: classifyPageState(),
    url: window.location.href,
    timestamp: Date.now(),
  };
}
