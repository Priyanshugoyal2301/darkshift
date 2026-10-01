"""
DarkShield — Python Detection Engine
Backend mirror of the TypeScript detection engine.
Used in URL audit mode (Playwright worker → FastAPI → Detection Engine).

Architecture:
  HTML/DOM string + visible text
    → Rule Engine (regex, DOM patterns)
    → NLP Classifier (text signals)
    → Price Journey Analyzer
    → Classifier (CCPA mapping + confidence)
    → Finding list
"""

from __future__ import annotations
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional
from bs4 import BeautifulSoup, Tag

from schemas import (
    CCPAPattern, Severity, DetectionMethod, PriceState,
    Finding, DOMEvidence, PricePoint, PriceJourney, FeeBreakdown,
    TransparencyScore, TransparencyDimensions, ScoreDeduction,
    ConfidenceTier, CoverageStatus, PatternCoverageItem,
    RiskAssessment, ScanCoverage, PriceComponent, PriceStage,
    DarkPatternAssessmentStatus, PriceComponentExplanation,
    ActionPolicyTier, ActionClassification,
)


# ─── Pattern metadata ─────────────────────────────────────────────────────────

PATTERN_META = {
    CCPAPattern.FALSE_URGENCY: {
        "title": "False Urgency",
        "consumer_advice": (
            "This website may be using artificial time pressure or stock scarcity "
            "to rush your decision. Take your time — genuine deals rarely disappear in minutes."
        ),
        "score_weight": 15,
        "remediation": (
            "Ensure countdown timers reflect genuine time-limited offers. "
            "Verify stock levels are accurate and updated in real time."
        ),
    },
    CCPAPattern.BASKET_SNEAKING: {
        "title": "Basket Sneaking",
        "consumer_advice": (
            "Check your cart carefully before checkout. Items or services may have "
            "been added without your explicit consent."
        ),
        "score_weight": 20,
        "remediation": (
            "Remove pre-selected optional add-ons. All additions to cart must require "
            "explicit affirmative user action."
        ),
    },
    CCPAPattern.DRIP_PRICING: {
        "title": "Drip Pricing",
        "consumer_advice": (
            "The final price shown at checkout is higher than the price initially displayed. "
            "Review the price breakdown to understand what was added."
        ),
        "score_weight": 20,
        "remediation": (
            "Display the complete price (including all mandatory fees) on the product page. "
            "Fees disclosed only at checkout may constitute drip pricing."
        ),
    },
    CCPAPattern.CONFIRM_SHAMING: {
        "title": "Confirm Shaming",
        "consumer_advice": (
            "The option to decline is worded to induce guilt or fear. "
            "You have the right to say no without being shamed."
        ),
        "score_weight": 15,
        "remediation": (
            "Rewrite decline options using neutral language. "
            "E.g., replace 'No, I hate saving money' with 'No thanks'."
        ),
    },
    CCPAPattern.INTERFACE_INTERFERENCE: {
        "title": "Interface Interference",
        "consumer_advice": (
            "The design makes it harder to choose one option over another. "
            "Look carefully for the alternative option."
        ),
        "score_weight": 15,
        "remediation": (
            "Ensure accept and decline options have comparable visual prominence. "
            "Both options should be clearly legible with adequate contrast."
        ),
    },
    CCPAPattern.TRICK_WORDING: {
        "title": "Trick Wording",
        "consumer_advice": (
            "Read options carefully. Double negatives or confusing language may "
            "cause you to opt into something you did not intend."
        ),
        "score_weight": 15,
        "remediation": "Rewrite all user-choice copy in plain, unambiguous language.",
    },
    CCPAPattern.FORCED_ACTION: {
        "title": "Forced Action",
        "consumer_advice": (
            "You are being compelled to perform an unnecessary secondary action, install an extension, "
            "or grant unrelated permissions to proceed with your transaction."
        ),
        "score_weight": 20,
        "remediation": (
            "Under CCPA Guidelines 2023 § 5(4), users cannot be forced to take unrelated actions or share extra data. "
            "Decouple all optional services from core purchase access."
        ),
    },
    CCPAPattern.SUBSCRIPTION_TRAP: {
        "title": "Subscription Trap",
        "consumer_advice": (
            "This service imposes hidden recurring charges, unclear renewal terms, or artificial cancellation barriers (roach motel). "
            "Verify cancellation options before enrolling."
        ),
        "score_weight": 20,
        "remediation": (
            "Under CCPA Guidelines 2023 § 5(5), cancellation must be as simple and immediate as enrollment. "
            "Clearly disclose auto-renewals upfront and provide 1-click self-service cancellation."
        ),
    },
}


# ─── Regex Pattern Library ────────────────────────────────────────────────────

PATTERNS = {
    # False urgency
    "COUNTDOWN_TIMER": re.compile(r'\b\d{1,2}:\d{2}(:\d{2})?\b'),
    "SCARCITY": re.compile(
        r'\b(only\s+\d+\s*(left|remaining|in stock|available)|just\s+\d+\s*(left|remaining)|'
        r'low\s+stock|almost\s+gone|selling\s+out|nearly\s+sold\s+out)\b',
        re.I
    ),
    "DEADLINE": re.compile(
        r'\b(offer ends|sale ends|deal ends|ends (in|tonight|today|soon)|'
        r'limited time|last chance|hurry|expires in|act now|don\'?t miss out|selling fast)\b',
        re.I
    ),
    "SOCIAL_PROOF": re.compile(
        r'\b\d+\s*(people|users|others|customers|shoppers)\s*(are\s*)?(viewing|watching|bought|purchased|added)\b',
        re.I
    ),
    # Basket sneaking
    "ADDON_CHECKBOX_LABEL": re.compile(
        r'\b(insurance|warranty|protection|subscription|donation|donate|charity|welfare|'
        r'contribute|contribution|foundation|tip|add-on|addon|'
        r'premium|express|gift wrap|accidental|care|guard)\b',
        re.I
    ),
    # Drip pricing fee labels
    "HIDDEN_FEE": re.compile(
        r'\b(platform fee|convenience fee|handling fee|service fee|'
        r'processing fee|gateway fee|booking fee|transaction fee)\b',
        re.I
    ),
    # Confirm shaming
    "SHAME_LANGUAGE": re.compile(
        r'\b(no,?\s*(?:thanks,?\s*)?i\s*(?:hate|don\'?t want|don\'?t like|prefer)|'
        r'no,?\s*i\'?m\s*fine\s*without|'
        r'i\s*don\'?t\s*want\s+to\s+save|skip\s+savings|decline\s+protection|'
        r'continue without protection|shop unprotected|'
        r'i\s*hate\s*saving\s*money|prefer\s*full\s*price|'
        r'i\s*don\'?t\s*want\s+to\s+be\s+protected)\b',
        re.I
    ),
    # Subscription trap
    "SUBSCRIPTION_TRAP": re.compile(
        r'\b(auto(?:matic)?[- ]recurring|recurring renewal|billed to your card|'
        r'free\s+\d+[- ]day\s+trial.*(?:billed|renewal)|strict\s+no[- ]refund|'
        r'mail\s+notarized|call\s+to\s+cancel|notarized\s+written\s+notice)\b',
        re.I
    ),
    # Forced action
    "FORCED_ACTION": re.compile(
        r'\b(must\s+install|grant\s+access\s+to\s+your\s+(?:contacts|location|storage)|'
        r'mandatory\s+download|install\s+.*extension\s+and\s+grant|required\s+to\s+share)\b',
        re.I
    ),
    # Interface interference style keywords
    "INTERFACE_TINY_FONT": re.compile(r'font-size:\s*([1-9]|10)px', re.I),
    "INTERFACE_LOW_OPACITY": re.compile(r'opacity:\s*0\.[0-3]', re.I),
    # Trick wording (double negatives)
    "DOUBLE_NEGATIVE": re.compile(
        r'\b(do not uncheck|uncheck to not|opt out of not receiving|'
        r'deselect to not|untick if you don\'?t)\b',
        re.I
    ),
    # Indian currency
    "INR_PRICE": re.compile(r'[₹₨]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr)?', re.I),
}

