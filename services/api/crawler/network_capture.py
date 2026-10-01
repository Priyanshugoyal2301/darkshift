"""
DarkShield — Crawler: Network Response Interceptor & Structured JSON Capture
Captures background REST/GraphQL JSON responses to discover server-side product and price payloads.
"""

from __future__ import annotations
import json
import re
from typing import Any
from schemas import PriceCandidate


PRICE_URL_KEYWORDS = [
    "product", "products", "variant", "price", "inventory",
    "cart", "checkout", "order", "graphql", "api", "item"
]


class NetworkCapture:
    def __init__(self, max_captures: int = 40):
        self.max_captures = max_captures
        self.captured_candidates: list[PriceCandidate] = []
        self._processed_urls: set[str] = set()

    async def attach_to_page(self, page) -> None:
        """Hooks page.on('response') to intercept relevant JSON traffic."""
        page.on("response", self._handle_response)

    async def _handle_response(self, response) -> None:
        if len(self.captured_candidates) >= self.max_captures:
            return

        try:
            url = response.url
            if url in self._processed_urls:
                return

            # Check if URL looks relevant
            lower_url = url.lower()
            if not any(kw in lower_url for kw in PRICE_URL_KEYWORDS):
                return

            headers = response.headers
            ct = headers.get("content-type", "").lower()
            if not any(t in ct for t in ("application/json", "application/ld+json", "text/json")):
                return

            # Cap size
            body = await response.body()
            if len(body) > 512 * 1024:
                return

            self._processed_urls.add(url)
            data = json.loads(body.decode("utf-8", errors="replace"))
            self._scan_json(data, url)

        except Exception:
            pass

    def _scan_json(self, data: Any, response_url: str, depth: int = 0) -> None:
        if depth > 6 or data is None:
            return

        if isinstance(data, dict):
            for k, v in data.items():
                lower_k = str(k).lower().replace("_", "")

                # Skip obvious non-price keys
                if any(neg in lower_k for neg in ("mrp", "compareatprice", "strikeprice", "originalprice", "emi", "discount")):
                    continue

                if any(pos in lower_k for pos in ("sellingprice", "saleprice", "finalprice", "currentprice", "orderprice", "unitprice", "price")):
                    val = self._clean_price(v)
                    if val and 10 < val < 500000:
                        self.captured_candidates.append(PriceCandidate(
                            amount=val,
                            currency="INR",
                            source="network_json",
                            confidence=0.95,
                            stage="product",
                            response_url=response_url[:100],
                            semantic_label=f"Network JSON [{k}]",
                            is_mrp=False,
                            belongs_to_product=True
                        ))

                if isinstance(v, (dict, list)):
                    self._scan_json(v, response_url, depth + 1)

        elif isinstance(data, list):
            for item in data[:15]:
                if isinstance(item, (dict, list)):
                    self._scan_json(item, response_url, depth + 1)

    def _clean_price(self, val: Any) -> float | None:
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

    def get_candidates(self) -> list[PriceCandidate]:
        return self.captured_candidates
