"""
DarkShield — Stage-Aware Semantic Price Extraction Engine
Production-grade extraction following the priority hierarchy:

Stage: PRODUCT (P0)
1. JSON-LD structured data (@type == 'Product' or 'Offer', offers.price, offers.lowPrice)
2. Microdata: [itemprop="price"], meta[itemprop="price"] content
3. Semantic Sale Selectors:
   - [data-price], [data-offer-price], [data-selling-price]
   - .sale-price, .current-price, .offer-price, .deal-price, .special-price, .price-current, .final-price
4. Proximity regex on clean visible text:
   - "Offer Price: ₹X", "Deal Price: ₹X", "Special Price: ₹X", "Selling Price: ₹X", "Price: ₹X"
5. Explicit Exclusions:
   - Elements inside <s>, <del>, .strike, .mrp, .original-price, .was-price, .list-price
   - "MRP ₹X", "Original Price ₹X", "Save ₹X", "You Save ₹X", "Discount ₹X", "₹X off", "X% off", "Coupon ₹X"
   - Review counts ("1,245 reviews"), Ratings ("4.5"), EMI ("₹X/month"), dates, warranty ("1 year")

Stage: CART (P1) & CHECKOUT (P2)
1. High-priority semantic total anchors:
   - "Grand Total", "Amount Payable", "Order Total", "Total Payable", "Total Amount", "Final Total", "Net Payable", "Total:"
2. Structured summary containers:
   - #order-summary, .order-total, .cart-total, .cart-subtotal, table.total-row, [data-testid*="total"]
3. Explicit rejection of partial line items when total anchor is present.

If extraction cannot find a reliable price:
- Returns (None, components, ExtractionMetadata(source="NONE", confidence="FAILED"))
- NEVER defaults to max(all_numbers)
"""

from __future__ import annotations
import json
import re
from dataclasses import dataclass
from typing import Optional
from bs4 import BeautifulSoup, Tag
from schemas import PriceComponent


@dataclass
class ExtractionMetadata:
    source: str           # JSON_LD, MICRODATA, SEMANTIC_SELECTOR, TOTAL_ANCHOR, REGEX_PROXIMITY, FALLBACK, NONE
    confidence: str       # HIGH, MEDIUM, LOW, FAILED
    raw_snippet: Optional[str] = None
    rejected_values: list[dict] = None

    def __post_init__(self):
        if self.rejected_values is None:
            self.rejected_values = []


# ─── Regular Expressions for Semantic Price Matching ──────────────────────────

# Currency symbol or indicator: ₹, Rs., Rs, INR, followed by numbers
INR_PRICE_REGEX = re.compile(
    r'(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)',
    re.I
)

# Explicit exclusion patterns: MRP, strikethrough, savings, discounts, reviews, EMI
EXCLUSION_KEYWORDS_REGEX = re.compile(
    r'\b(mrp|m\.r\.p\.?|original price|was price|list price|strikethrough|'
    r'save|you save|savings|discount|coupon|cashback|off\b|'
    r'ratings?|reviews?|stars?|emi|per month|/month|/mo|duration|days?|hours?)\b',
    re.I
)

# Product Offer / Selling Price Anchor Regex
PRODUCT_PRICE_ANCHORS = [
    re.compile(r'(?:offer|deal|special|selling|current|now|our|sale|discounted|final)\s+price\s*[:\s-]*[₹₨]?[rs\.inr]*\s*([\d,]+(?:\.\d{1,2})?)', re.I),
    re.compile(r'(?:price|fare|rate)\s*[:\s-]*[₹₨]?[rs\.inr]*\s*([\d,]+(?:\.\d{1,2})?)', re.I),
    re.compile(r'[₹₨]\s*([\d,]+(?:\.\d{1,2})?)\s*(?:only)?', re.I),
]

# Cart & Checkout Total Anchors (highest precedence for P1 and P2)
TOTAL_PAYABLE_ANCHORS = [
    re.compile(r'(?:grand\s+total|amount\s+payable|total\s+payable|payable\s+amount|order\s+total|final\s+total|net\s+payable)\s*[:\s-]*[₹₨]?[rs\.inr]*\s*([\d,]+(?:\.\d{1,2})?)', re.I),
    re.compile(r'(?:cart\s+subtotal|cart\s+total|total\s+amount)\s*[:\s-]*[₹₨]?[rs\.inr]*\s*([\d,]+(?:\.\d{1,2})?)', re.I),
    re.compile(r'(?:^|\n|\b)total\s*[:\s-]*[₹₨]?[rs\.inr]*\s*([\d,]+(?:\.\d{1,2})?)', re.I),
]


