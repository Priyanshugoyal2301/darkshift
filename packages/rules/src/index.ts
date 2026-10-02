import type { CCPAPattern, PatternSubSignal, DetectionMethod } from "@darkshield/schemas";

/**
 * DarkShield Rule Definition
 *
 * Declarative rules shared between extension (TypeScript) and backend (Python via JSON).
 * Rules are the deterministic backbone of Layer 3 Detection Engine.
 *
 * IMPORTANT: Rules detect SIGNALS, not confirmed violations.
 * Every rule produces evidence; the classification layer decides the confidence.
 */

export interface RuleSignal {
  type: "dom_selector" | "text_pattern" | "attribute" | "css_property" | "price_delta" | "cart_diff" | "event";
  value: string | RegExp | number;
  description: string;
}

export interface DarkPatternRule {
  id: string;
  name: string;
  pattern: CCPAPattern;
  sub_signals: PatternSubSignal[];
  detection_methods: DetectionMethod[];
  description: string;
  signals: RuleSignal[];
  confidence_base: number;   // 0–1, base confidence if all signals fire
  severity: "low" | "medium" | "high";
  requires_state_tracking: boolean;
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  FALSE URGENCY RULES
// ─────────────────────────────────────────────────────────────────────────────

const FALSE_URGENCY_RULES: DarkPatternRule[] = [
  {
    id: "FU_COUNTDOWN_TIMER",
    name: "Countdown Timer",
    pattern: "FALSE_URGENCY",
    sub_signals: ["COUNTDOWN_TIMER"],
    detection_methods: ["DOM_RULE"],
    description: "A countdown timer is present, potentially creating artificial urgency.",
    signals: [
      {
        type: "dom_selector",
        value: "[class*='countdown'], [class*='timer'], [id*='countdown'], [id*='timer'], [class*='count-down'], [data-countdown]",
        description: "Countdown timer DOM element"
      },
      {
        type: "text_pattern",
        value: /\d{1,2}:\d{2}(:\d{2})?\s*(left|remaining|ends|expires)?/i,
        description: "Time format pattern (MM:SS or HH:MM:SS)"
      }
    ],
    confidence_base: 0.65,
    severity: "medium",
    requires_state_tracking: true, // check if timer resets on refresh
    tags: ["urgency", "time-pressure", "countdown"]
  },
  {
    id: "FU_DEADLINE_TEXT",
    name: "Deadline Language",
    pattern: "FALSE_URGENCY",
    sub_signals: ["DEADLINE_LANGUAGE"],
    detection_methods: ["DOM_RULE", "NLP_CLASSIFIER"],
    description: "Text creating artificial deadline pressure.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(offer ends|sale ends|deal ends|ends (in|tonight|today|soon)|limited time|last chance|hurry|expires in|act now|don'?t miss out|selling fast)\b/i,
        description: "Deadline urgency language"
      }
    ],
    confidence_base: 0.72,
    severity: "medium",
    requires_state_tracking: false,
    tags: ["urgency", "deadline", "language"]
  },
  {
    id: "FU_SOCIAL_PROOF",
    name: "Social Proof Pressure",
    pattern: "FALSE_URGENCY",
    sub_signals: ["SOCIAL_PROOF_PRESSURE"],
    detection_methods: ["DOM_RULE", "NLP_CLASSIFIER"],
    description: "Social pressure signals claiming other users are viewing or buying.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(\d+\s*(people|users|others|customers|shoppers)\s*(are\s*)?(viewing|looking at|watching|bought|purchased|added)|(viewed|purchased)\s*\d+\s*times?\s*(today|this hour|recently))\b/i,
        description: "Social proof pressure text"
      }
    ],
    confidence_base: 0.68,
    severity: "medium",
    requires_state_tracking: false,
    tags: ["urgency", "social-proof", "fomo"]
  },
  {
    id: "FU_SCARCITY_CLAIM",
    name: "Scarcity Claim",
    pattern: "FALSE_URGENCY",
    sub_signals: ["SCARCITY_CLAIM"],
    detection_methods: ["DOM_RULE", "NLP_CLASSIFIER"],
    description: "Low-stock or scarcity claims that may be artificially inflated.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(only\s+\d+\s*(left|remaining|in stock|available)|just\s+\d+\s*(left|remaining)|(\d+\s+)?items?\s*left|low\s+stock|almost\s+gone|selling\s+out|nearly\s+sold\s+out)\b/i,
        description: "Scarcity / low-stock language"
      },
      {
        type: "dom_selector",
        value: "[class*='stock'], [class*='scarcity'], [class*='availability'], [class*='remaining']",
        description: "Stock indicator element"
      }
    ],
    confidence_base: 0.70,
    severity: "medium",
    requires_state_tracking: true, // check if number changes across refreshes
    tags: ["scarcity", "false-urgency", "stock"]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  BASKET SNEAKING RULES