# CSS selectors for DOM analysis
DOM_SELECTORS = {
    "countdown": "[class*='countdown'], [class*='timer'], [id*='countdown'], [id*='timer'], [data-countdown]",
    "scarcity_el": "[class*='stock'], [class*='scarcity'], [class*='remaining'], [class*='availability']",
    "price": "[class*='price'], [class*='cost'], [class*='amount'], [class*='total'], [itemprop='price'], [data-price]",
    "checkbox": "input[type='checkbox']",
    "skip_link": "a[class*='skip'], button[class*='skip'], [class*='no-thanks'], [class*='not-now']",
}


# ─── Partial Finding ─────────────────────────────────────────────────────────

@dataclass
class PartialFinding:
    pattern: CCPAPattern
    sub_signals: list[str]
    confidence: float
    severity: Severity
    detection_methods: list[DetectionMethod]
    rule_ids: list[str]
    text_snippets: list[str] = field(default_factory=list)
    dom_evidence: list[DOMEvidence] = field(default_factory=list)
    price_journey: Optional[PriceJourney] = None
    url: str = ""
    page_state: PriceState = PriceState.UNKNOWN
    raw_title: str = ""


# ─── Rule Engine ─────────────────────────────────────────────────────────────

def run_rule_engine(soup: BeautifulSoup, text: str, url: str) -> list[PartialFinding]:
    findings: list[PartialFinding] = []
    page_state = classify_page_state(url, text)

    # ── Countdown timers ──────────────────────────────────────────────────────
    timer_els = soup.select("[class*='countdown'],[class*='timer'],[id*='countdown'],[id*='timer'],[data-countdown]")
    timer_texts = [el.get_text(strip=True) for el in timer_els if PATTERNS["COUNTDOWN_TIMER"].search(el.get_text())]

    # Also search all text nodes
    if not timer_texts:
        for el in soup.find_all(text=PATTERNS["COUNTDOWN_TIMER"]):
            timer_texts.append(str(el).strip()[:100])

    if timer_texts:
        findings.append(PartialFinding(
            pattern=CCPAPattern.FALSE_URGENCY,
            sub_signals=["COUNTDOWN_TIMER"],
            confidence=0.65,
            severity=Severity.MEDIUM,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["FU_COUNTDOWN_TIMER"],
            text_snippets=timer_texts[:3],
            url=url,
            page_state=page_state,
            raw_title="Countdown Timer Detected",
        ))

    # ── Scarcity ──────────────────────────────────────────────────────────────
    scarcity_matches = list(set(PATTERNS["SCARCITY"].findall(text)))
    if scarcity_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.FALSE_URGENCY,
            sub_signals=["SCARCITY_CLAIM"],
            confidence=0.70,
            severity=Severity.MEDIUM,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["FU_SCARCITY_CLAIM"],
            text_snippets=[str(m[0] if isinstance(m, tuple) else m) for m in scarcity_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Scarcity Signal Detected",
        ))

    # ── Deadline ──────────────────────────────────────────────────────────────
    deadline_matches = PATTERNS["DEADLINE"].findall(text)
    if deadline_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.FALSE_URGENCY,
            sub_signals=["DEADLINE_LANGUAGE"],
            confidence=0.72,
            severity=Severity.MEDIUM,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["FU_DEADLINE_TEXT"],
            text_snippets=[str(m) for m in deadline_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Deadline Language Detected",
        ))

    # ── Pre-checked checkboxes ────────────────────────────────────────────────
    for cb in soup.find_all("input", {"type": "checkbox"}):
        if cb.get("checked") is not None or cb.get("checked") == "":
            label_text = _find_label_text(soup, cb)
            if not label_text:
                continue
            # Benign opt-ins (newsletter, promotional updates) are not basket sneaking
            if re.search(r'\b(newsletter|marketing emails?|promotional updates?|updates? and offers?)\b', label_text, re.I):
                continue
            if PATTERNS["ADDON_CHECKBOX_LABEL"].search(label_text):
                findings.append(PartialFinding(
                    pattern=CCPAPattern.BASKET_SNEAKING,
                    sub_signals=["PRE_TICKED_CHECKBOX"],
                    confidence=0.85,
                    severity=Severity.HIGH,
                    detection_methods=[DetectionMethod.DOM_RULE],
                    rule_ids=["BS_PRE_TICKED_CHECKBOX"],
                    text_snippets=[label_text[:200]],
                    url=url,
                    page_state=page_state,
                    raw_title="Pre-ticked Optional Add-on Checkbox",
                ))

    # ── Confirm shaming ───────────────────────────────────────────────────────
    for el in soup.find_all(["button", "a", "label", "span", "div", "p"]):
        el_text = el.get_text(strip=True)
        if el_text and PATTERNS["SHAME_LANGUAGE"].search(el_text):
            findings.append(PartialFinding(
                pattern=CCPAPattern.CONFIRM_SHAMING,
                sub_signals=["SHAME_LANGUAGE"],
                confidence=0.88,
                severity=Severity.HIGH,
                detection_methods=[DetectionMethod.DOM_RULE],
                rule_ids=["CS_SHAME_DECLINE"],
                text_snippets=[el_text[:300]],
                url=url,
                page_state=page_state,
                raw_title="Confirm Shaming Text Detected",
            ))
            break

    # ── Interface Interference (Visual Asymmetry / Obscured Opt-outs) ──────────
    choice_elements = soup.find_all(["a", "button", "span", "div"])
    for el in choice_elements:
        style = el.get("style", "")
        el_text = el.get_text(strip=True)
        if style and (PATTERNS["INTERFACE_TINY_FONT"].search(style) or PATTERNS["INTERFACE_LOW_OPACITY"].search(style)):
            if re.search(r'\b(decline|no|skip|cancel|opt out|reject)\b', el_text, re.I) or (len(el_text) > 0 and len(el_text) < 40):
                findings.append(PartialFinding(
                    pattern=CCPAPattern.INTERFACE_INTERFERENCE,
                    sub_signals=["VISUAL_ASYMMETRY", "OBSCURED_DECLINE_OPTION"],
                    confidence=0.86,
                    severity=Severity.HIGH,
                    detection_methods=[DetectionMethod.DOM_RULE, DetectionMethod.CSS_GEOMETRY],
                    rule_ids=["II_VISUAL_ASYMMETRY"],
                    text_snippets=[f"{el_text} (style: {style})"[:300]],
                    url=url,
                    page_state=page_state,
                    raw_title="Interface Interference (Visual Asymmetry & Obscured Option)",
                ))
                break

    # ── Subscription Trap (Recurring billing / cancellation barrier) ───────────
    sub_matches = PATTERNS["SUBSCRIPTION_TRAP"].findall(text)
    if sub_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.SUBSCRIPTION_TRAP,
            sub_signals=["HIDDEN_RECURRING_BILLING", "CANCELLATION_BARRIER"],
            confidence=0.86,
            severity=Severity.HIGH,
            detection_methods=[DetectionMethod.DOM_RULE, DetectionMethod.NLP_CLASSIFIER],
            rule_ids=["ST_CANCELLATION_BARRIER"],
            text_snippets=[str(m) for m in sub_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Subscription Trap / Cancellation Barrier Detected",
        ))

    # ── Forced Action (Mandatory app download / unrelated access) ─────────────
    forced_matches = PATTERNS["FORCED_ACTION"].findall(text)
    if forced_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.FORCED_ACTION,
            sub_signals=["MANDATORY_APP_DOWNLOAD", "UNRELATED_PERMISSION"],
            confidence=0.88,
            severity=Severity.HIGH,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["FA_MANDATORY_DOWNLOAD"],
            text_snippets=[str(m) for m in forced_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Forced Action (Mandatory Download / Unrelated Permission)",
        ))

    # ── Hidden fees ───────────────────────────────────────────────────────────
    fee_matches = PATTERNS["HIDDEN_FEE"].findall(text)
    if fee_matches and page_state in (PriceState.CHECKOUT, PriceState.CART):
        findings.append(PartialFinding(
            pattern=CCPAPattern.DRIP_PRICING,
            sub_signals=["HIDDEN_FEE", "MANDATORY_FEE"],
            confidence=0.80,
            severity=Severity.HIGH,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["DP_HIDDEN_FEE_CHECKOUT"],
            text_snippets=list(set(fee_matches))[:3],
            url=url,
            page_state=page_state,
            raw_title="Hidden Mandatory Fee at Checkout",
        ))

    # ── Social proof ──────────────────────────────────────────────────────────
    social_matches = PATTERNS["SOCIAL_PROOF"].findall(text)
    if social_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.FALSE_URGENCY,
            sub_signals=["SOCIAL_PROOF_PRESSURE"],
            confidence=0.68,
            severity=Severity.MEDIUM,
            detection_methods=[DetectionMethod.DOM_RULE],
            rule_ids=["FU_SOCIAL_PROOF"],
            text_snippets=[str(m) for m in social_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Social Proof Pressure Detected",
        ))

    # ── Trick wording ─────────────────────────────────────────────────────────
    trick_matches = PATTERNS["DOUBLE_NEGATIVE"].findall(text)
    if trick_matches:
        findings.append(PartialFinding(
            pattern=CCPAPattern.TRICK_WORDING,
            sub_signals=["DOUBLE_NEGATIVE"],
            confidence=0.82,
            severity=Severity.HIGH,
            detection_methods=[DetectionMethod.DOM_RULE, DetectionMethod.NLP_CLASSIFIER],
            rule_ids=["TW_DOUBLE_NEGATIVE"],
            text_snippets=[str(m) for m in trick_matches[:3]],
            url=url,
            page_state=page_state,
            raw_title="Trick Wording (Double Negative) Detected",
        ))

    return findings


