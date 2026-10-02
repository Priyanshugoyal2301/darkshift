/**
 * DarkShield — Layer 2: Web Page Analyzer
 *
 * Extracts structured, privacy-safe signals from the live DOM.
 * Runs in the content script context.
 *
 * Responsibilities:
 *  - Extract text, prices, form controls, checkboxes, CTAs, dialogs
 *  - Compute CSS prominence and geometry ratios (Interface Interference)
 *  - Detect countdown timers, scarcity/urgency text, confirm shaming
 *  - Strict privacy guard: NEVER capture passwords, credit card numbers, CVVs, or keystrokes
 */

import type {
  PricePoint,
  DOMEvidence,
  BoundingBox,
  PageStateSnapshot,
  VisualProminenceScore,
} from "@darkshield/schemas";

// ─── Currency extraction helpers ─────────────────────────────────────────────

const CURRENCY_PATTERNS = [
  /₹\s*([\d,]+(?:\.\d{1,2})?)/g,
  /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  /INR\s*([\d,]+(?:\.\d{1,2})?)/gi,
];

export function extractPricesFromText(text: string): number[] {
  const prices: number[] = [];
  for (const pattern of CURRENCY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const num = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(num) && num > 0 && num < 10000000) prices.push(num);
    }
  }
  return prices;
}

export function extractPricesFromDOM(): number[] {
  const priceSelectors = [
    "[class*='price']",
    "[class*='cost']",
    "[class*='amount']",
    "[class*='total']",
    "[id*='price']",
    "[id*='total']",
    "[itemprop='price']",
    "[data-price]",
    ".offer-price",
    ".final-price",
    ".product-price",
  ];

  const prices: number[] = [];
  const seen = new Set<number>();

  priceSelectors.forEach(sel => {
    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
      const text = el.textContent || "";
      const found = extractPricesFromText(text);
      found.forEach(p => {
        if (!seen.has(p)) {
          prices.push(p);
          seen.add(p);
        }
      });

      const dataPriceAttr = el.getAttribute("data-price");
      if (dataPriceAttr) {
        const dp = parseFloat(dataPriceAttr);
        if (!isNaN(dp) && dp > 0 && !seen.has(dp)) {
          prices.push(dp);
          seen.add(dp);
        }
      }
    });
  });

  // JSON-LD structured data
  document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent || "{}");
      if (data["@type"] === "Product" && data.offers?.price) {
        const p = parseFloat(data.offers.price);
        if (!isNaN(p) && p > 0 && !seen.has(p)) {
          prices.push(p);
          seen.add(p);
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  });

  return prices;
}

// ─── Selector Generator ───────────────────────────────────────────────────────

export function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
  if (el.getAttribute("name")) return `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;

  if (el.className && typeof el.className === "string") {
    const validClasses = el.className
      .trim()
      .split(/\s+/)
      .filter(c => c && !c.includes(":") && !c.includes("/") && !c.startsWith("darkshield-"))
      .slice(0, 2);
    if (validClasses.length > 0) {
      return `${el.tagName.toLowerCase()}.${validClasses.join(".")}`;
    }
  }

  // Parent path
  const parent = el.parentElement;
  if (parent && parent !== document.body) {
    const parentSel = parent.id ? `#${parent.id}` : parent.tagName.toLowerCase();
    const index = Array.from(parent.children).indexOf(el) + 1;
    return `${parentSel} > ${el.tagName.toLowerCase()}:nth-child(${index})`;
  }

  return el.tagName.toLowerCase();
}

// ─── Privacy Guard Helper ─────────────────────────────────────────────────────

export function isSensitiveElement(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();

    if (type === "password") return true;
    if (/cvv|cvc|card|pin|ssn|aadhaar|pan/i.test(name)) return true;
    if (/cc-|credit-card|bpay/i.test(autocomplete)) return true;
  }
  return false;
}

// ─── DOM Evidence Extractor ───────────────────────────────────────────────────

