"""
DarkShield — Platform Adapters: BigCommerce
Handles BigCommerce themes (Stencil) and cart transitions.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PlatformType, PriceCandidate
from .base import BasePlatformAdapter


class BigCommerceAdapter(BasePlatformAdapter):
    platform_type = PlatformType.BIGCOMMERCE

    def detect(self, html: str, url: str) -> bool:
        if not html:
            return False
        return "cdn11.bigcommerce.com" in html or "stencil-utils" in html or "bigcommerce" in html.lower()

    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        soup = BeautifulSoup(html, "html.parser")

        price_el = soup.select_one(".price-section .price--withoutTax, .productView-price .price")
        if price_el:
            num = self._clean_price(price_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.95,
                    stage=stage,
                    selector=".price--withoutTax",
                    semantic_label="BigCommerce Product Price",
                    is_mrp=False
                ))

        return candidates

    def get_add_to_cart_selectors(self) -> list[str]:
        return [
            'input#form-action-addToCart',
            '#form-action-addToCart',
            'input[value="Add to Cart"]',
            '.productView-details [data-button-purchase]'
        ]

    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_subtotal = None

        if "/cart.php" in url or "/cart" in url:
            score += 45.0

        if not html:
            return score >= 50.0, score, observed_subtotal

        soup = BeautifulSoup(html, "html.parser")

        if soup.select(".previewCart, .cart-totals, #cart-preview-dropdown"):
            score += 35.0

        subtotal_el = soup.select_one(".cart-total-value, .cart-totals .price")
        if subtotal_el:
            score += 25.0
            num = self._clean_price(subtotal_el.get_text(strip=True))
            if num:
                observed_subtotal = num

        return score >= 45.0, score, observed_subtotal

    def get_checkout_selectors(self) -> list[str]:
        return [
            '.cart-actions a[href*="/checkout"]',
            'a[href*="/checkout.php"]',
            'a.checkout-button'
        ]

    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_total = None

        if "/checkout" in url:
            score += 50.0

        if not html:
            return score >= 50.0, score, observed_total

        soup = BeautifulSoup(html, "html.parser")

        if soup.select(".checkout-page, .optimizedCheckout-form"):
            score += 40.0

        total_el = soup.select_one(".cart-priceItem--total")
        if total_el:
            score += 30.0
            num = self._clean_price(total_el.get_text(strip=True))
            if num:
                observed_total = num

        return score >= 50.0, score, observed_total

    def _clean_price(self, text: str) -> Optional[float]:
        cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except ValueError:
            return None