def _find_label_text(soup: BeautifulSoup, checkbox: Tag) -> str:
    cb_id = checkbox.get("id")
    if cb_id:
        label = soup.find("label", {"for": cb_id})
        if label:
            return label.get_text(separator=" ", strip=True)
    parent = checkbox.parent
    if parent and parent.name == "label":
        return parent.get_text(separator=" ", strip=True)
    sibling = checkbox.next_sibling
    if sibling:
        return str(sibling).strip()[:200]
    return ""


# ─── Price Analyzer ───────────────────────────────────────────────────────────

def extract_prices_from_text(text: str) -> list[float]:
    """Extract INR prices from text."""
    prices = []
    # Match ₹1,299 or Rs. 1299 or INR 1299
    for match in re.finditer(r'[₹₨]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr)?', text, re.I):
        raw = match.group(1).replace(",", "")
        try:
            val = float(raw)
            if 1 <= val <= 10_000_000:  # sanity range for INR prices
                prices.append(val)
        except ValueError:
            pass
    return list(set(prices))


def analyze_price_journey(snapshots: list[dict]) -> Optional[PriceJourney]:
    """Compare prices across page states to detect drip pricing."""
    if len(snapshots) < 2:
        return None

    state_prices: dict[str, float] = {}
    all_points: list[PricePoint] = []

    for snap in snapshots:
        prices = snap.get("prices", [])
        state = snap.get("state", "unknown")
        if prices:
            max_price = max(prices)
            state_prices[state] = max_price
            all_points.append(PricePoint(
                state=PriceState(state) if state in PriceState.__members__.values() else PriceState.UNKNOWN,
                amount=max_price,
                currency="INR",
                url=snap.get("url", ""),
            ))

    product_price = state_prices.get("product", 0)
    checkout_price = state_prices.get("checkout") or state_prices.get("cart") or 0

    if not product_price or not checkout_price:
        return None

    delta = checkout_price - product_price
    if delta <= 0:
        return None

    pct = round((delta / product_price) * 100, 1) if product_price else 0.0

    return PriceJourney(
        stages=[],
        initial_price=product_price,
        cart_price=state_prices.get("cart"),
        final_observed_price=checkout_price,
        delta_total=delta,
        percentage_increase=pct,
        component_explanations=[],
        new_charges=[],
        dark_pattern_assessment=DarkPatternAssessmentStatus.DETECTED,
        is_drip_pricing=True,
        potential_drip=True,
        checkout_reached="checkout" in state_prices,
        explanation=f"Price escalated from ₹{product_price:,.0f} to ₹{checkout_price:,.0f} (+₹{delta:,.0f} / +{pct}%)."
    )