export function extractDOMEvidence(element: HTMLElement): DOMEvidence {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);

  const bbox: BoundingBox = {
    x: rect.x + window.scrollX,
    y: rect.y + window.scrollY,
    width: rect.width,
    height: rect.height,
  };

  const attributes: Record<string, string> = {};
  Array.from(element.attributes).forEach(attr => {
    // Strip sensitive attributes
    if (!/value|data-val|auth/i.test(attr.name) || !isSensitiveElement(element)) {
      attributes[attr.name] = attr.value.substring(0, 200);
    }
  });

  return {
    selector: getUniqueSelector(element),
    text_content: (element.textContent || "").trim().substring(0, 300),
    tag: element.tagName.toLowerCase(),
    attributes,
    bounding_box: bbox,
    visible:
      rect.width > 0 &&
      rect.height > 0 &&
      computed.visibility !== "hidden" &&
      computed.display !== "none" &&
      parseFloat(computed.opacity) > 0,
  };
}

// ─── Visual Prominence Analyzer ──────────────────────────────────────────────

export function computeProminenceScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const vp = { w: Math.max(window.innerWidth, 1), h: Math.max(window.innerHeight, 1) };

  const area = Math.min((rect.width * rect.height) / (vp.w * vp.h), 1);
  const fontSize = Math.min(parseFloat(computed.fontSize || "14") / 48, 1);
  const posScore = rect.top < vp.h / 2 ? 1 : 0.5;
  const visible =
    computed.visibility !== "hidden" &&
    computed.display !== "none" &&
    parseFloat(computed.opacity || "1") > 0.3
      ? 1
      : 0;

  const contrastScore = estimateContrastScore(computed);

  return (
    0.25 * area +
    0.20 * fontSize +
    0.20 * posScore +
    0.20 * visible +
    0.15 * contrastScore
  );
}

function estimateContrastScore(style: CSSStyleDeclaration): number {
  const parseLuminance = (rgb: string): number => {
    const match = rgb.match(/\d+/g);
    if (!match) return 0.5;
    const [r, g, b] = match.map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const fg = parseLuminance(style.color || "rgb(0,0,0)");
  const bg = parseLuminance(style.backgroundColor || "rgb(255,255,255)");
  return Math.min(Math.abs(fg - bg) * 2, 1);
}

export function analyzeButtonPair(
  acceptEl: HTMLElement,
  declineEl: HTMLElement
): { accept: VisualProminenceScore; decline: VisualProminenceScore; ratio: number } {
  const acceptProminence = computeProminenceScore(acceptEl);
  const declineProminence = computeProminenceScore(declineEl);
  const ratio = declineProminence > 0 ? acceptProminence / declineProminence : 99;

  const toScore = (el: HTMLElement, label: string, prominence: number): VisualProminenceScore => {
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    return {
      element_selector: getUniqueSelector(el),
      label: label.substring(0, 50),
      area_px: rect.width * rect.height,
      font_size_px: parseFloat(computed.fontSize || "14"),
      contrast_ratio: estimateContrastScore(computed) * 21,
      position_score: rect.top < window.innerHeight / 2 ? 1 : 0.5,
      visibility_score: computed.display !== "none" ? 1 : 0,
      prominence,
    };
  };

  return {
    accept: toScore(acceptEl, acceptEl.textContent?.trim() || "Accept", acceptProminence),
    decline: toScore(declineEl, declineEl.textContent?.trim() || "Decline", declineProminence),
    ratio,
  };
}

// ─── Countdown Timer Detector ─────────────────────────────────────────────────

export interface CountdownSignal {
  element: HTMLElement;
  text: string;
  selector: string;
  initial_value: string;
}

export function findCountdownTimers(): CountdownSignal[] {
  const signals: CountdownSignal[] = [];
  const timerSelectors = [
    "[class*='countdown']",
    "[class*='timer']",
    "[id*='countdown']",
    "[id*='timer']",
    "[class*='count-down']",
    "[data-countdown]",
    "[data-timer]",
    "[class*='flip-clock']",
    "[class*='tick']",
  ];

  const seen = new Set<HTMLElement>();
  timerSelectors.forEach(sel => {
    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      const text = (el.textContent || "").trim();
      if (/\d+:\d+/.test(text) || /\d+\s*(m|s|min|sec|hrs?|hours?)/i.test(text)) {
        signals.push({
          element: el,
          text,
          selector: getUniqueSelector(el),
          initial_value: text,
        });
      }
    });
  });

  return signals;
}

