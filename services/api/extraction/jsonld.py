"""
DarkShield — Extraction: JSON-LD Structured Data
Extracts Schema.org Product, Offer, and price information from <script type="application/ld+json">.
"""

from __future__ import annotations
import json
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PriceCandidate


def clean_price_val(val: any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if val > 0 else None
    if isinstance(val, str):
        cleaned = re.sub(r"[^\d.]", "", val.replace(",", ""))
        try:
            f = float(cleaned)
            return f if f > 0 else None
        except ValueError:
            return None
    return None


def extract_jsonld_candidates(html: str, target_stage: str = "product") -> tuple[list[PriceCandidate], Optional[str]]:
    """
    Parses application/ld+json blocks from HTML.
    Returns (price_candidates, product_title).
    """
    candidates: list[PriceCandidate] = []
    product_title: Optional[str] = None

    if not html:
        return candidates, product_title

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return candidates, product_title

    scripts = soup.find_all("script", type="application/ld+json")
    for script in scripts:
        raw_text = (script.string or script.get_text() or "").strip()
        if not raw_text:
            continue

        try:
            data = json.loads(raw_text)
        except Exception:
            # Handle potential non-standard JSON trailing commas or wrapped arrays
            continue

        # Items can be dict or list
        items = data if isinstance(data, list) else [data]

        for item in items:
            if not isinstance(item, dict):
                continue

            # Support @graph representation
            sub_items = item.get("@graph", []) if isinstance(item.get("@graph"), list) else [item]

            for sub in sub_items:
                if not isinstance(sub, dict):
                    continue

                obj_type = str(sub.get("@type", ""))
                if "Product" in obj_type:
                    title = sub.get("name") or sub.get("headline")
                    if title and not product_title:
                        product_title = str(title).strip()

                    offers = sub.get("offers")
                    if offers:
                        offer_list = offers if isinstance(offers, list) else [offers]
                        for off in offer_list:
                            if not isinstance(off, dict):
                                continue

                            currency = off.get("priceCurrency") or "INR"
                            
                            # Check priceSpecification for list vs sale price
                            specs = off.get("priceSpecification")
                            if isinstance(specs, list):
                                for spec in specs:
                                    if isinstance(spec, dict):
                                        spec_price = clean_price_val(spec.get("price"))
                                        spec_type = str(spec.get("priceType", ""))
                                        is_mrp = "ListPrice" in spec_type or "mrp" in spec_type.lower()
                                        if spec_price:
                                            candidates.append(PriceCandidate(
                                                amount=spec_price,
                                                currency=currency,
                                                source="json_ld",
                                                confidence=0.96 if not is_mrp else 0.4,
                                                stage=target_stage,
                                                semantic_label="JSON-LD PriceSpecification (List Price)" if is_mrp else "JSON-LD PriceSpecification (Sale Price)",
                                                is_mrp=is_mrp,
                                                belongs_to_product=True
                                            ))

                            # Direct offer price
                            raw_p = off.get("price") or off.get("lowPrice")
                            p_val = clean_price_val(raw_p)
                            if p_val:
                                candidates.append(PriceCandidate(
                                    amount=p_val,
                                    currency=currency,
                                    source="json_ld",
                                    confidence=0.95,
                                    stage=target_stage,
                                    semantic_label="JSON-LD Offer Price",
                                    is_mrp=False,
                                    belongs_to_product=True
                                ))

                elif "Offer" in obj_type:
                    raw_p = sub.get("price") or sub.get("lowPrice")
                    p_val = clean_price_val(raw_p)
                    if p_val:
                        candidates.append(PriceCandidate(
                            amount=p_val,
                            currency=sub.get("priceCurrency") or "INR",
                            source="json_ld",
                            confidence=0.92,
                            stage=target_stage,
                            semantic_label="JSON-LD Standalone Offer Price",
                            is_mrp=False,
                            belongs_to_product=True
                        ))

    return candidates, product_title
