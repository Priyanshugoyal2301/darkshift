/**
 * DarkShield — Layer 2: Web Page Analyzer
 *
 * Extracts structured signals from the live DOM.
 * Runs in the content script context (browser page).
 *
 * Responsibilities:
 *  - Extract all text, prices, form elements, checkboxes, buttons
 *  - Track DOM mutations (MutationObserver)
 *  - Detect price elements and compute price snapshots
 *  - Extract CSS geometry for visual analysis
 *  - Never sends raw DOM — only structured signals
 */

import type {
  PricePoint,
  DOMEvidence,
  BoundingBox,
  CartItem,
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
      if (!isNaN(num) && num > 0) prices.push(num);
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

      // Also check data-price attribute
      const dataPriceAttr = el.getAttribute("data-price");
      if (dataPriceAttr) {
        const dp = parseFloat(dataPriceAttr);
        if (!isNaN(dp) && !seen.has(dp)) {
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
        if (!isNaN(p) && !seen.has(p)) {
          prices.push(p);
          seen.add(p);
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  return prices;
}

// ─── DOM Evidence Extractor ───────────────────────────────────────────────────

export function extractDOMEvidence(element: HTMLElement): DOMEvidence {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);

  const bbox: BoundingBox = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };

  const attributes: Record<string, string> = {};
  Array.from(element.attributes).forEach(attr => {
    attributes[attr.name] = attr.value;
  });

  return {
    selector: getUniqueSelector(element),
    text_content: (element.textContent || "").trim().substring(0, 500),
    tag: element.tagName.toLowerCase(),
    attributes,
    bounding_box: bbox,
    computed_styles: {
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      fontSize: computed.fontSize,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontWeight: computed.fontWeight,
    } as Partial<CSSStyleDeclaration>,
    visible: rect.width > 0 && rect.height > 0 &&
      computed.visibility !== "hidden" &&
      computed.display !== "none" &&
      parseFloat(computed.opacity) > 0,
  };
}

function getUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
    if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
  }
  return el.tagName.toLowerCase();
}

// ─── Visual Prominence Analyzer ──────────────────────────────────────────────

export function computeProminenceScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const vp = { w: window.innerWidth, h: window.innerHeight };

  // Normalize area (0–1)
  const area = Math.min((rect.width * rect.height) / (vp.w * vp.h), 1);

  // Font size (0–1, max at 48px)
  const fontSize = Math.min(parseFloat(computed.fontSize) / 48, 1);

  // Vertical position prominence (top half = more prominent)
  const posScore = rect.top < vp.h / 2 ? 1 : 0.5;

  // Visibility
  const visible =
    computed.visibility !== "hidden" &&
    computed.display !== "none" &&
    parseFloat(computed.opacity) > 0.3
      ? 1
      : 0;

  // Contrast (rough heuristic from background vs. text color)
  const contrastScore = estimateContrastScore(computed);

  // Weighted composite (based on Interface Interference detection formula)
  return (
    0.25 * area +
    0.20 * fontSize +
    0.20 * posScore +
    0.20 * visible +
    0.15 * contrastScore
  );
}

function estimateContrastScore(style: CSSStyleDeclaration): number {
  // Parse rgb/rgba values (simplified heuristic)
  const parseLuminance = (rgb: string): number => {
    const match = rgb.match(/\d+/g);
    if (!match) return 0.5;
    const [r, g, b] = match.map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const fg = parseLuminance(style.color);
  const bg = parseLuminance(style.backgroundColor);
  const diff = Math.abs(fg - bg);
  return Math.min(diff * 2, 1);
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
      label,
      area_px: rect.width * rect.height,
      font_size_px: parseFloat(computed.fontSize),
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
      if (/\d+:\d+/.test(text)) {
        signals.push({
          element: el,
          text,
          selector: getUniqueSelector(el),
          initial_value: text,
        });
      }
    });
  });

  // Also search all elements for time-format text
  document.querySelectorAll<HTMLElement>("span, p, div, h1, h2, h3, h4, strong").forEach(el => {
    if (seen.has(el)) return;
    const text = (el.textContent || "").trim();
    const match = text.match(/^(\d{1,2}:\d{2}(:\d{2})?)$/);
    if (match) {
      seen.add(el);
      signals.push({
        element: el,
        text,
        selector: getUniqueSelector(el),
        initial_value: match[0],
      });
    }
  });

  return signals;
}

