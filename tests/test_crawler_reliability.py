"""
DarkShield — Live Crawler Reliability & State Transition Unit Tests
Validates fixes for:
1. P0 — Impossible price state: no checkout means no P2, no cart means no P1
2. P0 — Wrong checkout action: "Skip to content", "Home", "Search" rejected
3. P0 — Cart & checkout state verification and intent scoring
4. P0 — Script and style source code never used as dark pattern evidence
5. P1 — Price assessment set to INCONCLUSIVE when checkout unreached
"""

import sys
import os
import pytest
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

from detection_engine import (
    classify_action_element,
    score_checkout_action,
    run_rule_engine,
    analyze_page,
    assess_price_journey,
    is_user_facing_evidence,
    NAVIGATION_NOISE_REGEX,
)
from schemas import (
    ActionPolicyTier,
    PriceStage,
    DarkPatternAssessmentStatus,
    CCPAPattern,
)


class TestActionClassifierReliability:
    @pytest.mark.parametrize("noise_text", [
        "Skip to content",
        "skip navigation",
        "Skip to main content",
        "Accessibility",
        "Home",
        "About",
        "About Us",
        "Contact",
        "Contact Us",
        "Menu",
        "Search",
        "Back",
        "View details",
        "Read more",
        "Continue reading",
        "Login",
        "Sign in",
        "Wishlist",
        "Track Order",
        "Customer Service",
    ])
    def test_navigation_noise_rejected(self, noise_text):
        """Crawler should NEVER consider utility/navigation links as checkout actions."""
        decision = classify_action_element(text=noise_text, current_stage="cart")
        assert decision.action_tier == ActionPolicyTier.BLOCKED, f"Expected BLOCKED for '{noise_text}', got {decision.action_tier}"
        assert "Ignored" in decision.reason

        score = score_checkout_action(text=noise_text, current_stage="cart")
        assert score == 0.0, f"Score for '{noise_text}' must be 0.0, got {score}"

    def test_generic_actions_require_cart_context(self):
        """Generic 'continue' / 'next' must be rejected outside active cart context."""
        dec_product = classify_action_element(text="Continue", current_stage="product")
        assert dec_product.action_tier == ActionPolicyTier.BLOCKED
        assert "without active cart flow context" in dec_product.reason

        dec_cart = classify_action_element(text="Continue", current_stage="cart")
        assert dec_cart.action_tier == ActionPolicyTier.CAUTION

    def test_explicit_checkout_action_approved(self):
        """Explicit checkout actions must be approved as CAUTION with high score."""
        for cta in ["Proceed to Checkout", "Go to Checkout", "Secure Checkout", "Checkout", "Review Order"]:
            decision = classify_action_element(text=cta, current_stage="cart")
            assert decision.action_tier == ActionPolicyTier.CAUTION
            score = score_checkout_action(text=cta, href="/checkout", current_stage="cart")
            assert score >= 50.0, f"Expected high score for '{cta}', got {score}"


