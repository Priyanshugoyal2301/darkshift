"""
DarkShield — Platform Adapters: Generic & Indian Retail E-Commerce
Robust fallback adapter handling major Indian marketplaces and custom e-commerce engines.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PlatformType, PriceCandidate
from .base import BasePlatformAdapter


class GenericAdapter(BasePlatformAdapter):
    platform_type = PlatformType.GENERIC

    def detect(self, html: str, url: str) -> bool:
        return True # Universal fallback

    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        soup = BeautifulSoup(html, "html.parser")

        # 1. Amazon India special selectors
        amz_price = soup.select_one(".a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, span.a-price-whole")
        if amz_price:
            num = self._clean_price(amz_price.get_text(strip=True))
            if num and num > 40: # Discard single accessory/delivery numbers
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.94,
                    stage=stage,
                    selector=".a-price .a-offscreen",
                    semantic_label="Amazon Current Price",
                    is_mrp=False
                ))

        # 2. Flipkart selectors (div._30jeq3._16Jk6d or .Nx9bqj.CxhGGd)
        fk_price = soup.select_one("div._30jeq3, div.Nx9bqj, div._16Jk6d")
        if fk_price:
            num = self._clean_price(fk_price.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.94,
                    stage=stage,
                    selector=str(fk_price.get("class", ["fk-price"])),
                    semantic_label="Flipkart Selling Price",
                    is_mrp=False
                ))

        # 3. Myntra selectors (.pdp-price strong)
        myntra_price = soup.select_one(".pdp-price strong, span.pdp-offers-price")
        if myntra_price:
            num = self._clean_price(myntra_price.get_text(strip=True))
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.94,
                    stage=stage,
                    selector=".pdp-price strong",
                    semantic_label="Myntra Selling Price",
                    is_mrp=False
                ))

        return candidates

    def get_add_to_cart_selectors(self) -> list[str]:
        return [
            'button#add-to-cart-button', # Amazon
            'input#add-to-cart-button',  # Amazon
            'button._2KpZ6l._2U9uOA._3v1-ww', # Flipkart Add to Cart
            'button.pdp-add-to-bag', # Myntra
            'button[data-testid*="add-to-cart"]',
            'button[aria-label*="Add to Cart" i]',
            'button[aria-label*="Add to Bag" i]',
            'button:has-text("Add to Cart")',
            'button:has-text("Add to Bag")',
            'a:has-text("Add to Cart")'
        ]

    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_subtotal = None
        lower_url = url.lower()
        lower_text = text.lower()

        if "/cart" in lower_url or "/bag" in lower_url or "/basket" in lower_url or "-cart" in lower_url or "cart." in lower_url:
            score += 45.0

        if not html:
            return score >= 50.0, score, observed_subtotal

        soup = BeautifulSoup(html, "html.parser")

        # Cart Drawer / Modal
        if soup.select('[class*="drawer"][class*="cart" i], [class*="mini-cart" i], [id*="cart-drawer" i], [role="dialog"][aria-label*="cart" i]'):
            score += 35.0

        # Cart Header / Title
        if any(h in lower_text for h in ["your cart", "shopping cart", "shopping bag", "my bag", "cart summary"]):
            score += 25.0

        # Subtotal / Quantity
        if any(k in lower_text for k in ["subtotal", "order subtotal", "total items", "bag total"]):
            score += 20.0

        # Checkout CTA
        if any(c in lower_text for c in ["proceed to checkout", "place order", "go to checkout", "proceed to buy"]):
            score += 20.0

        # Subtotal amount search
        subtotal_match = re.search(r"(?:subtotal|total|amount payable)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.I)
        if subtotal_match:
            val = self._clean_price(subtotal_match.group(1))
            if val:
                observed_subtotal = val

        return score >= 50.0, score, observed_subtotal

    def get_checkout_selectors(self) -> list[str]:
        return [
            'input[name="proceedToRetailCheckout"]', # Amazon
            'button._2KpZ6l._2ObVJD._3AWRsL', # Flipkart Place Order
            'button:has-text("Place Order")',
            'button:has-text("Proceed to Checkout")',
            'a:has-text("Proceed to Checkout")',
            'button:has-text("Go to Checkout")',
            'a[href*="/checkout"]',
            'a[href*="/review"]'
        ]

    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_total = None
        lower_url = url.lower()
        lower_text = text.lower()

        if "/checkout" in lower_url or "/buy" in lower_url or "/review" in lower_url or "-checkout" in lower_url or "checkout." in lower_url:
            score += 45.0

        if any(kw in lower_text for kw in ["order summary", "shipping address", "delivery address", "payment options", "payment method"]):
            score += 35.0

        if any(btn in lower_text for btn in ["pay now", "make payment", "complete order", "place order and pay"]):
            score += 25.0

        total_match = re.search(r"(?:order total|amount payable|grand total|total payable)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.I)
        if total_match:
            val = self._clean_price(total_match.group(1))
            if val:
                observed_total = val

        return score >= 50.0, score, observed_total

    def _clean_price(self, text: str) -> Optional[float]:
        cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except ValueError:
            return None
