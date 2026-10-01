"""
DarkShield — Price Extractor Unit Tests & Real-World Validation
Tests the stage-aware semantic price extraction engine against real-world scenarios:
1. MRP vs Offer Price rejection (MRP ₹4,999, Save ₹2,000, Offer ₹2,999)
2. JSON-LD structured data extraction
3. Microdata itemprop="price"
4. Grand Total / Amount Payable anchors in Cart and Checkout
5. Explicit rejection of review counts, ratings, dates, EMI
6. Graceful failure returning None / UNKNOWN instead of arbitrary max(prices)
7. Delivery charges marked delivery-dependent
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

from price_extractor import (
    extract_price_and_components,
    extract_product_price,
    extract_cart_checkout_price,
    extract_stage_components,
    extract_inr_from_text,
    parse_inr_amount,
)
from detection_engine import assess_price_journey
from schemas import PriceStage, PriceComponent, DarkPatternAssessmentStatus
from bs4 import BeautifulSoup


class TestProductPriceExtraction:
    def test_mrp_savings_rejection(self):
        """
        Real product scenario:
        MRP ₹4,999 Save ₹2,000 Offer price ₹2,999 Delivery ₹49 Rating 4.5 Reviews 1,245
        Must extract ₹2,999 and reject ₹4,999 and ₹2,000.
        """
        html = """
        <div class="product-page">
            <span class="mrp"><s>MRP: ₹4,999</s></span>
            <span class="savings">You Save: ₹2,000 (40% OFF)</span>
            <div class="price-container">
                <span class="offer-price">Offer Price: ₹2,999</span>
            </div>
            <div class="reviews-section">
                <span>Rating: 4.5 Stars</span>
                <span>1,245 customer reviews</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_product_price(soup, text)
        assert price == 2999.0, f"Expected 2999.0 but got {price}"
        assert meta.confidence in ("HIGH", "MEDIUM")
        assert any(r["reason"] for r in meta.rejected_values), "Should log rejected values"

    def test_json_ld_offer_priority(self):
        """JSON-LD Offer schema should be prioritized over text mentions."""
        html = """
        <html>
        <head>
            <script type="application/ld+json">
            {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Wireless Noise Cancelling Headphones",
                "offers": {
                    "@type": "Offer",
                    "priceCurrency": "INR",
                    "price": "3499.00",
                    "availability": "https://schema.org/InStock"
                }
            }
            </script>
        </head>
        <body>
            <div>Regular Price: ₹5,999</div>
        </body>
        </html>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_product_price(soup, text)
        assert price == 3499.0, f"Expected 3499.0 from JSON-LD, got {price}"
        assert meta.source == "JSON_LD"
        assert meta.confidence == "HIGH"

    def test_microdata_itemprop_price(self):
        """itemprop='price' should be correctly extracted."""
        html = """
        <div itemscope itemtype="http://schema.org/Product">
            <h1 itemprop="name">Ergonomic Office Chair</h1>
            <meta itemprop="priceCurrency" content="INR" />
            <span class="price-box">
                <span itemprop="price" content="7450.00">₹7,450</span>
            </span>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_product_price(soup, text)
        assert price == 7450.0, f"Expected 7450.0 from microdata, got {price}"
        assert meta.source == "MICRODATA"

    def test_strikethrough_del_tag_rejection(self):
        """Prices inside <del> or <s> tags must never be chosen as payable price."""
        html = """
        <div class="pricing">
            <del>₹12,999</del>
            <span class="sale-price">₹8,499</span>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_product_price(soup, text)
        assert price == 8499.0, f"Expected 8499.0, got {price}"

    def test_absence_of_price_returns_none(self):
        """When no price exists, return None (never an arbitrary number)."""
        html = """
        <div class="article">
            <p>Our company was founded in 2014. We have 500 employees.</p>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_product_price(soup, text)
        assert price is None, f"Expected None for non-priced text, got {price}"
        assert meta.confidence == "FAILED"


class TestCartCheckoutPriceExtraction:
    def test_grand_total_payable_anchor(self):
        """In cart/checkout, Grand Total must take precedence over item subtotals."""
        html = """
        <div class="order-summary-box">
            <div class="row"><span>Item Subtotal:</span> <span>₹2,499</span></div>
            <div class="row"><span>Delivery:</span> <span>₹99</span></div>
            <div class="row"><span>Taxes:</span> <span>₹120</span></div>
            <div class="total-row"><span>Amount Payable:</span> <span>₹2,718</span></div>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        price, meta = extract_cart_checkout_price(soup, text, stage="checkout")
        assert price == 2718.0, f"Expected 2718.0 payable total, got {price}"
        assert meta.confidence == "HIGH"

    def test_delivery_charge_metadata(self):
        """Delivery charges must have is_delivery_dependent=True and is_mandatory=True."""
        html = """
        <div class="cart-breakdown">
            <div class="fee-row">Standard Delivery Charges: ₹60</div>
            <div class="fee-row">Convenience Fee: ₹25</div>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True)

        comps = extract_stage_components(soup, text, current_stage="cart")
        ship_comp = next((c for c in comps if c.component_type == "shipping"), None)
        assert ship_comp is not None, "Should extract shipping component"
        assert ship_comp.is_delivery_dependent is True, "Shipping must be delivery dependent"
        assert ship_comp.amount == 60.0


class TestNoFakeFallbacksInJourney:
    def test_uncaptured_cart_does_not_falsify_evidence(self):
        """If cart extraction fails, total must be None and is_captured False."""
        p0_stage = PriceStage(stage="product", stage_label="1. Product", total=999.0, is_captured=True)
        p1_stage = PriceStage(stage="cart", stage_label="2. Cart", total=None, is_captured=False)
        p2_stage = PriceStage(stage="checkout", stage_label="3. Checkout", total=None, is_captured=False)

        journey, findings = assess_price_journey([p0_stage, p1_stage, p2_stage], stages_scanned=["product", "cart"])
        assert journey.initial_price == 999.0
        assert journey.cart_price is None, "Uncaptured cart price must remain None"
        assert journey.final_observed_price == 999.0
        assert journey.delta_01 is None, "Delta 01 cannot be computed without cart price"
        assert not journey.is_drip_pricing