class TestVisibleEvidenceEligibilityGate:
    def test_script_source_is_not_dark_pattern_evidence(self):
        """
        ClubFactory regression test:
        <script>const ROUTE_URL_RAW = "https://app.codking.tech/";</script>
        Must NEVER be extracted as countdown timer or any dark pattern evidence.
        """
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>ClubFactory Product</title>
            <script>
                const ROUTE_URL_RAW = "https://app.codking.tech/";
                const ROUTE_URL = (ROUTE_URL_RAW && ROUTE_URL_RAW.endsWith('/')) ? ROUTE_URL_RAW : ROUTE_URL_RAW + '/';
                const TIMER_OFFSET = "10:00:00";
            </script>
            <style>
                .timer-test { color: red; font-size: 12px; }
            </style>
        </head>
        <body>
            <header>
                <a href="#main" class="skip-link">Skip to content</a>
            </header>
            <main id="main">
                <h1>Designer Luxury Watch</h1>
                <div class="price">₹1,999</div>
                <button id="add-to-cart">Add to Cart</button>
            </main>
        </body>
        </html>
        """
        soup = BeautifulSoup(html, "html.parser")
        findings = run_rule_engine(soup, "", "https://theclubfactory.in/product/123")

        # Must not detect FALSE_URGENCY based on script timer offset or route url
        fu_findings = [f for f in findings if f.pattern == CCPAPattern.FALSE_URGENCY]
        assert len(fu_findings) == 0, f"Expected 0 false urgency findings from script tags, got: {fu_findings}"

        # Test analyze_page pipeline with raw html
        findings_full, _ = analyze_page("https://theclubfactory.in/product/123", html, "")
        for f in findings_full:
            for snippet in f.text_snippets:
                assert "ROUTE_URL" not in snippet
                assert "codking" not in snippet
                assert not snippet.startswith("const ")

    def test_is_user_facing_evidence_helper(self):
        """Rejects programming and code syntax strings."""
        assert is_user_facing_evidence("Only 3 left in stock!") is True
        assert is_user_facing_evidence("Sale ends in 02:45") is True
        assert is_user_facing_evidence("const ROUTE_URL_RAW = 'https://app.codking.tech/';") is False
        assert is_user_facing_evidence("function() { return 10:00; }") is False
        assert is_user_facing_evidence("https://example.com/timer.js") is False


class TestPriceJourneyStateInvariants:
    def test_no_checkout_means_no_p2(self):
        """Invariant: P2 may only have a value if checkout_reached == true."""
        p0_stage = PriceStage(stage="product", stage_label="1. Product Listing", total=1999.0, is_captured=True)
        p1_stage = PriceStage(stage="cart", stage_label="2. Cart Review", total=2199.0, is_captured=True)
        # Checkout not in stages_scanned
        journey, _ = assess_price_journey([p0_stage, p1_stage], stages_scanned=["product", "cart"])
        assert journey.final_observed_price is None
        assert journey.checkout_reached is False

    def test_no_cart_means_no_p1(self):
        """Invariant: P1 may only have a value if cart_reached == true."""
        p0_stage = PriceStage(stage="product", stage_label="1. Product Listing", total=1999.0, is_captured=True)
        # Cart not in stages_scanned
        journey, _ = assess_price_journey([p0_stage], stages_scanned=["product"])
        assert journey.cart_price is None
        assert journey.final_observed_price is None

    def test_frontend_does_not_render_p0_as_p2(self):
        """
        Verify serialization invariant: when checkout is not reached,
        final_observed_price is null in the JSON payload, ensuring frontend
        renders 'Not reached' rather than falling back to P0.
        """
        p0_stage = PriceStage(stage="product", stage_label="1. Product Listing", total=1999.0, is_captured=True)
        journey, _ = assess_price_journey([p0_stage], stages_scanned=["product"])
        data = journey.model_dump()
        assert data["final_observed_price"] is None
        assert data["cart_price"] is None
        assert data["initial_price"] == 1999.0
        assert data["checkout_reached"] is False

    def test_clubfactory_inconclusive_journey_state(self):
        """
        ClubFactory production failure case:
        P0 = ₹1,999
        P1 = UNKNOWN (cart uncaptured)
        P2 = UNKNOWN (checkout unreached)
        checkout_reached = False
        """
        p0_stage = PriceStage(stage="product", stage_label="1. Product Listing", total=1999.0, is_captured=True)
        p1_stage = PriceStage(stage="cart", stage_label="2. Cart Review", total=None, is_captured=False)

        journey, findings = assess_price_journey([p0_stage, p1_stage], stages_scanned=["product", "cart"])

        assert journey.initial_price == 1999.0
        assert journey.cart_price is None, "P1 must be None when cart price is not captured"
        assert journey.final_observed_price is None, "P2 must strictly be None when checkout is not reached"
        assert journey.checkout_reached is False
        assert journey.delta_total is None
        assert journey.dark_pattern_assessment == DarkPatternAssessmentStatus.INCONCLUSIVE
        assert "cart review was not reached or captured" in journey.explanation