// ─────────────────────────────────────────────────────────────────────────────

const BASKET_SNEAKING_RULES: DarkPatternRule[] = [
  {
    id: "BS_PRE_TICKED_CHECKBOX",
    name: "Pre-ticked Optional Checkbox",
    pattern: "BASKET_SNEAKING",
    sub_signals: ["PRE_TICKED_CHECKBOX"],
    detection_methods: ["DOM_RULE"],
    description: "Checkboxes for optional products/services are pre-selected by default.",
    signals: [
      {
        type: "dom_selector",
        value: "input[type='checkbox'][checked], input[type='checkbox'].checked, input[type='checkbox'][data-checked]",
        description: "Pre-checked checkbox element"
      },
      {
        type: "text_pattern",
        value: /\b(insurance|warranty|protection|add-on|addon|subscription|donation|tip|guard|care|premium|express|gift wrap)\b/i,
        description: "Optional add-on near checkbox"
      }
    ],
    confidence_base: 0.85,
    severity: "high",
    requires_state_tracking: false,
    tags: ["basket-sneaking", "checkbox", "pre-selected"]
  },
  {
    id: "BS_CART_ITEM_UNSOLICITED",
    name: "Unsolicited Cart Item",
    pattern: "BASKET_SNEAKING",
    sub_signals: ["UNSOLICITED_ITEM"],
    detection_methods: ["STATE_DIFF"],
    description: "Items appeared in cart that the user did not explicitly add.",
    signals: [
      {
        type: "cart_diff",
        value: "unsolicited_item_count > 0",
        description: "Cart contains items the user did not add"
      }
    ],
    confidence_base: 0.92,
    severity: "high",
    requires_state_tracking: true,
    tags: ["basket-sneaking", "cart", "state-tracking"]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  DRIP PRICING RULES
// ─────────────────────────────────────────────────────────────────────────────

const DRIP_PRICING_RULES: DarkPatternRule[] = [
  {
    id: "DP_PRICE_INCREASE_CART",
    name: "Price Increase at Cart",
    pattern: "DRIP_PRICING",
    sub_signals: ["MANDATORY_FEE"],
    detection_methods: ["PRICE_JOURNEY"],
    description: "Total price increased between product page and cart stage.",
    signals: [
      {
        type: "price_delta",
        value: 0,  // any positive delta triggers
        description: "Price difference product→cart"
      }
    ],
    confidence_base: 0.75,
    severity: "medium",
    requires_state_tracking: true,
    tags: ["drip-pricing", "price-journey", "cart"]
  },
  {
    id: "DP_HIDDEN_FEE_CHECKOUT",
    name: "Hidden Fee at Checkout",
    pattern: "DRIP_PRICING",
    sub_signals: ["HIDDEN_FEE", "MANDATORY_FEE"],
    detection_methods: ["PRICE_JOURNEY", "DOM_RULE"],
    description: "Mandatory fees (platform fee, convenience fee, handling) appeared at checkout that were not shown on the product page.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(platform fee|convenience fee|handling fee|service fee|processing fee|gateway fee|booking fee)\b/i,
        description: "Hidden fee label at checkout"
      },
      {
        type: "price_delta",
        value: 0,
        description: "Price difference cart→checkout"
      }
    ],
    confidence_base: 0.88,
    severity: "high",
    requires_state_tracking: true,
    tags: ["drip-pricing", "hidden-fee", "checkout", "mandatory"]
  },
  {
    id: "DP_MANDATORY_SHIPPING",
    name: "Mandatory Undisclosed Shipping",
    pattern: "DRIP_PRICING",
    sub_signals: ["MANDATORY_FEE"],
    detection_methods: ["PRICE_JOURNEY", "DOM_RULE"],
    description: "Shipping fee that appeared mandatory and was not disclosed early in the purchase journey.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(shipping|delivery|freight)\s+(charge|fee|cost|price)?\s*[:₹$€]/i,
        description: "Shipping fee label"
      }
    ],
    confidence_base: 0.70,
    severity: "medium",
    requires_state_tracking: true,
    tags: ["drip-pricing", "shipping", "mandatory"]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIRM SHAMING RULES
// ─────────────────────────────────────────────────────────────────────────────

