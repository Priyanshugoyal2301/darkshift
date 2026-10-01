"""
DarkShield — Platform Adapters: Magento / Adobe Commerce
Handles Magento product pages, mini-cart modal, and checkout steps.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PlatformType, PriceCandidate
from .base import BasePlatformAdapter


class MagentoAdapter(BasePlatformAdapter):
    platform_type = PlatformType.MAGENTO

    def detect(self, html: str, url: str) -> bool:
        if not html:
            return False
        return "mage/cookies.js" in html or "text/x-magento-init" in html or "data-mage-init" in html

    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        soup = BeautifulSoup(html, "html.parser")

        special_el = soup.select_one(".special-price [data-price-amount], .special-price .price")
        if special_el:
            num = self._clean_price(special_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.96,
                    stage=stage,
                    selector=".special-price",
                    semantic_label="Magento Special Price",
                    is_mrp=False
                ))

        old_el = soup.select_one(".old-price [data-price-amount], .old-price .price")
        if old_el:
            num = self._clean_price(old_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.35,
                    stage=stage,
                    selector=".old-price",
                    semantic_label="Magento Old Price (MRP)",
                    is_mrp=True
                ))

        final_el = soup.select_one(".price-final_price [data-price-amount], .price-box .price")
        if final_el and not special_el:
            num = self._clean_price(final_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.94,
                    stage=stage,
                    selector=".price-final_price",
                    semantic_label="Magento Final Price",
                    is_mrp=False
                ))

        return candidates

    def get_add_to_cart_selectors(self) -> list[str]:
        return [
            '#product-addtocart-button',
            'button.tocart',
            'form#product_addtocart_form button[type="submit"]'
        ]

    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_subtotal = None

        if "/checkout/cart" in url or "/cart" in url:
            score += 45.0

        if not html:
            return score >= 50.0, score, observed_subtotal

        soup = BeautifulSoup(html, "html.parser")

        if soup.select(".cart-container, .block-minicart, .cart-totals"):
            score += 35.0

        subtotal_el = soup.select_one(".cart-totals .price, .subtotal .price")
        if subtotal_el:
            score += 25.0
            num = self._clean_price(subtotal_el.get_text(strip=True))
            if num:
                observed_subtotal = num

        if soup.select('[data-role="proceed-to-checkout"], .checkout-methods-items button'):
            score += 20.0

        return score >= 45.0, score, observed_subtotal

    def get_checkout_selectors(self) -> list[str]:
        return [
            '[data-role="proceed-to-checkout"]',
            '.action.primary.checkout',
            'a[href*="/checkout"]',
            'button.checkout'
        ]

    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_total = None

        if "/checkout/#shipping" in url or "/checkout/#payment" in url or "/checkout" in url:
            score += 50.0

        if not html:
            return score >= 50.0, score, observed_total

        soup = BeautifulSoup(html, "html.parser")

        if soup.select(".opc-wrapper, .checkout-index-index, .opc-block-summary"):
            score += 40.0

        total_el = soup.select_one(".grand.totals .price, .estimated-block .price")
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