def parse_inr_amount(raw_str: str) -> Optional[float]:
    """Cleans and parses a numeric amount string into a float, validating realistic price range."""
    if not raw_str:
        return None
    cleaned = raw_str.replace(",", "").strip()
    try:
        val = float(cleaned)
        # Realistic INR purchase transaction sanity boundary
        if 5.0 <= val <= 25_000_000.0:
            return round(val, 2)
    except ValueError:
        pass
    return None


def extract_inr_from_text(text: str) -> Optional[float]:
    """Finds the first explicit INR amount in a short text snippet."""
    for m in INR_PRICE_REGEX.finditer(text):
        num_str = m.group(1) or m.group(2)
        val = parse_inr_amount(num_str)
        if val is not None:
            return val
    return None


# ─── Stage 1: Product Price (P0) Extraction ───────────────────────────────────

def extract_product_price(soup: BeautifulSoup, text: str) -> tuple[Optional[float], ExtractionMetadata]:
    """
    Extracts advertised product price (P0) following the strict priority hierarchy.
    Explicitly rejects MRP, strikethrough, discounts, and reviews.
    """
    rejected: list[dict] = []

    # 0. Pre-scan DOM for strikethrough and MRP elements
    for el in soup.find_all(lambda tag: tag.name in ("s", "del", "strike") or _is_strikethrough_or_mrp(tag)):
        txt = el.get_text(separator=" ", strip=True)
        if txt and len(txt) < 80:
            rejected.append({"value": txt, "reason": "Element has strikethrough / MRP styling"})

    # 1. JSON-LD structured data (@type: Product / Offer)
    json_ld_price = _extract_from_json_ld(soup)
    if json_ld_price is not None:
        return json_ld_price, ExtractionMetadata(source="JSON_LD", confidence="HIGH", raw_snippet=f"JSON-LD Offer price: {json_ld_price}", rejected_values=rejected)

    # 2. Microdata itemprop="price"
    microdata_price = _extract_from_microdata(soup)
    if microdata_price is not None:
        return microdata_price, ExtractionMetadata(source="MICRODATA", confidence="HIGH", raw_snippet=f"itemprop=price: {microdata_price}", rejected_values=rejected)

    # 3. Explicit Sale/Current Price Selectors
    sale_selectors = [
        "[data-price]", "[data-offer-price]", "[data-selling-price]",
        ".sale-price", ".offer-price", ".deal-price", ".selling-price",
        ".current-price", ".price-current", ".special-price", ".product-price",
        ".fare", ".final-price"
    ]
    for sel in sale_selectors:
        for el in soup.select(sel):
            # Check if this element or parent is strikethrough or MRP
            if _is_strikethrough_or_mrp(el):
                txt = el.get_text(strip=True)
                rejected.append({"value": txt, "reason": "Element has strikethrough / MRP styling"})
                continue
            
            # Check data attributes
            for attr in ("data-price", "data-offer-price", "data-selling-price"):
                if el.has_attr(attr):
                    val = parse_inr_amount(el[attr])
                    if val:
                        return val, ExtractionMetadata(source="SEMANTIC_SELECTOR", confidence="HIGH", raw_snippet=f"{sel}[{attr}]={val}", rejected_values=rejected)

            val = extract_inr_from_text(el.get_text(separator=" ", strip=True))
            if val:
                return val, ExtractionMetadata(source="SEMANTIC_SELECTOR", confidence="HIGH", raw_snippet=f"{sel}: {val}", rejected_values=rejected)

    # 4. Contextual Proximity Regex on text
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    for line in lines:
        if len(line) > 120:
            continue
        line_lower = line.lower()

        # Reject MRP / Original / Savings lines
        if any(kw in line_lower for kw in ("mrp", "m.r.p", "original price", "was price", "save ", "you save", "discount")):
            rejected.append({"value": line[:60], "reason": "Line mentions MRP or savings"})
            continue

        for pat in PRODUCT_PRICE_ANCHORS:
            m = pat.search(line)
            if m:
                val = parse_inr_amount(m.group(1))
                if val:
                    return val, ExtractionMetadata(source="REGEX_PROXIMITY", confidence="MEDIUM", raw_snippet=line[:80], rejected_values=rejected)

    # 5. Fallback: Clean non-excluded price mention
    for line in lines:
        if len(line) > 100:
            continue
        if EXCLUSION_KEYWORDS_REGEX.search(line):
            continue
        val = extract_inr_from_text(line)
        if val is not None:
            return val, ExtractionMetadata(source="FALLBACK", confidence="LOW", raw_snippet=line[:80], rejected_values=rejected)

    return None, ExtractionMetadata(source="NONE", confidence="FAILED", rejected_values=rejected)