# ─── Classifier ───────────────────────────────────────────────────────────────

def build_explanation(partial: PartialFinding) -> str:
    parts = []
    snippets = partial.text_snippets

    if "COUNTDOWN_TIMER" in partial.sub_signals:
        parts.append(
            f"A countdown timer was detected: '{snippets[0] if snippets else 'timer visible'}'. "
            "While time-limited offers can be genuine, unverifiable countdown timers may create artificial urgency."
        )
    if "SCARCITY_CLAIM" in partial.sub_signals:
        parts.append(
            f"A low-stock claim was found: '{snippets[0] if snippets else 'scarcity text'}'. "
            "DarkShield cannot independently verify whether this stock count is accurate."
        )
    if "DEADLINE_LANGUAGE" in partial.sub_signals:
        parts.append(
            f"Deadline-creating language was detected: '{snippets[0] if snippets else 'deadline text'}'. "
            "This type of language is designed to pressure users into quick decisions."
        )
    if "SOCIAL_PROOF_PRESSURE" in partial.sub_signals:
        parts.append(
            f"Social pressure claims detected: '{snippets[0] if snippets else 'social proof'}'. "
            "These figures are typically unverifiable by the consumer."
        )
    if "PRE_TICKED_CHECKBOX" in partial.sub_signals:
        parts.append(
            f"An optional add-on checkbox was pre-selected: '{snippets[0] if snippets else 'add-on'}'. "
            "The CCPA 2023 framework requires affirmative consent for add-ons."
        )
    if "SHAME_LANGUAGE" in partial.sub_signals:
        parts.append(
            f"The decline option uses shame-inducing language: '{snippets[0] if snippets else 'decline text'}'. "
            "Consumers have the right to decline without guilt-inducing copy."
        )
    if any(s in partial.sub_signals for s in ["MANDATORY_FEE", "HIDDEN_FEE"]):
        snippets_str = "; ".join(snippets[:2]) if snippets else "mandatory fee detected"
        parts.append(
            f"A mandatory fee appeared that was not disclosed early: {snippets_str}. "
            "Under CCPA 2023, all mandatory charges should be disclosed upfront."
        )
    if any(s in partial.sub_signals for s in ["VISUAL_ASYMMETRY", "OBSCURED_DECLINE_OPTION"]):
        parts.append(
            f"Interface interference detected: decline or alternate options are obscured with asymmetric styling or low visibility: '{snippets[0] if snippets else 'obscured option'}'. "
            "Under CCPA Guidelines 2023 § 5(6), design architecture must not impair the autonomy of consumer decision-making."
        )
    if any(s in partial.sub_signals for s in ["HIDDEN_RECURRING_BILLING", "CANCELLATION_BARRIER"]):
        parts.append(
            f"Subscription trap detected: recurring billing or barriers to cancellation were found: '{snippets[0] if snippets else 'recurring charge'}'. "
            "Under CCPA Guidelines 2023 § 5(5), cancellation must be as accessible and straightforward as subscription enrollment."
        )
    if any(s in partial.sub_signals for s in ["MANDATORY_APP_DOWNLOAD", "UNRELATED_PERMISSION"]):
        parts.append(
            f"Forced action detected: user is coerced into an unnecessary secondary action: '{snippets[0] if snippets else 'forced requirement'}'. "
            "Under CCPA Guidelines 2023 § 5(4), users cannot be forced to buy extra services or install apps to complete a basic transaction."
        )
    if "DOUBLE_NEGATIVE" in partial.sub_signals:
        parts.append(
            f"Trick wording was detected: '{snippets[0] if snippets else 'confusing copy'}'. "
            "Double negatives in opt-out language can cause users to inadvertently consent."
        )

    if not parts:
        parts.append(
            f"Evidence of potential {partial.pattern.value.replace('_', ' ').lower()} was detected on this page."
        )

    return " ".join(parts)


def classify_finding(partial: PartialFinding) -> Finding:
    meta = PATTERN_META.get(partial.pattern, {})

    # Calibrate confidence tier
    evidence_sources = [m.value for m in partial.detection_methods]
    if partial.dom_evidence:
        evidence_sources.append("DOM_SELECTORS")
    if partial.price_journey:
        evidence_sources.append("PRICE_STATE_DIFF")

    if partial.confidence >= 0.85 and len(evidence_sources) >= 2:
        tier = ConfidenceTier.HIGH
    elif partial.confidence >= 0.70 or len(evidence_sources) >= 2:
        tier = ConfidenceTier.MEDIUM
    else:
        tier = ConfidenceTier.LOW

    return Finding(
        id=f"ds-{uuid.uuid4().hex[:8]}",
        pattern=partial.pattern,
        sub_signals=partial.sub_signals,
        confidence=partial.confidence,
        confidence_tier=tier,
        evidence_sources=evidence_sources,
        severity=partial.severity,
        url=partial.url,
        page_state=partial.page_state,
        dom_evidence=partial.dom_evidence,
        price_journey=partial.price_journey,
        text_snippets=partial.text_snippets,
        detection_methods=partial.detection_methods,
        rule_ids=partial.rule_ids,
        ccpa_category=partial.pattern,
        ccpa_regulation="CCPA_DARK_PATTERNS_2023",
        title=partial.raw_title or meta.get("title", partial.pattern.value),
        explanation=build_explanation(partial),
        consumer_advice=meta.get("consumer_advice", ""),
        remediation_hint=meta.get("remediation"),
        timestamp=time.time(),
    )


