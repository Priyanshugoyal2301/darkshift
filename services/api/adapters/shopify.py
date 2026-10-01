"""
DarkShield — Platform Adapters: Shopify
Handles Shopify themes (Dawn, Debut, custom), cart drawers, and checkout transitions.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup
from schemas import PlatformType, PriceCandidate
from .base import BasePlatformAdapter


class ShopifyAdapter(BasePlatformAdapter):
    platform_type = PlatformType.SHOPIFY

    def detect(self, html: str, url: str) -> bool:
        if not html:
            return False
        if "myshopify.com" in url or "/collections/" in url or "/products/" in url:
            if "shopify" in html.lower() or "cdn.shopify.com" in html:
                return True
        return "cdn.shopify.com" in html or "window.Shopify" in html or 'name="shopify-features"' in html

    def extract_candidates(self, html: str, url: str, stage: str = "product") -> list[PriceCandidate]:
        candidates: list[PriceCandidate] = []
        if not html:
            return candidates

        soup = BeautifulSoup(html, "html.parser")

        # 1. Sale price in Dawn/Impact/modern themes
        sale_el = soup.select_one(
            ".price-item--sale, .price__sale .price-item, .product__price--sale, "
            ".price--highlight, span.price--highlight, .price-list span.price:not(.price--compare)"
        )
        if sale_el:
            text = sale_el.get_text(strip=True)
            num = self._clean_price(text)
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.96,
                    stage=stage,
                    selector=sale_el.name + ("." + ".".join(sale_el.get("class", [])) if sale_el.get("class") else ""),
                    semantic_label="Shopify Sale Price",
                    is_mrp=False
                ))

        # 2. Compare-at price (MRP strikethrough)
        compare_el = soup.select_one(".price--compare, del .price, .price__compare-at, s.price-item--regular")
        if compare_el:
            c_text = compare_el.get_text(strip=True)
            c_num = self._clean_price(c_text)
            if c_num:
                candidates.append(PriceCandidate(
                    amount=c_num,
                    currency="INR",
                    source="adapter",
                    confidence=0.35,
                    stage=stage,
                    selector=".price--compare",
                    semantic_label="Shopify Compare At Price (MRP)",
                    is_mrp=True
                ))

        # 3. Regular price (might be MRP if sale exists, or single price)
        reg_el = soup.select_one(".price-item--regular, .price__regular .price-item, span.product-price")
        if reg_el:
            text = reg_el.get_text(strip=True)
            num = self._clean_price(text)
            if num:
                is_mrp = bool(sale_el) # If sale element exists, regular price is MRP strike-through
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.35 if is_mrp else 0.94,
                    stage=stage,
                    selector=".price-item--regular",
                    semantic_label="Shopify List Price (MRP)" if is_mrp else "Shopify Regular Price",
                    is_mrp=is_mrp
                ))

        # 4. OpenGraph / Meta price tags in HTML
        og_price = soup.find("meta", property="og:price:amount") or soup.find("meta", property="product:price:amount") or soup.find("meta", attrs={"itemprop": "price"})
        if og_price and og_price.get("content"):
            num = self._clean_price(og_price["content"])
            if num:
                candidates.append(PriceCandidate(
                    amount=num,
                    currency="INR",
                    source="adapter",
                    confidence=0.95,
                    stage=stage,
                    selector="meta[property='og:price:amount']",
                    semantic_label="Shopify Meta Offer Price",
                    is_mrp=False
                ))

        return candidates

    def get_add_to_cart_selectors(self) -> list[str]:
        return [
            'button[name="add"]',
            'form[action*="/cart/add"] button[type="submit"]',
            '.product-form__submit',
            '#AddToCart',
            'button.add-to-cart',
            'button[data-action="add-to-cart"]'
        ]

    def verify_cart_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_subtotal = None

        if "/cart" in url:
            score += 45.0

        if not html:
            return score >= 50.0, score, observed_subtotal

        soup = BeautifulSoup(html, "html.parser")

        # Drawer / Modal check
        if soup.select("cart-drawer[class*='active'], .cart-drawer.active, .drawer--is-open, #cart-drawer.is-empty-false"):
            score += 40.0
        elif soup.select("cart-drawer, .cart-drawer, .mini-cart"):
            score += 20.0

        # Subtotal element
        subtotal_el = soup.select_one(".totals__subtotal-value, .cart__subtotal, .cart-drawer__footer .totals__subtotal")
        if subtotal_el:
            score += 25.0
            num = self._clean_price(subtotal_el.get_text(strip=True))
            if num:
                observed_subtotal = num

        # Checkout CTA presence
        if soup.select('button[name="checkout"], a[href*="/checkout"], .cart__checkout-button'):
            score += 20.0

        return score >= 45.0, score, observed_subtotal

    def get_checkout_selectors(self) -> list[str]:
        return [
            'button[name="checkout"]',
            'button.cart__checkout-button',
            'a[href*="/checkout"]',
            'input[name="checkout"]',
            '#checkout',
            '.cart-drawer__footer button[name="checkout"]'
        ]

    def verify_checkout_state(self, html: str, url: str, text: str) -> tuple[bool, float, Optional[float]]:
        score = 0.0
        observed_total = None

        if "/checkouts/" in url or "checkout.shopify.com" in url or "/checkout" in url:
            score += 50.0

        if not html:
            return score >= 50.0, score, observed_total

        soup = BeautifulSoup(html, "html.parser")

        # Order summary or total line
        total_el = soup.select_one(".total-line__price, .order-summary__emphasis, [data-checkout-payment-due-target]")
        if total_el:
            score += 35.0
            num = self._clean_price(total_el.get_text(strip=True))
            if num:
                observed_total = num

        if "order summary" in text.lower() or "shipping address" in text.lower() or "payment" in text.lower():
            score += 20.0

        return score >= 50.0, score, observed_total

    def _clean_price(self, text: str) -> Optional[float]:
        cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except ValueError:
            return None