# ─── Stage 2 & 3: Cart (P1) & Checkout (P2) Extraction ────────────────────────

def extract_cart_checkout_price(soup: BeautifulSoup, text: str, stage: str = "cart") -> tuple[Optional[float], ExtractionMetadata]:
    """
    Extracts Cart (P1) or Checkout (P2) total.
    Prioritizes Grand Total, Amount Payable, Order Total, and summary tables.
    Never picks subtotal if Grand Total is present.
    """
    rejected: list[dict] = []

    # 1. Inspect DOM summary containers first (#order-summary, .total-row, table rows)
    summary_selectors = [
        ".total-row", ".grand-total", ".amount-payable", ".order-total",
        "#order-summary", ".order-summary", "[data-testid*='total']",
        "tr.total", "div[class*='total']"
    ]
    for sel in summary_selectors:
        for el in soup.select(sel):
            el_text = el.get_text(separator=" ", strip=True)
            if len(el_text) > 150:
                continue
            
            # Check for payable anchors inside the summary container
            for pat in TOTAL_PAYABLE_ANCHORS:
                m = pat.search(el_text)
                if m:
                    val = parse_inr_amount(m.group(1))
                    if val is not None:
                        return val, ExtractionMetadata(source="DOM_SUMMARY_CONTAINER", confidence="HIGH", raw_snippet=f"{sel}: {el_text[:80]}")

    # 2. Text line-by-line total anchor matching
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    
    # Priority 1: Grand Total / Amount Payable / Order Total
    for line in lines:
        if len(line) > 100:
            continue
        for pat in TOTAL_PAYABLE_ANCHORS[:2]:
            m = pat.search(line)
            if m:
                val = parse_inr_amount(m.group(1))
                if val is not None:
                    return val, ExtractionMetadata(source="TOTAL_ANCHOR", confidence="HIGH", raw_snippet=line[:80])

    # Priority 2: Generic "Total: ₹X"
    for line in lines:
        if len(line) > 100:
            continue
        m = TOTAL_PAYABLE_ANCHORS[2].search(line)
        if m:
            val = parse_inr_amount(m.group(1))
            if val is not None:
                return val, ExtractionMetadata(source="TOTAL_ANCHOR", confidence="MEDIUM", raw_snippet=line[:80])

    return None, ExtractionMetadata(source="NONE", confidence="FAILED", rejected_values=rejected)


# ─── Line-Item Component Extractor (Disclosed Fees & Add-ons) ─────────────────