# ─── Score ────────────────────────────────────────────────────────────────────

DIMENSION_PATTERNS: dict[str, list[CCPAPattern]] = {
    "price_transparency": [CCPAPattern.DRIP_PRICING, CCPAPattern.SAAS_BILLING],
    "choice_neutrality": [CCPAPattern.INTERFACE_INTERFERENCE, CCPAPattern.FORCED_ACTION, CCPAPattern.BAIT_AND_SWITCH],
    "consent_clarity": [CCPAPattern.BASKET_SNEAKING, CCPAPattern.SUBSCRIPTION_TRAP],
    "urgency_signals": [CCPAPattern.FALSE_URGENCY, CCPAPattern.NAGGING],
    "flow_transparency": [CCPAPattern.CONFIRM_SHAMING, CCPAPattern.TRICK_WORDING, CCPAPattern.DISGUISED_ADVERTISEMENT],
}


def compute_transparency_score(findings: list[Finding]) -> TransparencyScore:
    deductions: list[ScoreDeduction] = []
    dim_deductions: dict[str, int] = {k: 0 for k in DIMENSION_PATTERNS}

    for finding in findings:
        meta = PATTERN_META.get(finding.pattern, {})
        pts = round(meta.get("score_weight", 10) * finding.confidence)

        dim = "flow_transparency"
        for d, patterns in DIMENSION_PATTERNS.items():
            if finding.pattern in patterns:
                dim = d
                break

        dim_deductions[dim] = min(100, dim_deductions[dim] + pts)
        deductions.append(ScoreDeduction(
            pattern=finding.pattern,
            finding_id=finding.id,
            points_deducted=pts,
            reason=finding.title,
        ))

    dimensions = TransparencyDimensions(
        price_transparency=max(0, 100 - dim_deductions["price_transparency"]),
        choice_neutrality=max(0, 100 - dim_deductions["choice_neutrality"]),
        consent_clarity=max(0, 100 - dim_deductions["consent_clarity"]),
        urgency_signals=max(0, 100 - dim_deductions["urgency_signals"]),
        flow_transparency=max(0, 100 - dim_deductions["flow_transparency"]),
    )

    total_pts = sum(d.points_deducted for d in deductions)
    total = max(0, min(100, 100 - round(total_pts * 0.5)))

    return TransparencyScore(total=total, dimensions=dimensions, deductions=deductions)


# ─── Page State Classifier ────────────────────────────────────────────────────

def classify_page_state(url: str, text: str) -> PriceState:
    url_l = url.lower()
    text_l = text.lower()
    if any(x in url_l for x in ["/cart", "/basket", "/bag", "/trolley"]):
        return PriceState.CART
    if any(x in url_l for x in ["/checkout", "/order-summary", "/review-order"]):
        if any(x in text_l for x in ["pay now", "place order", "upi", "card number"]):
            return PriceState.PAYMENT
        return PriceState.CHECKOUT
    if any(x in url_l for x in ["/product", "/item", "/dp/", "/p/"]):
        return PriceState.PRODUCT
    if "add to cart" in text_l or "buy now" in text_l:
        return PriceState.PRODUCT
    return PriceState.UNKNOWN


# ─── Full Analysis Pipeline ───────────────────────────────────────────────────

def analyze_page(
    url: str,
    html: str,
    visible_text: str,
    price_snapshots: Optional[list[dict]] = None,
) -> tuple[list[Finding], Optional[PriceJourney]]:
    """
    Full detection pipeline for one page.
    Returns (findings, price_journey).
    """
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")
    text = visible_text or soup.get_text(separator=" ", strip=True)

    partial_findings = run_rule_engine(soup, text, url)

    # Price journey analysis
    journey: Optional[PriceJourney] = None
    if price_snapshots and len(price_snapshots) >= 2:
        journey = analyze_price_journey(price_snapshots)
        if journey:
            partial_findings.append(PartialFinding(
                pattern=CCPAPattern.DRIP_PRICING,
                sub_signals=["MANDATORY_FEE"],
                confidence=min(0.70 + journey.delta_total / 2000, 0.95),
                severity=Severity.HIGH if journey.delta_total > 200 else Severity.MEDIUM,
                detection_methods=[DetectionMethod.PRICE_JOURNEY],
                rule_ids=["DP_PRICE_INCREASE"],
                text_snippets=[
                    f"Price journey: ₹{min(p.amount for p in journey.points):.0f} → ₹{max(p.amount for p in journey.points):.0f}",
                    f"Unexplained increase: ₹{journey.delta_total:.0f}",
                ],
                url=url,
                price_journey=journey,
                raw_title="Potential Drip Pricing",
            ))

    findings = [classify_finding(pf) for pf in partial_findings]
    return findings, journey


# ─── Risk Assessment & Coverage Calculus ─────────────────────────────────────

# ─── Contextual Action Policy Classification ────────────────────────────────

