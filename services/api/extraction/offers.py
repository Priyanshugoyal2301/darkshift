"""
DarkShield — Offer & Coupon Extractor
Layer 2: Page/DOM Analysis

Extracts structured offer/coupon information from visible DOM text.
Only extracts content that is actually rendered to the user.

Rules:
- Only match text visible in the rendered DOM (passed as visible_text)
- Never fabricate an offer
- Mark all bank/membership offers as is_conditional=True
- Only mark is_applicable=True when no condition is detectable
"""

from __future__ import annotations
import re
from typing import Optional
from schemas import Offer


# ─── Pattern Bank ─────────────────────────────────────────────────────────────

# Instant/flat discount — e.g. "₹2,000 instant discount", "Flat ₹500 off"
_INSTANT_RE = re.compile(
    r"(?:flat\s+)?[₹rs\.]+\s*([\d,]+)\s*(?:instant\s+discount|off|cashback|discount)",
    re.I
)

# Percent discount — e.g. "10% instant discount", "5% cashback"
_PCT_RE = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*%\s*(?:instant\s+discount|off|cashback|back|discount)",
    re.I
)

# Bank offers — e.g. "10% off with HDFC Bank Credit Card", "₹1500 off on SBI Card"
_BANK_RE = re.compile(
    r"(?:[₹rs\.]+\s*[\d,]+|\d+\s*%)\s+off\s+(?:on|with|using)?\s*([A-Za-z\s]+(?:bank|card|credit|debit)[A-Za-z\s]*)",
    re.I
)

# Coupon codes — e.g. "Use code SAVE500", "Apply coupon DEAL200", "HDFC200"
_COUPON_RE = re.compile(
    r"(?:use\s+code|apply\s+coupon|coupon\s*(?:code)?|promo\s*code)\s*[:\-]?\s*([A-Z0-9]{4,20})",
    re.I
)

# EMI / no-cost EMI
_EMI_RE = re.compile(r"no[- ]cost\s+emi|0%\s+emi|zero[- ]cost\s+emi", re.I)

# Exchange offers — e.g. "Extra ₹10,000 off on exchange"
_EXCHANGE_RE = re.compile(
    r"(?:extra\s+)?[₹rs\.]+\s*([\d,]+)\s+off\s+(?:on\s+)?exchange",
    re.I
)

# Membership offers — e.g. "Prime members get ₹100 off", "SuperCoin reward"
_MEMBERSHIP_RE = re.compile(
    r"(prime|supercoin|plus\s+member|flipkart\s+plus|amazon\s+prime|"
    r"tata\s+neu|neu\s+coins?|payback|cred)\s+(?:member[s]?\s+)?(?:get|earn|save|extra)",
    re.I
)

# Minimum purchase condition — e.g. "on orders above ₹5,000", "min cart ₹499"
_MIN_RE = re.compile(
    r"(?:on\s+orders?\s+(?:above|over|of)|min(?:imum)?\s+(?:cart|purchase|order))\s+[₹rs\.]+\s*([\d,]+)",
    re.I
)


