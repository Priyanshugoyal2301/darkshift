"""
DarkShield — Crawler v3 / Multi-Strategy Acquisition Test Suite
Validates:
1. JSON-LD price extraction
2. Network JSON price extraction
3. Hydration price extraction
4. Product identity matching
5. Unrelated banner price rejection
6. MRP rejection
7. SPA cart detection
8. Cart drawer detection
9. Checkout CTA scoring
10. Navigation noise rejection
11. Blocked access classification
12. HTTP fallback
13. Browser fallback
14. P1/P2 null invariants
15. Price conflict handling
"""

import sys
import os
import pytest
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

from schemas import (
    AccessStatus, PageType, PlatformType, PriceCandidate,
    ActionPolicyTier, PriceStage, DarkPatternAssessmentStatus
)
from extraction.jsonld import extract_jsonld_candidates
from extraction.hydration import HydrationExtractor
from extraction.product import ProductIdentityExtractor
from extraction.ensemble import PriceEnsemble
from crawler.access_classifier import AccessClassifier
from crawler.action_discovery import ActionDiscovery
from crawler.network_capture import NetworkCapture
from crawler.state_machine import PurchaseStateMachine, PurchaseJourneyState
from adapters.shopify import ShopifyAdapter
from adapters.woocommerce import WooCommerceAdapter
from adapters.generic import GenericAdapter
from adapters import resolve_platform_adapter
from detection_engine import assess_price_journey, score_checkout_action


# ─── 1. JSON-LD Price Extraction ─────────────────────────────────────────────

def test_jsonld_price_extraction():
    html = """
    <script type="application/ld+json">
    {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": "Sony WH-1000XM5 Wireless Headphones",
      "offers": {
        "@type": "Offer",
        "priceCurrency": "INR",
        "price": "26990.00",
        "priceSpecification": [
          {
            "@type": "UnitPriceSpecification",
            "priceType": "https://schema.org/ListPrice",
            "price": "34990.00"
          },
          {
            "@type": "UnitPriceSpecification",
            "priceType": "https://schema.org/SalePrice",
            "price": "26990.00"
          }
        ]
      }
    }
    </script>
    """
    candidates, title = extract_jsonld_candidates(html, target_stage="product")
    assert title == "Sony WH-1000XM5 Wireless Headphones"
    assert len(candidates) >= 2

    # Selling price candidate
    sale_cands = [c for c in candidates if not c.is_mrp and c.amount == 26990.0]
    assert len(sale_cands) >= 1
    assert sale_cands[0].confidence >= 0.95

    # List price (MRP) candidate
    mrp_cands = [c for c in candidates if c.is_mrp and c.amount == 34990.0]
    assert len(mrp_cands) == 1


# ─── 2. Network JSON Price Extraction ─────────────────────────────────────────

def test_network_json_price_extraction():
    capture = NetworkCapture(max_captures=10)
    mock_payload = {
        "data": {
            "product": {
                "id": "prod_99182",
                "title": "Ultra-Slim 4K Smart TV",
                "price": {
                    "sellingPrice": 38999.0,
                    "mrp": 54999.0,
                    "discount": 16000.0
                }
            }
        }
    }
    capture._scan_json(mock_payload, "https://api.example.com/graphql/productDetails")
    candidates = capture.get_candidates()

    assert len(candidates) == 1
    cand = candidates[0]
    assert cand.amount == 38999.0
    assert cand.source == "network_json"
    assert cand.is_mrp is False


# ─── 3. Hydration Price Extraction ────────────────────────────────────────────

def test_hydration_price_extraction():
    html = """
    <script id="__NEXT_DATA__" type="application/json">
    {
      "props": {
        "pageProps": {
          "initialProduct": {
            "title": "Ergonomic Mesh Chair",
            "price": 8499.0,
            "compareAtPrice": 12999.0
          }
        }
      }
    }
    </script>
    """
    extractor = HydrationExtractor()
    candidates = extractor.extract(html, target_stage="product")

    assert len(candidates) >= 1
    selling_cands = [c for c in candidates if not c.is_mrp and c.amount == 8499.0]
    assert len(selling_cands) == 1
    assert selling_cands[0].source == "next_data"

    mrp_cands = [c for c in candidates if c.is_mrp and c.amount == 12999.0]
    assert len(mrp_cands) == 1


# ─── 4. Product Identity Matching ─────────────────────────────────────────────