def classify_action_element(
    text: str,
    tag: str = "button",
    attributes: Optional[dict[str, str]] = None,
    form_context: Optional[dict[str, any]] = None,
    current_stage: str = "product"
) -> ActionClassification:
    """
    Contextually classifies candidate action elements into SAFE, CAUTION, or BLOCKED tiers.
    Uses: action_text + href/target + DOM context + form context + current stage.
    """
    attributes = attributes or {}
    form_context = form_context or {}
    clean_text = text.strip().lower()
    href = attributes.get("href", "").lower()
    btn_type = attributes.get("type", "").lower()
    form_action = form_context.get("action", "").lower()
    form_inputs = [str(inp).lower() for inp in form_context.get("inputs", [])]

    is_payment_context = any(
        k in form_action or any(k in inp for inp in form_inputs)
        for k in ("card", "cvv", "upi", "vpa", "password", "otp", "payment", "checkout/pay")
    )

    # 1. BLOCKED: Never execute irreversible transactions or sensitive submissions
    blocked_phrases = [
        "pay now", "place order", "complete purchase", "authorize charge",
        "confirm booking", "subscribe", "confirm order", "make payment",
        "submit payment", "pay ₹", "pay rs"
    ]
    if any(p in clean_text for p in blocked_phrases):
        return ActionClassification(
            text=text,
            action_tier=ActionPolicyTier.BLOCKED,
            reason=f"Blocked: '{text}' commits irreversible financial purchase/order.",
            target_url=href,
            form_action=form_action,
            is_payment_context=True
        )

    if is_payment_context and (btn_type == "submit" or "pay" in clean_text or "order" in clean_text):
        return ActionClassification(
            text=text,
            action_tier=ActionPolicyTier.BLOCKED,
            reason="Blocked: Element submits financial payment / credential form.",
            target_url=href,
            form_action=form_action,
            is_payment_context=True
        )

    # Context-dependent "Buy Now"
    if "buy now" in clean_text:
        if current_stage in ("cart", "checkout") or is_payment_context:
            return ActionClassification(
                text=text,
                action_tier=ActionPolicyTier.BLOCKED,
                reason="Blocked: 'Buy Now' at late stages directly triggers immediate charge.",
                target_url=href,
                form_action=form_action,
                is_payment_context=True
            )
        else:
            return ActionClassification(
                text=text,
                action_tier=ActionPolicyTier.CAUTION,
                reason="Caution: 'Buy Now' on product page may initiate expedited checkout flow.",
                target_url=href,
                form_action=form_action,
                is_payment_context=False
            )

    # 2. SAFE: Reversible inspection actions adding items to basket
    safe_phrases = ["add to cart", "add to bag", "add to basket", "view cart"]
    if any(p in clean_text for p in safe_phrases) and not is_payment_context:
        return ActionClassification(
            text=text,
            action_tier=ActionPolicyTier.SAFE,
            reason=f"Approved safe action: '{text}' adds product to cart without financial commitment.",
            target_url=href,
            form_action=form_action,
            is_payment_context=False
        )

    # 3. CAUTION: Navigational transitions between purchase stages
    caution_phrases = [
        "book now", "continue booking", "proceed to checkout",
        "select seat", "select payment method", "continue",
        "proceed", "checkout", "next step", "enroll"
    ]
    if any(p in clean_text for p in caution_phrases):
        if "book now" in clean_text and current_stage in ("cart", "checkout"):
            return ActionClassification(
                text=text,
                action_tier=ActionPolicyTier.BLOCKED,
                reason="Blocked: 'Book Now' at late stage commits booking confirmation.",
                target_url=href,
                form_action=form_action,
                is_payment_context=True
            )

        return ActionClassification(
            text=text,
            action_tier=ActionPolicyTier.CAUTION,
            reason=f"Caution action: '{text}' transitions between purchase lifecycle states.",
            target_url=href,
            form_action=form_action,
            is_payment_context=False
        )

    return ActionClassification(
        text=text,
        action_tier=ActionPolicyTier.CAUTION,
        reason=f"Context-dependent action '{text}'.",
        target_url=href,
        form_action=form_action,
        is_payment_context=is_payment_context
    )


# ─── Price Journey Assessment (Separating Delta vs Explanation vs Dark Pattern) ──

