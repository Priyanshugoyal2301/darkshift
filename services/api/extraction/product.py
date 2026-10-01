"""
DarkShield — Extraction: Product Identity & Scope Isolation
Extracts canonical product title, SKU, and primary container to ensure
extracted prices belong strictly to the target product, not carousels or banners.
"""

from __future__ import annotations
import re
from typing import Optional
from bs4 import BeautifulSoup


class ProductIdentityExtractor:
    UNRELATED_CONTAINERS = [
        "recommendation", "recommended", "frequently-bought", "customers-also",
        "related-products", "cross-sell", "upsell", "banner", "header",
        "nav", "footer", "sidebar", "carousel", "slider", "trending"
    ]

    def extract_identity(self, html: str, fallback_title: str = "") -> dict:
        result = {
            "title": fallback_title or "Target Product",
            "sku": None,
            "container_selector": None,
            "brand": None,
        }

        if not html:
            return result

        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            return result

        # 1. Title from OpenGraph or Twitter meta
        og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
        if og_title and og_title.get("content"):
            clean_title = og_title["content"].strip()
            # Remove site suffix like " | Flipkart" or " - Amazon.in"
            clean_title = re.sub(r"\s*[|\-–—:]\s*(Flipkart|Amazon|Myntra|Club Factory|Shopify).*$", "", clean_title, flags=re.I).strip()
            if clean_title:
                result["title"] = clean_title

        # 2. Main <h1> tag
        if result["title"] == (fallback_title or "Target Product"):
            h1 = soup.find("h1")
            if h1:
                h1_text = h1.get_text(strip=True)
                if h1_text and len(h1_text) > 3:
                    result["title"] = h1_text

        # 3. Primary Product Container identification
        containers = [
            'div[itemtype*="schema.org/Product"]',
            '.product-single',
            '.product-details',
            '#product-details',
            '.pdp-details',
            '.product-info-main',
            '#centerCol', # Amazon
            'div._2c7YLP', # Flipkart product container
            '.pdp-price-info', # Myntra
        ]

        for sel in containers:
            if soup.select(sel):
                result["container_selector"] = sel
                break

        return result

    def is_element_in_unrelated_section(self, element_classes: str, element_id: str, parent_text: str) -> bool:
        """Checks if a price element is situated inside recommendations/carousels/banners."""
        combined = f"{element_classes} {element_id} {parent_text[:120]}".lower()
        return any(term in combined for term in self.UNRELATED_CONTAINERS)