def test_product_identity_matching():
    html = """
    <html>
    <head>
        <meta property="og:title" content="Samsung Galaxy S24 Ultra 5G | Amazon.in">
    </head>
    <body>
        <div id="centerCol" class="product-details">
            <h1>Samsung Galaxy S24 Ultra 5G (Titanium Gray, 256GB)</h1>
            <div class="price">₹1,29,999</div>
        </div>
    </body>
    </html>
    """
    extractor = ProductIdentityExtractor()
    identity = extractor.extract_identity(html)
    assert identity["title"] == "Samsung Galaxy S24 Ultra 5G"
    assert identity["container_selector"] in ("#centerCol", ".product-details")


# ─── 5. Unrelated Banner Price Rejection ──────────────────────────────────────

def test_unrelated_banner_price_rejection():
    extractor = ProductIdentityExtractor()
    assert extractor.is_element_in_unrelated_section(
        element_classes="carousel-item recommendation-card",
        element_id="related-product-1",
        parent_text="Customers who bought this also bought"
    ) is True

    assert extractor.is_element_in_unrelated_section(
        element_classes="product-main-price",
        element_id="priceblock-ourprice",
        parent_text="Inclusive of all taxes"
    ) is False


# ─── 6. MRP Rejection ─────────────────────────────────────────────────────────

def test_mrp_rejection():
    ensemble = PriceEnsemble()
    candidates = [
        PriceCandidate(
            amount=4999.0,
            currency="INR",
            source="dom",
            confidence=0.90,
            semantic_label="Maximum Retail Price (MRP)",
            is_mrp=True
        ),
        PriceCandidate(
            amount=2999.0,
            currency="INR",
            source="adapter",
            confidence=0.95,
            semantic_label="Deal of the Day Price",
            is_mrp=False
        ),
    ]
    price, source, conf, valid, conflict = ensemble.rank_and_select(candidates, target_stage="product")
    assert price == 2999.0, "Ensemble must select selling price (₹2,999) over MRP (₹4,999)"
    assert source == "adapter"


# ─── 7. SPA Cart Detection ───────────────────────────────────────────────────

def test_spa_cart_detection():
    adapter = GenericAdapter()
    html = """
    <div class="side-cart-drawer modal-open">
        <h2>Your Shopping Cart</h2>
        <div class="cart-items">
            <div class="item">Running Shoes (Qty: 1)</div>
        </div>
        <div class="subtotal-row">Order Subtotal: ₹3,499.00</div>
        <button class="checkout-cta">Proceed to Checkout</button>
    </div>
    """
    # Note: URL does NOT have /cart
    is_confirmed, score, subtotal = adapter.verify_cart_state(html, "https://store.example.com/products/shoes", "Your Shopping Cart Order Subtotal: ₹3,499.00 Proceed to Checkout")
    assert is_confirmed is True
    assert score >= 50.0
    assert subtotal == 3499.0


# ─── 8. Cart Drawer Detection ─────────────────────────────────────────────────

def test_cart_drawer_detection():
    shopify = ShopifyAdapter()
    html = """
    <cart-drawer class="active drawer--is-open">
        <div class="drawer__contents">
            <h3>Your Cart</h3>
            <div class="totals__subtotal-value">₹1,999.00</div>
            <button name="checkout">Checkout</button>
        </div>
    </cart-drawer>
    """
    is_confirmed, score, subtotal = shopify.verify_cart_state(html, "https://mybrand.in/products/dress", "Your Cart ₹1,999.00 Checkout")
    assert is_confirmed is True
    assert score >= 45.0
    assert subtotal == 1999.0


# ─── 9. Checkout CTA Scoring ──────────────────────────────────────────────────

def test_checkout_cta_scoring():
    action_discovery = ActionDiscovery()
    candidates = [
        {"text": "Skip to content", "tag": "a", "href": "#main"},
        {"text": "Home", "tag": "a", "href": "/"},
        {"text": "Proceed to Checkout", "tag": "button", "href": "/checkout", "surrounding": "Cart subtotal ₹1,999"},
        {"text": "Continue", "tag": "button", "surrounding": "Order summary proceed"},
    ]
    ranked = action_discovery.rank_checkout_candidates(candidates)
    assert len(ranked) >= 1
    best_candidate, decision, score = ranked[0]
    assert best_candidate["text"] == "Proceed to Checkout"
    assert score >= 50.0

    # Ensure "Skip to content" and "Home" are completely excluded from checkout actions
    filtered_texts = [c[0]["text"] for c in ranked]
    assert "Skip to content" not in filtered_texts
    assert "Home" not in filtered_texts