def assess_price_journey(
    price_stages: list[PriceStage],
    stages_scanned: list[str]
) -> tuple[PriceJourney, list[Finding]]:
    """
    Separates:
    1. Mathematical Deltas (P0, P1, P2, delta_01, delta_12, delta_total)
       - Handles uncaptured prices (total is None) honestly without fake fallbacks
    2. Component Explanations (What caused it, disclosure stage, delivery-dependence)
    3. Dark-Pattern Assessment (Was the presentation deceptive under CCPA § 5(7)?)
       - Does NOT flag legitimate delivery charges as drip pricing!
    """
    findings: list[Finding] = []
    if not price_stages:
        return PriceJourney(
            stages=[],
            initial_price=None,
            final_observed_price=None,
            delta_total=None,
            percentage_increase=None,
            new_charges=[],
            component_explanations=[],
            dark_pattern_assessment=DarkPatternAssessmentStatus.INCONCLUSIVE,
            is_drip_pricing=False,
            checkout_reached=False,
            explanation="No pricing stages evaluated."
        ), []

    checkout_reached = "checkout" in stages_scanned

    stage_p0 = next((s for s in price_stages if s.stage == "product"), None)
    stage_p1 = next((s for s in price_stages if s.stage == "cart"), None)
    stage_p2 = next((s for s in price_stages if s.stage == "checkout"), None)

    p0 = stage_p0.total if (stage_p0 and stage_p0.is_captured) else None
    p1 = stage_p1.total if (stage_p1 and stage_p1.is_captured) else None
    p2 = stage_p2.total if (stage_p2 and stage_p2.is_captured) else None

    # Mathematical Deltas
    delta_01 = round(max(0.0, p1 - p0), 2) if (p0 is not None and p1 is not None) else None
    delta_12 = round(max(0.0, p2 - p1), 2) if (p1 is not None and p2 is not None) else None

    if p0 is not None and p2 is not None:
        delta_total = round(max(0.0, p2 - p0), 2)
        pct = round((delta_total / p0) * 100, 1) if p0 > 0 else 0.0
    elif p0 is not None and p1 is not None and p2 is None:
        delta_total = round(max(0.0, p1 - p0), 2)
        pct = round((delta_total / p0) * 100, 1) if p0 > 0 else 0.0
    else:
        delta_total = None
        pct = None

    explanations: list[PriceComponentExplanation] = []
    new_charges: list[PriceComponent] = []

    # Collect components from stages beyond product listing
    for s in price_stages[1:]:
        for c in s.components:
            new_charges.append(c)
            ctype = c.component_type.lower()
            
            # Legitimate variable delivery charges (NOT drip pricing)
            if c.is_delivery_dependent or ctype in ("shipping", "delivery"):
                explanations.append(PriceComponentExplanation(
                    component_type=c.component_type,
                    label=c.label,
                    amount=c.amount,
                    is_mandatory=True,
                    disclosure_stage=s.stage,
                    disclosed_early=True,
                    assessment_status=DarkPatternAssessmentStatus.EVALUATED_CLEAN,
                    assessment_reason=f"Standard variable delivery charge (₹{c.amount:,.0f}) disclosed upon reaching {s.stage}."
                ))
            elif ctype in ("convenience_fee", "platform_fee", "handling_fee", "mandatory_fee"):
                # Mandatory fee withheld from initial listing and not previously disclosed
                if not c.previously_disclosed:
                    explanations.append(PriceComponentExplanation(
                        component_type=c.component_type,
                        label=c.label,
                        amount=c.amount,
                        is_mandatory=True,
                        disclosure_stage=s.stage,
                        disclosed_early=False,
                        assessment_status=DarkPatternAssessmentStatus.DETECTED,
                        assessment_reason=f"Mandatory {c.label} (₹{c.amount:,.0f}) first observed at {s.stage} and not disclosed in advertised price."
                    ))
                else:
                    explanations.append(PriceComponentExplanation(
                        component_type=c.component_type,
                        label=c.label,
                        amount=c.amount,
                        is_mandatory=True,
                        disclosure_stage=s.stage,
                        disclosed_early=True,
                        assessment_status=DarkPatternAssessmentStatus.EVALUATED_CLEAN,
                        assessment_reason=f"Disclosed {c.label} (₹{c.amount:,.0f}) itemized at {s.stage}."
                    ))
            elif ctype in ("protection", "insurance", "donation", "charity"):
                # Optional add-ons
                if c.selected_by_default:
                    explanations.append(PriceComponentExplanation(
                        component_type=c.component_type,
                        label=c.label,
                        amount=c.amount,
                        is_mandatory=False,
                        disclosure_stage=s.stage,
                        disclosed_early=False,
                        assessment_status=DarkPatternAssessmentStatus.POTENTIAL_SIGNAL,
                        assessment_reason=f"Pre-selected optional {c.label} (₹{c.amount:,.0f}) added at {s.stage}."
                    ))
                else:
                    explanations.append(PriceComponentExplanation(
                        component_type=c.component_type,
                        label=c.label,
                        amount=c.amount,
                        is_mandatory=False,
                        disclosure_stage=s.stage,
                        disclosed_early=False,
                        assessment_status=DarkPatternAssessmentStatus.EVALUATED_CLEAN,
                        assessment_reason=f"Optional {c.label} (₹{c.amount:,.0f}) at {s.stage}."
                    ))
            else:
                explanations.append(PriceComponentExplanation(
                    component_type=c.component_type,
                    label=c.label,
                    amount=c.amount,
                    is_mandatory=c.is_mandatory,
                    disclosure_stage=s.stage,
                    disclosed_early=c.disclosed_early,
                    assessment_status=DarkPatternAssessmentStatus.POTENTIAL_SIGNAL,
                    assessment_reason=f"Additional fee observed at {s.stage}."
                ))

    # Check if there is unexplained price delta
    explained_sum = sum(c.amount for c in new_charges)
    if delta_total is not None and delta_total > explained_sum and delta_total > 0:
        unexplained = round(delta_total - explained_sum, 2)
        new_charges.append(PriceComponent(
            component_type="mandatory_fee",
            label="Unitemized Mandatory Price Escalation",
            amount=unexplained,
            is_mandatory=True,
            disclosed_early=False,
            added_in_stage="checkout" if checkout_reached else "cart"
        ))
        explanations.append(PriceComponentExplanation(
            component_type="mandatory_fee",
            label="Unitemized Mandatory Escalation",
            amount=unexplained,
            is_mandatory=True,
            disclosure_stage="checkout" if checkout_reached else "cart",
            disclosed_early=False,
            assessment_status=DarkPatternAssessmentStatus.DETECTED,
            assessment_reason=f"Payable total escalated by ₹{unexplained:,.0f} without line-item explanation in cart/checkout."
        ))

    # Determine Dark-Pattern Assessment
    has_deceptive_mandatory_fee = any(
        exp.assessment_status == DarkPatternAssessmentStatus.DETECTED
        for exp in explanations
    )
    has_only_legitimate_fees = (
        delta_total is not None and delta_total > 0 and not has_deceptive_mandatory_fee and
        all(exp.component_type in ("shipping", "delivery", "tax") or exp.assessment_status == DarkPatternAssessmentStatus.EVALUATED_CLEAN for exp in explanations)
    )

    if has_deceptive_mandatory_fee and delta_total is not None:
        dark_assessment = DarkPatternAssessmentStatus.DETECTED
        is_drip = True
        explanation = (
            f"Initial advertised price was ₹{p0:,.0f}. Final payable price escalated to ₹{p2 or p1:,.0f} "
            f"(+₹{delta_total:,.0f} / +{pct}%) due to mandatory fees concealed until late purchase stages (CCPA § 5(7))."
        )
        findings.append(Finding(
            pattern=CCPAPattern.DRIP_PRICING,
            confidence=0.95,
            confidence_tier=ConfidenceTier.HIGH,
            evidence_sources=["PRICE_JOURNEY", "STAGE_STATE_DIFF"],
            severity=Severity.HIGH,
            url=price_stages[-1].url,
            page_state=PriceState.CHECKOUT if checkout_reached else PriceState.CART,
            ccpa_category=CCPAPattern.DRIP_PRICING,
            ccpa_regulation="CCPA_2023_SEC_5_7",
            title=f"Drip Pricing Signal: Mandatory Surcharge Concealed Upfront (+₹{delta_total:,.0f})",
            explanation=explanation,
            consumer_advice="Inspect every itemized fee carefully before payment. Mandatory platform/convenience surcharges must be disclosed upfront in initial pricing under CCPA 2023.",
            remediation_hint="All non-optional mandatory fees must be incorporated into the initial advertised price.",
            text_snippets=[f"P0 Advertised: ₹{p0:,.0f}" if p0 is not None else "P0: UNKNOWN",
                           f"Observed Payable: ₹{p2 or p1:,.0f}" if (p2 or p1) is not None else "Payable: UNKNOWN",
                           f"Mandatory Escalation: +₹{delta_total:,.0f}"],
            detection_methods=[DetectionMethod.PRICE_JOURNEY]
        ))
    elif has_only_legitimate_fees and delta_total is not None:
        dark_assessment = DarkPatternAssessmentStatus.EVALUATED_CLEAN
        is_drip = False
        explanation = f"Price increased by ₹{delta_total:,.0f} (+{pct}%) purely due to standard variable delivery charges disclosed at cart. No deceptive drip pricing detected."
    elif not checkout_reached and (delta_total is None or delta_total == 0):
        dark_assessment = DarkPatternAssessmentStatus.INCONCLUSIVE
        is_drip = False
        explanation = "Purchase flow evaluated through product listing; final checkout review was not reached. Mandatory fee disclosure remains inconclusive."
    else:
        dark_assessment = DarkPatternAssessmentStatus.EVALUATED_CLEAN
        is_drip = False
        explanation = "All pricing elements remained constant and transparent across evaluated stages."

    journey = PriceJourney(
        stages=price_stages,
        initial_price=p0,
        cart_price=p1,
        final_observed_price=p2 or p1 or p0,
        delta_01=delta_01,
        delta_12=delta_12,
        delta_total=delta_total,
        percentage_increase=pct,
        component_explanations=explanations,
        new_charges=new_charges,
        dark_pattern_assessment=dark_assessment,
        is_drip_pricing=is_drip,
        potential_drip=is_drip,
        checkout_reached=checkout_reached,
        explanation=explanation
    )

    return journey, findings


