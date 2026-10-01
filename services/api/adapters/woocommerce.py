"""
DarkShield — Platform Adapters: WooCommerce (WordPress)
Handles WooCommerce single product pages, cart pages, and checkout blocks.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PlatformType, PriceCandidate
from .base import BasePlatformAdapter


class WooCommerceAdapter(BasePlatformAdapter):
    platform_type = PlatformType.WOOCOMMERCE

    def detect(self, html: str, url: str) -> bool:
        if not html:
            return False
        return "woocommerce" in html.lower() or "wp-content/plugins/woocommerce" in html

    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        soup = BeautifulSoup(html, "html.parser")

        # 1. Sale price ins
        ins_el = soup.select_one("p.price ins .woocommerce-Price-amount, .summary ins .woocommerce-Price-amount")
        if ins_el:
            text = ins_el.get_text(strip=True)
            num = self._clean_price(text)
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.96,
                    stage=stage,
                    selector="ins .woocommerce-Price-amount",
                    semantic_label="WooCommerce Sale Price",
                    is_mrp=False
                ))

        # 2. Regular / Del price (del is MRP, simple is regular)
        del_el = soup.select_one("p.price del .woocommerce-Price-amount, .summary del .woocommerce-Price-amount")
        if del_el:
            num = self._clean_price(del_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.35,
                    stage=stage,
                    selector="del .woocommerce-Price-amount",
                    semantic_label="WooCommerce Regular Price (MRP)",
                    is_mrp=True
                ))

        simple_el = soup.select_one("p.price .woocommerce-Price-amount, .summary .woocommerce-Price-amount")
        if simple_el and not ins_el:
            num = self._clean_price(simple_el.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.93,
                    stage=stage,
                    selector=".woocommerce-Price-amount",
                    semantic_label="WooCommerce Product Price",
                    is_mrp=False
                ))

        return candidates

    def get_add_to_cart_selectors(self) -> list[str]:
        return [
            'button.single_add_to_cart_button',
            'button[name="add-to-cart"]',
            'form.cart button[type="submit"]',
            '.add_to_cart_button'
        ]

    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_subtotal = None

        if "/cart" in url:
            score += 45.0

        if not html:
            return score >= 50.0, score, observed_subtotal

        soup = BeautifulSoup(html, "html.parser")

        if soup.select(".woocommerce-cart, .woocommerce-cart-form, .widget_shopping_cart"):
            score += 40.0

        subtotal_el = soup.select_one(".cart-subtotal .woocommerce-Price-amount, tr.cart-subtotal td")
        if subtotal_el:
            score += 25.0
            num = self._clean_price(subtotal_el.get_text(strip=True))
            if num:
                observed_subtotal = num

        if soup.select("a.checkout-button, .wc-proceed-to-checkout a"):
            score += 20.0

        return score >= 45.0, score, observed_subtotal

    def get_checkout_selectors(self) -> list[str]:
        return [
            'a.checkout-button',
            '.wc-proceed-to-checkout a',
            'a[href*="/checkout"]',
            'button#place_order'
        ]

    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_total = None

        if "/checkout" in url:
            score += 50.0

        if not html:
            return score >= 50.0, score, observed_total

        soup = BeautifulSoup(html, "html.parser")

        if soup.select("form.woocommerce-checkout, #customer_details, #order_review"):
            score += 40.0

        total_el = soup.select_one(".order-total .woocommerce-Price-amount")
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