// ─── Pre-checked Checkbox Detector ───────────────────────────────────────────

export interface CheckboxSignal {
  element: HTMLInputElement;
  label_text: string;
  selector: string;
  is_optional_addon: boolean;
}

const ADDON_KEYWORDS =
  /\b(insurance|warranty|protection|subscription|donation|add-on|addon|premium|express|gift wrap|accidental|care|guard)\b/i;

export function findPreCheckedCheckboxes(): CheckboxSignal[] {
  const signals: CheckboxSignal[] = [];

  document.querySelectorAll<HTMLInputElement>("input[type='checkbox']").forEach(checkbox => {
    if (!checkbox.checked) return;

    // Find associated label
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
    pattern: /\b(only\s+\d+\s*(left|remaining|in stock|available)|just\s+\d+\s*(left|remaining)|low\s+stock|almost\s+gone|selling\s+out)\b/i,
    type: "SCARCITY",
    rule_id: "FU_SCARCITY_CLAIM",
  },
  {
    pattern: /\b(offer ends|sale ends|deal ends|ends (in|tonight|today|soon)|limited time|last chance|hurry|expires in|act now|don'?t miss out|selling fast)\b/i,
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
    if (text.length < 5) continue;

    const parent = node.parentElement;
    if (!parent) continue;
    if (["SCRIPT", "STYLE", "META"].includes(parent.tagName)) continue;

    for (const { pattern, type, rule_id } of TEXT_PATTERNS) {
      if (pattern.test(text)) {
        signals.push({
          element: parent,
          text: text.substring(0, 200),
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
  /\b(no,?\s*i\s*(hate|don'?t want|don'?t like|don'?t care about)|no,?\s*i'?m\s*fine\s*without|i\s*don'?t\s*want\s+to\s+save|skip\s+savings|decline\s+protection|continue without protection|shop unprotected|i\s*don'?t\s*want\s+to\s+be\s+protected|leave my (purchase|order) unprotected)\b/i;

export function findConfirmShamingElements(): ShamingSignal[] {
  const signals: ShamingSignal[] = [];

  document.querySelectorAll<HTMLElement>("button, a, input[type='button'], input[type='submit'], label").forEach(el => {
    const text = (el.textContent || el.getAttribute("value") || "").trim();
    if (SHAME_PATTERNS.test(text)) {
      signals.push({
        element: el,
        text: text.substring(0, 300),
        selector: getUniqueSelector(el),
      });
    }
  });

  return signals;
}

// ─── Page State Snapshot ──────────────────────────────────────────────────────

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function capturePageState(pageState: "product" | "cart" | "checkout" | "payment" | "unknown"): PageStateSnapshot {
  const prices = extractPricesFromDOM().map<PricePoint>(amount => ({
    state: pageState,
    amount,
    currency: "INR",
    url: window.location.href,
    timestamp: Date.now(),
  }));

  const visibleText = (document.body.innerText || "").substring(0, 2000);

  return {
    url: window.location.href,
    title: document.title,
    dom_hash: hashString(document.body.innerHTML.substring(0, 5000)),
    prices,
    visible_text_excerpt: visibleText,
    timestamp: Date.now(),
  };
}

// ─── Page State Classifier ────────────────────────────────────────────────────

export function classifyPageState(): "product" | "cart" | "checkout" | "payment" | "unknown" {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const h1 = document.querySelector("h1")?.textContent?.toLowerCase() || "";

  if (/\/(cart|basket|bag|trolley)/.test(url) || /your (cart|bag|basket)/.test(title + h1))
    return "cart";
  if (/\/(checkout|payment|pay|billing|order)/.test(url) && /payment|card|upi|pay now/.test(document.body.innerText.toLowerCase()))
    return "payment";
  if (/\/(checkout|order-summary|review-order)/.test(url) || /checkout/.test(title))
    return "checkout";
  if (/\/(product|item|p\/|dp\/)/.test(url) || /add to cart/i.test(document.body.innerText))
    return "product";
  return "unknown";
}