// ─── Pre-checked Checkbox Detector (Basket Sneaking) ──────────────────────────

export interface CheckboxSignal {
  element: HTMLInputElement;
  label_text: string;
  selector: string;
  is_optional_addon: boolean;
}

const ADDON_KEYWORDS =
  /\b(insurance|warranty|protection|subscription|donation|donate|charity|welfare|foundation|tip|add-on|addon|premium|express|gift wrap|accidental|care|guard|vip)\b/i;

export function findPreCheckedCheckboxes(): CheckboxSignal[] {
  const signals: CheckboxSignal[] = [];

  document.querySelectorAll<HTMLInputElement>("input[type='checkbox']").forEach(checkbox => {
    if (!checkbox.checked) return;

    let labelText = "";
    const id = checkbox.id;
    if (id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      if (label) labelText = label.textContent?.trim() || "";
    }
    if (!labelText) {
      const parent = checkbox.closest("label");
      if (parent) labelText = parent.textContent?.trim() || "";
    }
    if (!labelText) {
      const sibling = checkbox.nextElementSibling;
      if (sibling) labelText = sibling.textContent?.trim() || "";
    }

    // Default consent checkboxes (e.g. Terms) vs. optional add-ons
    signals.push({
      element: checkbox,
      label_text: labelText,
      selector: getUniqueSelector(checkbox),
      is_optional_addon: ADDON_KEYWORDS.test(labelText),
    });
  });

  return signals;
}

// ─── Scarcity / Urgency Text Detector ────────────────────────────────────────

export interface TextSignal {
  element: HTMLElement;
  text: string;
  selector: string;
  pattern_type: "SCARCITY" | "DEADLINE" | "SOCIAL_PROOF";
  matched_rule: string;
}