def extract_stage_components(soup: BeautifulSoup, text: str, current_stage: str = "product") -> list[PriceComponent]:
    """
    Extracts fee components and add-ons present on the page with accurate metadata:
    - component_type (shipping, convenience_fee, protection, donation, tax)
    - is_mandatory
    - first_observed_stage
    - is_delivery_dependent
    """
    components: list[PriceComponent] = []
    seen = set()

    def add(ctype: str, label: str, amt: float, mandatory: bool, delivery_dep: bool = False):
        key = f"{ctype}-{round(amt, 2)}"
        if key not in seen and amt > 0:
            seen.add(key)
            components.append(PriceComponent(
                component_type=ctype,
                label=label,
                amount=round(amt, 2),
                is_mandatory=mandatory,
                disclosed_early=(current_stage == "product"),
                added_in_stage=current_stage,
                first_observed_stage=current_stage,
                previously_disclosed=False,
                selected_by_default=True,
                included_in_advertised_price=False,
                is_delivery_dependent=delivery_dep,
            ))

    # Look for checkbox add-ons in DOM
    for cb in soup.find_all("input", {"type": "checkbox"}):
        is_checked = cb.get("checked") is not None or cb.get("checked") == ""
        # Get label
        label_text = ""
        cb_id = cb.get("id")
        if cb_id:
            lbl = soup.find("label", {"for": cb_id})
            if lbl:
                label_text = lbl.get_text(separator=" ", strip=True)
        if not label_text and cb.parent and cb.parent.name == "label":
            label_text = cb.parent.get_text(separator=" ", strip=True)

        if label_text:
            amt = extract_inr_from_text(label_text)
            if amt:
                lbl_lower = label_text.lower()
                if any(w in lbl_lower for w in ("insurance", "warranty", "protect", "damage")):
                    add("protection", "Optional Travel/Damage Insurance", amt, False)
                elif any(w in lbl_lower for w in ("carbon", "donation", "charity", "foundation", "contribute")):
                    add("donation", "Charitable / Environmental Contribution", amt, False)
                elif any(w in lbl_lower for w in ("express", "priority", "gift wrap")):
                    add("shipping", "Priority Handling / Gift Wrap", amt, False)

    # Inspect line items in fee rows and table cells
    fee_elements = soup.find_all(lambda t: t.name in ("div", "tr", "p", "li") and (
        any(c in " ".join(t.get("class", [])) for c in ("fee", "charge", "row", "item", "breakdown")) or
        any(w in t.get_text().lower() for w in ("convenience", "platform", "delivery", "shipping", "handling", "insurance", "donation", "tax", "gst"))
    ))

    for el in fee_elements:
        el_text = el.get_text(separator=" ", strip=True)
        if len(el_text) > 180:
            continue
        amt = extract_inr_from_text(el_text)
        if not amt:
            continue
        el_lower = el_text.lower()

        if any(w in el_lower for w in ("convenience fee", "platform fee", "handling fee", "service fee", "booking fee", "gateway fee")):
            add("convenience_fee", "Convenience / Platform Fee", amt, True)
        elif any(w in el_lower for w in ("delivery", "shipping", "courier", "freight")):
            add("shipping", "Standard Delivery Charges", amt, True, delivery_dep=True)
        elif any(w in el_lower for w in ("insurance", "securetrips", "warranty")):
            add("protection", "Insurance / Warranty Add-on", amt, False)
        elif any(w in el_lower for w in ("carbon offset", "foundation", "donation", "green aviation")):
            add("donation", "Carbon / Foundation Donation", amt, False)
        elif any(w in el_lower for w in ("tax", "gst", "vat")):
            add("tax", "Taxes & Surcharges", amt, True)

    return components


# ─── Unified Semantic Extractor Entry Point ───────────────────────────────────

def extract_price_and_components(
    html: str,
    text: str,
    stage: str = "product"
) -> tuple[Optional[float], list[PriceComponent], ExtractionMetadata]:
    """
    Unified entry point for stage-aware price and component extraction.
    Returns: (total_price or None, list_of_components, extraction_metadata)
    """
    soup = BeautifulSoup(html, "html.parser")
    components = extract_stage_components(soup, text, current_stage=stage)

    if stage == "product":
        total, meta = extract_product_price(soup, text)
    else:
        total, meta = extract_cart_checkout_price(soup, text, stage=stage)

    return total, components, meta


# ─── Helper Functions ─────────────────────────────────────────────────────────

def _extract_from_json_ld(soup: BeautifulSoup) -> Optional[float]:
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                # Direct Offer or Product with offers
                offers = item.get("offers")
                if offers:
                    offer_list = offers if isinstance(offers, list) else [offers]
                    for off in offer_list:
                        if isinstance(off, dict) and "price" in off:
                            val = parse_inr_amount(str(off["price"]))
                            if val:
                                return val
                if "price" in item and (item.get("@type") in ("Offer", "Product", "AggregateOffer") or "priceCurrency" in item):
                    val = parse_inr_amount(str(item["price"]))
                    if val:
                        return val
        except Exception:
            continue
    return None


def _extract_from_microdata(soup: BeautifulSoup) -> Optional[float]:
    for el in soup.find_all(attrs={"itemprop": "price"}):
        if el.has_attr("content"):
            val = parse_inr_amount(el["content"])
            if val:
                return val
        txt = el.get_text(separator=" ", strip=True)
        val = extract_inr_from_text(txt)
        if val:
            return val
    return None


def _is_strikethrough_or_mrp(el: Tag) -> bool:
    """Checks if element or its ancestors represent strikethrough or MRP original pricing."""
    curr = el
    while curr and curr.name != "[document]":
        if curr.name in ("s", "del", "strike"):
            return True
        classes = " ".join(curr.get("class", [])).lower()
        if any(c in classes for c in ("mrp", "strike", "strikethrough", "original-price", "was-price", "old-price", "cross")):
            return True
        curr = curr.parent
    return False
