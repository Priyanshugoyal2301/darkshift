"""
DarkShield — Detection Engine Unit Tests

Tests each detector against HTML fixtures to verify:
  - Correct pattern detection
  - Evidence quality
  - Confidence calibration
  - No false positives on benign content

Run: python -m pytest tests/ -v
"""

import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

from detection_engine import (
    run_rule_engine, analyze_page, compute_transparency_score,
    classify_page_state, extract_prices_from_text, analyze_price_journey,
)
from schemas import CCPAPattern, Severity, PriceState


# ─── Fixtures ─────────────────────────────────────────────────────────────────

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "fixtures")


def load_fixture(path: str) -> str:
    with open(os.path.join(FIXTURES_DIR, path), encoding="utf-8") as f:
        return f.read()


# ─── False Urgency Tests ──────────────────────────────────────────────────────

class TestFalseUrgency:
    def test_countdown_timer_detected(self):
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/product/headphones")

        urgency_findings = [f for f in findings if f.pattern == CCPAPattern.FALSE_URGENCY]
        assert len(urgency_findings) >= 1, "Should detect at least one false urgency signal"

        # Countdown timer should be detected
        countdown_findings = [f for f in urgency_findings if "COUNTDOWN_TIMER" in f.sub_signals]
        assert len(countdown_findings) >= 1, "Countdown timer should be detected"

    def test_scarcity_claim_detected(self):
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/product")
        scarcity_findings = [f for f in findings if "SCARCITY_CLAIM" in f.sub_signals]
        assert len(scarcity_findings) >= 1, "Scarcity claim should be detected"

    def test_deadline_language_detected(self):
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com")
        deadline_findings = [f for f in findings if "DEADLINE_LANGUAGE" in f.sub_signals]
        assert len(deadline_findings) >= 1, "Deadline language should be detected"

    def test_confidence_range(self):
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com")
        for f in findings:
            assert 0.0 <= f.confidence <= 1.0, f"Confidence out of range: {f.confidence}"


# ─── Basket Sneaking Tests ────────────────────────────────────────────────────

class TestBasketSneaking:
    def test_pre_checked_checkbox_detected(self):
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/checkout")

        bs_findings = [f for f in findings if f.pattern == CCPAPattern.BASKET_SNEAKING]
        assert len(bs_findings) >= 1, "Basket sneaking via pre-ticked checkbox should be detected"

        # Should have high confidence for pre-ticked checkbox
        for f in bs_findings:
            assert f.confidence >= 0.80, f"Pre-ticked checkbox confidence should be >= 0.80, got {f.confidence}"
            assert f.severity == Severity.HIGH

    def test_evidence_includes_label_text(self):
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/checkout")
        bs_findings = [f for f in findings if f.pattern == CCPAPattern.BASKET_SNEAKING]

        # Should have text evidence mentioning insurance or warranty
        for f in bs_findings:
            combined = " ".join(f.text_snippets).lower()
            assert any(kw in combined for kw in ["insurance", "warranty", "protection"]), \
                f"Should detect add-on label in text snippets: {f.text_snippets}"


# ─── Confirm Shaming Tests ────────────────────────────────────────────────────

class TestConfirmShaming:
    def test_shame_language_detected(self):
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/checkout")
        cs_findings = [f for f in findings if f.pattern == CCPAPattern.CONFIRM_SHAMING]
        assert len(cs_findings) >= 1, "Confirm shaming should be detected"

        for f in cs_findings:
            assert f.confidence >= 0.85, f"Confirm shaming confidence should be high, got {f.confidence}"

    def test_shame_text_in_evidence(self):
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(separator=" ", strip=True)

        findings = run_rule_engine(soup, text, "https://example.com/checkout")
        cs_findings = [f for f in findings if f.pattern == CCPAPattern.CONFIRM_SHAMING]

        for f in cs_findings:
            combined = " ".join(f.text_snippets).lower()
            assert "hate" in combined or "don't want" in combined or "saving" in combined, \
                f"Shame text should appear in evidence: {f.text_snippets}"


# ─── Price Extraction Tests ───────────────────────────────────────────────────