const CONFIRM_SHAMING_RULES: DarkPatternRule[] = [
  {
    id: "CS_SHAME_DECLINE",
    name: "Shame-Based Decline Option",
    pattern: "CONFIRM_SHAMING",
    sub_signals: ["SHAME_LANGUAGE"],
    detection_methods: ["NLP_CLASSIFIER", "DOM_RULE"],
    description: "The option to decline is worded to induce guilt, shame or fear.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(no,?\s*i\s*(hate|don'?t want|don'?t like|don'?t care about|don'?t need)|no,?\s*i'?m\s*(fine|good|ok(ay)?)\s*without|no,?\s*i\s*prefer\s*(paying more|to miss|to lose)|i\s*don'?t\s*want\s+(to\s+)?(save|protect|benefit|earn|get better)|skip\s+savings|decline\s+protection|i\s*don'?t\s+want\s+to\s+be\s+protected)\b/i,
        description: "Shame-inducing decline button text"
      }
    ],
    confidence_base: 0.88,
    severity: "high",
    requires_state_tracking: false,
    tags: ["confirm-shaming", "guilt", "shame", "dark-copy"]
  },
  {
    id: "CS_FEAR_BASED_COPY",
    name: "Fear-Based Copy",
    pattern: "CONFIRM_SHAMING",
    sub_signals: ["SHAME_LANGUAGE"],
    detection_methods: ["NLP_CLASSIFIER"],
    description: "Copy designed to create fear of the consequences of declining.",
    signals: [
      {
        type: "text_pattern",
        value: /\b(continue without protection|proceed without coverage|shop unprotected|at risk without|leave my (purchase|order|account) unprotected)\b/i,
        description: "Fear-based decline language"
      }
    ],
    confidence_base: 0.82,
    severity: "high",
    requires_state_tracking: false,
    tags: ["confirm-shaming", "fear", "dark-copy"]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  INTERFACE INTERFERENCE RULES
// ─────────────────────────────────────────────────────────────────────────────

const INTERFACE_INTERFERENCE_RULES: DarkPatternRule[] = [
  {
    id: "II_VISUAL_ASYMMETRY",
    name: "Visual Asymmetry Between Choices",
    pattern: "INTERFACE_INTERFERENCE",
    sub_signals: ["VISUAL_ASYMMETRY"],
    detection_methods: ["CSS_GEOMETRY"],
    description: "Significant visual prominence difference between accept/agree and decline/reject actions.",
    signals: [
      {
        type: "css_property",
        value: "prominence_ratio > 3",
        description: "Accept button ≥3× more prominent than decline"
      }
    ],
    confidence_base: 0.78,
    severity: "high",
    requires_state_tracking: false,
    tags: ["interface-interference", "visual", "asymmetry", "buttons"]
  },
  {
    id: "II_HIDDEN_ALTERNATIVE",
    name: "Hidden Alternative Action",
    pattern: "INTERFACE_INTERFERENCE",
    sub_signals: ["VISUAL_ASYMMETRY"],
    detection_methods: ["DOM_RULE", "CSS_GEOMETRY"],
    description: "An alternative action (e.g. decline, skip) is visually hidden or extremely low contrast.",
    signals: [
      {
        type: "dom_selector",
        value: "a[class*='skip'], button[class*='skip'], [class*='no-thanks'], [class*='not-now'], [class*='maybe-later']",
        description: "Skip/decline link (often styled as text, not button)"
      },
      {
        type: "css_property",
        value: "contrast_ratio < 3",
        description: "Low contrast skip/decline element"
      }
    ],
    confidence_base: 0.80,
    severity: "high",
    requires_state_tracking: false,
    tags: ["interface-interference", "hidden", "skip", "visual"]
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  ALL RULES — Combined export
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_RULES: DarkPatternRule[] = [
  ...FALSE_URGENCY_RULES,
  ...BASKET_SNEAKING_RULES,
  ...DRIP_PRICING_RULES,
  ...CONFIRM_SHAMING_RULES,
  ...INTERFACE_INTERFERENCE_RULES,
];

export const RULES_BY_PATTERN: Partial<Record<CCPAPattern, DarkPatternRule[]>> = {
  FALSE_URGENCY: FALSE_URGENCY_RULES,
  BASKET_SNEAKING: BASKET_SNEAKING_RULES,
  DRIP_PRICING: DRIP_PRICING_RULES,
  CONFIRM_SHAMING: CONFIRM_SHAMING_RULES,
  INTERFACE_INTERFERENCE: INTERFACE_INTERFERENCE_RULES,
};

export const getRuleById = (id: string): DarkPatternRule | undefined =>
  ALL_RULES.find(r => r.id === id);

export const getRulesForPattern = (pattern: CCPAPattern): DarkPatternRule[] =>
  RULES_BY_PATTERN[pattern] ?? [];

