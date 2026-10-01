"""
DarkShield — Extraction: Hydration & Embedded State
Parses __NEXT_DATA__, __INITIAL_STATE__, __PRELOADED_STATE__, __APOLLO_STATE__,
and Shopify embedded ProductJson scripts.
"""

from __future__ import annotations
import json
import re
from typing import Any, Optional
from bs4 import BeautifulSoup
from schemas import PriceCandidate


def clean_num(val: Any) -> Optional[float]:
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


class HydrationExtractor:
    def __init__(self):
        # Scoring weights for keys
        self.priority_keys = {
            "order.total": (110, "Order Total"),
            "cart.total": (100, "Cart Total"),
            "sellingprice": (95, "Selling Price"),
            "saleprice": (90, "Sale Price"),
            "finalprice": (90, "Final Payable Price"),
            "currentprice": (88, "Current Price"),
            "specialprice": (85, "Special Offer Price"),
            "price": (80, "Product Price"),
            "amount": (75, "Amount"),
        }

        self.negative_keys = {
            "mrp": (-100, "MRP / Strike-through"),
            "compareatprice": (-100, "Compare-at Price"),
            "compare_at_price": (-100, "Compare-at Price"),
            "originalprice": (-95, "Original List Price"),
            "strikeprice": (-95, "Strike Price"),
            "regularprice": (-80, "Regular List Price"),
            "emi": (-90, "EMI Monthly Option"),
            "discount": (-60, "Discount Amount"),
            "savings": (-60, "Savings Amount"),
            "shipping": (-40, "Shipping Fee Component"),
        }

    def extract(self, html: str, target_stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            return candidates

        # 1. __NEXT_DATA__
        next_script = soup.find("script", id="__NEXT_DATA__")
        if next_script and next_script.string:
            try:
                next_data = json.loads(next_script.string)
                candidates.extend(self._scan_object(next_data, "next_data", target_stage))
            except Exception:
                pass

        # 2. Shopify ProductJson scripts
        shopify_scripts = soup.find_all("script", id=re.compile(r"ProductJson|product-json", re.I))
        for s in shopify_scripts:
            text = (s.string or s.get_text() or "").strip()
            if text:
                try:
                    p_data = json.loads(text)
                    candidates.extend(self._scan_object(p_data, "shopify_embedded", target_stage))
                except Exception:
                    pass

        # 3. Global window.__INITIAL_STATE__ / __PRELOADED_STATE__ via regex on script contents
        inline_scripts = soup.find_all("script")
        for s in inline_scripts:
            # Skip external scripts
            if s.get("src"):
                continue
            text = s.string or s.get_text() or ""
            if not text or len(text) < 20:
                continue

            # Look for window.__INITIAL_STATE__ = { ... }
            match = re.search(r"window\.(?:__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__)\s*=\s*(\{.*?\});\s*(?:window|\n|<)", text, re.DOTALL)
            if match:
                raw_json = match.group(1)
                try:
                    state_data = json.loads(raw_json)
                    candidates.extend(self._scan_object(state_data, "window_hydration_state", target_stage))
                except Exception:
                    pass

        return candidates

    def _scan_object(self, obj: Any, source_name: str, stage: str, depth: int = 0) -> list[PriceCandidate]:
        results: list[PriceCandidate] = []
        if depth > 7 or obj is None:
            return results

        if isinstance(obj, dict):
            # Check for direct price / compare_at_price combinations
            for key, val in obj.items():
                lower_key = str(key).lower().replace("_", "")
                
                # Check negative keys
                if any(neg in lower_key for neg in self.negative_keys):
                    num = clean_num(val)
                    if num:
                        label = next(self.negative_keys[n][1] for n in self.negative_keys if n in lower_key)
                        results.append(PriceCandidate(
                            amount=num,
                            currency="INR",
                            source=source_name,
                            confidence=0.3,
                            stage=stage,
                            semantic_label=f"Hydration ({label})",
                            is_mrp=True,
                            belongs_to_product=True
                        ))
                    continue

                # Check positive keys
                matched_pos = next((k for k in self.priority_keys if k in lower_key), None)
                if matched_pos:
                    num = clean_num(val)
                    if num:
                        score, label = self.priority_keys[matched_pos]
                        
                        # Shopify prices can be in paise (e.g. 199900 for 1999.00)
                        if num > 10000 and num % 100 == 0 and "shopify" in source_name:
                            # Might be paise/cents representation
                            adjusted_num = num / 100.0
                        else:
                            adjusted_num = num

                        confidence = min(0.95, max(0.5, score / 120.0))
                        results.append(PriceCandidate(
                            amount=adjusted_num,
                            currency="INR",
                            source=source_name,
                            confidence=confidence,
                            stage=stage,
                            semantic_label=f"Hydration {label} [{key}]",
                            is_mrp=False,
                            belongs_to_product=True
                        ))

                # Recurse
                if isinstance(val, (dict, list)):
                    results.extend(self._scan_object(val, source_name, stage, depth + 1))

        elif isinstance(obj, list):
            for item in obj[:20]: # Cap iteration to avoid unbounded trees
                if isinstance(item, (dict, list)):
                    results.extend(self._scan_object(item, source_name, stage, depth + 1))

        return results