const TEXT_PATTERNS: Array<{
  pattern: RegExp;
  type: TextSignal["pattern_type"];
  rule_id: string;
}> = [
  {
    pattern: /\b(only\s+\d+\s*(left|remaining|in stock|available)|just\s+\d+\s*(left|remaining)|low\s+stock|almost\s+gone|selling\s+out|limited\s+quantity)\b/i,
    type: "SCARCITY",
    rule_id: "FU_SCARCITY_CLAIM",
  },
  {
    pattern: /\b(offer ends|sale ends|deal ends|ends (in|tonight|today|soon)|limited time|last chance|hurry|expires in|act now|don'?t miss out|selling fast|lightning deal)\b/i,
    type: "DEADLINE",
    rule_id: "FU_DEADLINE_TEXT",
  },
  {
    pattern: /\b(\d+\s*(people|users|others|customers|shoppers)\s*(are\s*)?(viewing|looking at|watching|bought|purchased|added))\b/i,
    type: "SOCIAL_PROOF",
    rule_id: "FU_SOCIAL_PROOF",
  },
];

export function findUrgencyScarcityText(): TextSignal[] {
  const signals: TextSignal[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const text = (node.textContent || "").trim();
    if (text.length < 5 || text.length > 250) continue;

    const parent = node.parentElement;
    if (!parent) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"].includes(parent.tagName)) continue;

    for (const { pattern, type, rule_id } of TEXT_PATTERNS) {
      if (pattern.test(text)) {
        signals.push({
          element: parent,
          text,
          selector: getUniqueSelector(parent),
          pattern_type: type,
          matched_rule: rule_id,
        });
        break;
      }
    }
  }

  return signals;
}

// ─── Confirm Shaming Detector ─────────────────────────────────────────────────

export interface ShamingSignal {
  element: HTMLElement;
  text: string;
  selector: string;
}

const SHAME_PATTERNS =
  /\b(no,?\s*i\s*(hate|don'?t want|don'?t like|don'?t care about)|no,?\s*i'?m\s*fine\s*without|i\s*don'?t\s*want\s+to\s+save|skip\s+savings|decline\s+protection|continue without protection|shop unprotected|i\s*don'?t\s*want\s+to\s+be\s+protected|leave my (purchase|order) unprotected|i\s*hate\s*saving\s*money|i\s*prefer\s*full\s*price)\b/i;

export function findConfirmShamingElements(): ShamingSignal[] {
  const signals: ShamingSignal[] = [];

  document.querySelectorAll<HTMLElement>("button, a, input[type='button'], input[type='submit'], label, span").forEach(el => {
    const text = (el.textContent || el.getAttribute("value") || "").trim();
    if (text.length >= 8 && text.length <= 150 && SHAME_PATTERNS.test(text)) {
      signals.push({
        element: el,
        text,
        selector: getUniqueSelector(el),
      });
    }
  });

  return signals;
}

// ─── Trick Wording / Double Negatives ─────────────────────────────────────────

export interface TrickWordingSignal {
  element: HTMLElement;
  text: string;
  selector: string;
}

const TRICK_PATTERNS =
  /\b(do not uncheck|uncheck to not|opt out of not receiving|deselect to not|untick if you don'?t|uncheck if you wish not to|do not untick)\b/i;

export function findTrickWordingElements(): TrickWordingSignal[] {
  const signals: TrickWordingSignal[] = [];

  document.querySelectorAll<HTMLElement>("label, p, span, form").forEach(el => {
    const text = (el.textContent || "").trim();
    if (text.length >= 10 && text.length <= 250 && TRICK_PATTERNS.test(text)) {
      signals.push({
        element: el,
        text,
        selector: getUniqueSelector(el),
      });
    }
  });

  return signals;
}

// ─── Subscription Trap Detector ───────────────────────────────────────────────

export interface SubscriptionTrapSignal {
  element: HTMLElement;
  text: string;
  selector: string;
}

const SUBSCRIPTION_PATTERNS =
  /\b(auto(?:matic)?[- ]recurring|recurring renewal|billed to your card|free\s+\d+[- ]day\s+trial.*(?:billed|renewal)|strict\s+no[- ]refund|mail\s+notarized|call\s+to\s+cancel|notarized\s+written\s+notice)\b/i;

export function findSubscriptionTrapElements(): SubscriptionTrapSignal[] {
  const signals: SubscriptionTrapSignal[] = [];

  document.querySelectorAll<HTMLElement>("p, span, div, li, small, label").forEach(el => {
    const text = (el.textContent || "").trim();
    if (text.length >= 15 && text.length <= 300 && SUBSCRIPTION_PATTERNS.test(text)) {
      signals.push({
        element: el,
        text,
        selector: getUniqueSelector(el),
      });
    }
  });

  return signals;
}

// ─── Sanitized Page Extractor ─────────────────────────────────────────────────

export function getSanitizedVisibleText(): string {
  // Clone body text and strip scripts/styles
  const bodyText = document.body ? document.body.innerText || "" : "";
  return bodyText.substring(0, 10000);
}

export function getSanitizedDOMSnippet(): string {
  // Extract a lightweight, clean DOM representation without scripts, forms values, or passwords
  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Remove scripts, styles, svgs, iframes
  clone.querySelectorAll("script, style, noscript, svg, iframe, canvas, meta, link").forEach(n => n.remove());

  // Redact input values
  clone.querySelectorAll("input").forEach(input => {
    if (isSensitiveElement(input)) {
      input.removeAttribute("value");
    }
  });

  return clone.innerHTML.substring(0, 150000);
}

// ─── Page State Classifier ────────────────────────────────────────────────────

export function classifyPageState(): "product" | "cart" | "checkout" | "payment" | "unknown" {
  const url = window.location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const bodyText = (document.body ? document.body.innerText : "").toLowerCase();

  if (/\/(checkout|payment|pay|billing|order)/.test(url) && /payment|card|upi|pay now|complete order/.test(bodyText)) {
    return "payment";
  }
  if (/\/(checkout|order-summary|review-order)/.test(url) || /checkout|order summary/.test(title)) {
    return "checkout";
  }
  if (/\/(cart|basket|bag|trolley)/.test(url) || /your (cart|bag|basket)/.test(title)) {
    return "cart";
  }
  if (/\/(product|item|p\/|dp\/)/.test(url) || /add to (cart|bag)/i.test(bodyText)) {
    return "product";
  }
  return "unknown";
}