# ─── 10. Navigation Noise Rejection ───────────────────────────────────────────

def test_navigation_noise_rejection():
    action_discovery = ActionDiscovery()
    for noise in ["Skip to content", "skip navigation", "Menu", "Search", "Accessibility", "About Us"]:
        score = action_discovery.score_cart_candidate(text=noise, tag="a", href="#")
        assert score == -100.0, f"Expected -100.0 score for noise '{noise}', got {score}"


# ─── 11. Blocked Access Classification ────────────────────────────────────────

def test_blocked_access_classification():
    classifier = AccessClassifier()
    # 1. Cloudflare WAF Challenge
    cf_html = "<html><head><title>Just a moment...</title></head><body>Please verify you are a human before accessing the store.</body></html>"
    status, reason = classifier.classify_access(403, cf_html, "Please verify you are a human before accessing the store.")
    assert status == AccessStatus.BOT_CHALLENGE
    assert "challenge" in reason.lower()

    # 2. Rate Limiting
    status_429, _ = classifier.classify_access(429, "", "")
    assert status_429 == AccessStatus.RATE_LIMITED

    # 3. Login Required
    status_401, _ = classifier.classify_access(401, "", "")
    assert status_401 == AccessStatus.LOGIN_REQUIRED

    # 4. CAPTCHA
    captcha_html = "<div><div class='g-recaptcha' data-sitekey='xxx'></div></div>"
    status_cap, _ = classifier.classify_access(200, captcha_html, "")
    assert status_cap == AccessStatus.CAPTCHA_PRESENT


# ─── 12. HTTP Fallback ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_http_fallback():
    from crawler.http_client import HttpAcquisitionClient
    client = HttpAcquisitionClient()
    # Test invalid domain failure gracefully caught without crash
    res = await client.fetch("http://invalid-non-existent-domain-991823.test/")
    assert res.status_code == 0
    assert res.access_status in (AccessStatus.NETWORK_ERROR, AccessStatus.TIMEOUT)


# ─── 13. Browser Fallback & Platform Resolution ───────────────────────────────

def test_browser_fallback_and_platform_resolution():
    shopify_html = "<script src='https://cdn.shopify.com/s/files/theme.js'></script>"
    woo_html = "<body class='woocommerce-page'></body>"
    unknown_html = "<div>Custom bespoke store</div>"

    assert resolve_platform_adapter(shopify_html, "https://shop.in").platform_type == PlatformType.SHOPIFY
    assert resolve_platform_adapter(woo_html, "https://shop.in").platform_type == PlatformType.WOOCOMMERCE
    assert resolve_platform_adapter(unknown_html, "https://shop.in").platform_type == PlatformType.GENERIC


# ─── 14. P1/P2 Null Invariants ────────────────────────────────────────────────

def test_p1_p2_null_invariants():
    sm = PurchaseStateMachine()
    sm.transition_to(PurchaseJourneyState.PRODUCT_CAPTURED, stage="product", verified=True, price_observed=1999.0)
    # Fail at cart
    sm.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="cart", verified=False, reason="No cart CTA found")

    assert sm.product_reached is True
    assert sm.p0 == 1999.0
    assert sm.cart_reached is False
    assert sm.p1 is None
    assert sm.checkout_reached is False
    assert sm.p2 is None


# ─── 15. Price Conflict Handling ──────────────────────────────────────────────

def test_price_conflict_handling():
    ensemble = PriceEnsemble()
    candidates = [
        PriceCandidate(
            amount=1999.0,
            currency="INR",
            source="json_ld",
            confidence=0.96,
            semantic_label="JSON-LD Offer Price"
        ),
        PriceCandidate(
            amount=2199.0,
            currency="INR",
            source="dom",
            confidence=0.90,
            semantic_label="DOM Regex Price"
        ),
    ]
    price, source, conf, valid, has_conflict = ensemble.rank_and_select(candidates, target_stage="product")
    assert has_conflict is True, "Discrepancy between JSON-LD (₹1,999) and DOM (₹2,199) must trigger has_conflict"
    assert price == 1999.0, "JSON-LD should win over DOM due to higher source weight"