class TestPriceExtraction:
    def test_rupee_symbol(self):
        prices = extract_prices_from_text("Buy now for ₹999 only!")
        assert 999.0 in prices

    def test_formatted_price(self):
        prices = extract_prices_from_text("MRP: ₹1,29,999 Special offer: ₹89,999")
        assert 89999.0 in prices or 129999.0 in prices

    def test_rs_prefix(self):
        prices = extract_prices_from_text("Rs. 1299 + shipping")
        assert 1299.0 in prices

    def test_no_false_positives(self):
        prices = extract_prices_from_text("5-star rating out of 10")
        assert len([p for p in prices if p > 100]) == 0, "Should not extract ratings as prices"


# ─── Price Journey Tests ──────────────────────────────────────────────────────

class TestPriceJourney:
    def test_drip_pricing_detected(self):
        snapshots = [
            {"url": "https://example.com/product", "state": "product", "prices": [999.0]},
            {"url": "https://example.com/cart", "state": "cart", "prices": [1049.0]},
            {"url": "https://example.com/checkout", "state": "checkout", "prices": [1248.0]},
        ]
        journey = analyze_price_journey(snapshots)
        assert journey is not None, "Should detect price journey"
        assert journey.potential_drip is True
        assert journey.delta_total == pytest.approx(249.0)

    def test_no_drip_same_price(self):
        snapshots = [
            {"url": "https://example.com/product", "state": "product", "prices": [999.0]},
            {"url": "https://example.com/cart", "state": "cart", "prices": [999.0]},
        ]
        journey = analyze_price_journey(snapshots)
        assert journey is None, "Should not detect drip pricing when prices are the same"

    def test_single_snapshot_no_journey(self):
        snapshots = [{"url": "https://example.com/product", "state": "product", "prices": [999.0]}]
        journey = analyze_price_journey(snapshots)
        assert journey is None, "Cannot detect price journey from single snapshot"


# ─── Page State Classifier Tests ─────────────────────────────────────────────

class TestPageStateClassifier:
    def test_cart_url(self):
        assert classify_page_state("https://amazon.in/cart", "your cart") == PriceState.CART

    def test_checkout_url(self):
        assert classify_page_state("https://flipkart.com/checkout", "proceed to payment") in (
            PriceState.CHECKOUT, PriceState.PAYMENT
        )

    def test_product_keywords(self):
        assert classify_page_state("https://example.com/item/123", "add to cart | buy now") == PriceState.PRODUCT


# ─── Transparency Score Tests ─────────────────────────────────────────────────

class TestTransparencyScore:
    def test_no_findings_max_score(self):
        score = compute_transparency_score([])
        assert score.total == 100

    def test_high_severity_findings_lower_score(self):
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        findings, _ = analyze_page("https://example.com/checkout", html, "")
        score = compute_transparency_score(findings)
        assert score.total < 100, "Findings should reduce transparency score"

    def test_score_in_range(self):
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        findings, _ = analyze_page("https://example.com/product", html, "")
        score = compute_transparency_score(findings)
        assert 0 <= score.total <= 100

    def test_disclaimer_present(self):
        score = compute_transparency_score([])
        assert "not an official CCPA compliance score" in score.disclaimer


# ─── Benign content — no false positives ─────────────────────────────────────

class TestBenignContent:
    """
    These tests ensure legitimate content is NOT flagged incorrectly.
    """
    def test_genuine_countdown_low_confidence(self):
        """A countdown on a page clearly describing a genuine sale event should
        have lower confidence than one with no context."""
        html = """<html><body>
          <h1>Annual Sale — Ends December 31</h1>
          <div id="countdown">23:59</div>
          <p>Our year-end clearance sale ends at midnight on December 31, 2026.</p>
        </body></html>"""
        findings, _ = analyze_page("https://example.com/sale", html, "")
        urgency = [f for f in findings if f.pattern == CCPAPattern.FALSE_URGENCY]
        if urgency:
            # Should have lower confidence since no fake reset and described as annual sale
            for f in urgency:
                assert f.confidence < 0.9, "Genuine countdown should not have maximum confidence"

    def test_legitimate_price_no_drip(self):
        """A product page that shows the full inclusive price should not trigger drip pricing."""
        snapshots = [
            {"url": "https://example.com/product", "state": "product", "prices": [1499.0]},
            {"url": "https://example.com/checkout", "state": "checkout", "prices": [1499.0]},
        ]
        journey = analyze_price_journey(snapshots)
        assert journey is None, "Same product and checkout price should not trigger drip pricing"