# ─── Risk Assessment & Coverage Calculus ─────────────────────────────────────

def compute_risk_assessment(
    findings: list[Finding],
    stages_scanned: Optional[list[str]] = None,
    checks_performed: int = 14
) -> RiskAssessment:
    stages_scanned = stages_scanned or ["product"]
    checkout_reached = "checkout" in stages_scanned
    cart_reached = "cart" in stages_scanned
    coverage_sufficient = (checkout_reached or cart_reached)

    high_count = sum(1 for f in findings if f.confidence_tier == ConfidenceTier.HIGH or f.confidence >= 0.85)
    med_count = sum(1 for f in findings if f.confidence_tier == ConfidenceTier.MEDIUM or (0.65 <= f.confidence < 0.85))
    low_count = sum(1 for f in findings if f.confidence_tier == ConfidenceTier.LOW or f.confidence < 0.65)

    # Weighted risk index (0 to 100)
    risk_score = min(100, high_count * 30 + med_count * 15 + low_count * 5)

    if high_count >= 1 or risk_score >= 50:
        # High confidence violations always trigger HIGH risk
        level = "HIGH"
        summary = f"{len(findings)} potential dark patterns detected ({high_count} high-confidence violations)."
    elif med_count >= 1 or risk_score >= 20:
        level = "ELEVATED"
        summary = f"{len(findings)} potential dark pattern signals identified. Verification advised."
    elif not coverage_sufficient:
        # Insufficient coverage and 0 critical violations: UNDETERMINED (NOT "Low risk" / "Safe"!)
        level = "UNDETERMINED"
        summary = "Scan coverage incomplete (purchase flow stages not reached). Cannot verify absence of deceptive charges."
    else:
        # Sufficient coverage and 0 violations: LOW
        level = "LOW"
        summary = f"No deceptive patterns detected across {len(stages_scanned)} evaluated purchase stages."

    return RiskAssessment(
        risk_level=level,
        risk_score=risk_score,
        checks_performed=checks_performed,
        signals_found=len(findings),
        high_confidence_count=high_count,
        medium_confidence_count=med_count,
        low_confidence_count=low_count,
        coverage_sufficient=coverage_sufficient,
        summary=summary,
    )


CCPA_SECTION_MAP = {
    CCPAPattern.FALSE_URGENCY: ("False Urgency", "§ 5(1)", ["product", "cart"]),
    CCPAPattern.BASKET_SNEAKING: ("Basket Sneaking", "§ 5(2)", ["cart", "checkout"]),
    CCPAPattern.CONFIRM_SHAMING: ("Confirm Shaming", "§ 5(3)", ["product", "cart", "checkout"]),
    CCPAPattern.FORCED_ACTION: ("Forced Action", "§ 5(4)", ["cart", "checkout"]),
    CCPAPattern.SUBSCRIPTION_TRAP: ("Subscription Trap", "§ 5(5)", ["cart", "checkout"]),
    CCPAPattern.INTERFACE_INTERFERENCE: ("Interface Interference", "§ 5(6)", ["product", "cart", "checkout"]),
    CCPAPattern.DRIP_PRICING: ("Drip Pricing", "§ 5(7)", ["checkout"]),
    CCPAPattern.TRICK_WORDING: ("Trick Wording", "§ 5(8)", ["product", "cart", "checkout"]),
    CCPAPattern.NAGGING: ("Nagging", "§ 5(9)", ["product", "cart"]),
    CCPAPattern.BAIT_AND_SWITCH: ("Bait & Switch", "§ 5(10)", ["cart", "checkout"]),
    CCPAPattern.DISGUISED_ADVERTISEMENT: ("Disguised Ads", "§ 5(11)", ["product"]),
    CCPAPattern.SAAS_BILLING: ("SaaS Billing", "§ 5(12)", ["checkout"]),
    CCPAPattern.ROGUE_MALWARE: ("Rogue Malware", "§ 5(13)", ["product"]),
}


def compute_scan_coverage(stages_scanned: list[str], findings: list[Finding]) -> ScanCoverage:
    detected_patterns = {f.pattern for f in findings}
    checkout_reached = "checkout" in stages_scanned
    items: list[PatternCoverageItem] = []

    for pattern, (name, sec, required_stages) in CCPA_SECTION_MAP.items():
        if pattern in detected_patterns:
            status = CoverageStatus.DETECTED
            reason = "Potential dark pattern detected with supporting evidence."
        elif all(stage in stages_scanned for stage in required_stages):
            status = CoverageStatus.EVALUATED_CLEAN
            reason = f"Evaluated across {', '.join(stages_scanned)}; no violation indicators observed."
        else:
            status = CoverageStatus.NOT_EVALUATED
            missing = [s for s in required_stages if s not in stages_scanned]
            reason = f"Inconclusive — required purchase flow stage ({', '.join(missing)}) was not reached by scanner."

        items.append(PatternCoverageItem(
            pattern=pattern,
            pattern_name=name,
            ccpa_section=sec,
            status=status,
            reason=reason
        ))

    evaluated_count = sum(1 for i in items if i.status in (CoverageStatus.DETECTED, CoverageStatus.EVALUATED_CLEAN))
    coverage_score = round((evaluated_count / len(CCPA_SECTION_MAP)) * 100)

    return ScanCoverage(
        stages_scanned=stages_scanned,
        checkout_reached=checkout_reached,
        coverage_score=coverage_score,
        items=items
    )


# ─── Price Component Extraction (Stage-Aware Semantic Delegation) ───────────────

def extract_price_components(html: str, text: str, stage: str = "product") -> tuple[float, list[PriceComponent]]:
    """
    Stage-aware semantic price & component extractor.
    Delegates to price_extractor to guarantee:
    1. JSON-LD / itemprop="price" / semantic sale selectors for Product (P0).
    2. Grand Total / Amount Payable / summary tables for Cart (P1) & Checkout (P2).
    3. Explicit rejection of MRP, strikethrough, savings, discounts, and reviews.
    4. NEVER relies on max(all_numbers).
    """
    from price_extractor import extract_price_and_components
    total, components, _ = extract_price_and_components(html, text, stage=stage)
    return total or 0.0, components