def _parse_amount(raw: str) -> Optional[float]:
    """Parse a number from a matched string (e.g. '2,000' → 2000.0)."""
    cleaned = raw.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_offers_from_visible_text(
    visible_text: str,
    stage: str = "product",
    source_url: str = "",
) -> list[Offer]:
    """
    Extract structured offer/coupon records from the visible text of a page.

    Args:
        visible_text: The rendered visible text of the page (not raw HTML).
        stage:        The purchase journey stage (product, cart, checkout).
        source_url:   For reference only.

    Returns:
        List of Offer instances, deduplicated by offer_text.
    """
    offers: list[Offer] = []
    seen_texts: set[str] = set()

    lines = [l.strip() for l in visible_text.splitlines() if l.strip()]

    for line in lines:
        # Skip very long lines (likely navigation/footer dumps, not offer text)
        if len(line) > 300:
            continue

        line_lower = line.lower()

        # ── No-cost EMI ──────────────────────────────────────────────────────
        if _EMI_RE.search(line):
            key = "emi:" + line[:60]
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="emi",
                    offer_title="No-cost EMI available",
                    offer_text=line[:200],
                    is_conditional=True,
                    stage_first_observed=stage,
                ))

        # ── Exchange offer ───────────────────────────────────────────────────
        exc = _EXCHANGE_RE.search(line)
        if exc:
            amount = _parse_amount(exc.group(1))
            key = f"exchange:{amount}"
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="exchange",
                    offer_title=f"Exchange offer: ₹{amount:,.0f} off" if amount else "Exchange offer",
                    offer_text=line[:200],
                    discount_value=amount,
                    is_conditional=True,
                    stage_first_observed=stage,
                ))

        # ── Bank offer ───────────────────────────────────────────────────────
        bank_m = _BANK_RE.search(line)
        if bank_m:
            # Try to extract amount/percent from same line
            inst_m = _INSTANT_RE.search(line)
            pct_m = _PCT_RE.search(line)
            amount = _parse_amount(inst_m.group(1)) if inst_m else None
            pct = float(pct_m.group(1)) if pct_m else None
            bank_name = bank_m.group(1).strip()
            key = f"bank:{bank_name.lower()}:{amount}:{pct}"
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="bank_offer",
                    offer_title=f"Bank offer: {bank_name}",
                    offer_text=line[:200],
                    bank=bank_name,
                    discount_value=amount,
                    discount_percentage=pct,
                    is_conditional=True,
                    is_applicable=False,
                    stage_first_observed=stage,
                ))
            continue  # bank offer consumed this line

        # ── Membership offer ─────────────────────────────────────────────────
        mem_m = _MEMBERSHIP_RE.search(line)
        if mem_m:
            membership = mem_m.group(1).strip()
            inst_m = _INSTANT_RE.search(line)
            amount = _parse_amount(inst_m.group(1)) if inst_m else None
            key = f"membership:{membership.lower()}:{amount}"
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="membership",
                    offer_title=f"Membership offer: {membership}",
                    offer_text=line[:200],
                    membership_requirement=membership,
                    discount_value=amount,
                    is_conditional=True,
                    is_applicable=False,
                    stage_first_observed=stage,
                ))
            continue

        # ── Coupon code ──────────────────────────────────────────────────────
        coupon_m = _COUPON_RE.search(line)
        if coupon_m:
            code = coupon_m.group(1).strip().upper()
            inst_m = _INSTANT_RE.search(line)
            pct_m = _PCT_RE.search(line)
            amount = _parse_amount(inst_m.group(1)) if inst_m else None
            pct = float(pct_m.group(1)) if pct_m else None
            key = f"coupon:{code}"
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="coupon",
                    offer_title=f"Coupon code: {code}",
                    offer_text=line[:200],
                    coupon_code=code,
                    discount_value=amount,
                    discount_percentage=pct,
                    is_conditional=True,
                    is_applicable=True,   # coupon codes are generally usable
                    stage_first_observed=stage,
                ))
            continue

        # ── Instant/flat discount (no bank/membership qualifier) ─────────────
        inst_m = _INSTANT_RE.search(line)
        pct_m = _PCT_RE.search(line)

        if inst_m and "bank" not in line_lower and "card" not in line_lower:
            amount = _parse_amount(inst_m.group(1))
            key = f"instant:{amount}"
            if key not in seen_texts:
                seen_texts.add(key)
                # Check for minimum purchase condition
                min_m = _MIN_RE.search(line)
                min_amount = _parse_amount(min_m.group(1)) if min_m else None
                offers.append(Offer(
                    offer_type="instant_discount",
                    offer_title=f"Instant discount: ₹{amount:,.0f} off" if amount else "Instant discount",
                    offer_text=line[:200],
                    discount_value=amount,
                    minimum_purchase=min_amount,
                    is_conditional=bool(min_amount),
                    is_applicable=not bool(min_amount),
                    stage_first_observed=stage,
                ))

        elif pct_m and "bank" not in line_lower and "card" not in line_lower:
            pct = float(pct_m.group(1))
            key = f"pct:{pct}"
            if key not in seen_texts:
                seen_texts.add(key)
                offers.append(Offer(
                    offer_type="instant_discount",
                    offer_title=f"{pct}% discount",
                    offer_text=line[:200],
                    discount_percentage=pct,
                    is_conditional=False,
                    is_applicable=True,
                    stage_first_observed=stage,
                ))

    return offers


def compute_effective_price(
    listed_price: float,
    mandatory_fees: float,
    offers: list[Offer],
    currency: str = "INR",
) -> dict:
    """
    Calculate effective payable price.

    Returns dict matching EffectivePrice schema fields.
    """
    applicable = sum(o.discount_value or 0 for o in offers if o.is_applicable and o.discount_value)
    conditional = sum(o.discount_value or 0 for o in offers if o.is_conditional and not o.is_applicable and o.discount_value)
    conditional_details = []
    for o in offers:
        if o.is_conditional and not o.is_applicable and o.discount_value:
            cond = []
            if o.bank:
                cond.append(o.bank)
            if o.membership_requirement:
                cond.append(o.membership_requirement)
            if o.coupon_code:
                cond.append(f"code {o.coupon_code}")
            detail = f"₹{o.discount_value:,.0f} off ({', '.join(cond) if cond else 'conditional'})"
            conditional_details.append(detail)

    effective_payable = listed_price - applicable + mandatory_fees

    note_parts = [f"Listed: ₹{listed_price:,.0f}"]
    if applicable > 0:
        note_parts.append(f"- ₹{applicable:,.0f} (applicable discount)")
    if mandatory_fees > 0:
        note_parts.append(f"+ ₹{mandatory_fees:,.0f} (mandatory fees)")
    note_parts.append(f"= ₹{effective_payable:,.0f}")

    return {
        "listed_price": listed_price,
        "mandatory_fees": mandatory_fees,
        "applicable_coupons": applicable,
        "conditional_savings": conditional,
        "conditional_savings_detail": conditional_details,
        "effective_payable": effective_payable,
        "currency": currency,
        "calculation_note": " ".join(note_parts),
    }
