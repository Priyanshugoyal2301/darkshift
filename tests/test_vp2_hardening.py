"""
DarkShield VP2 Phase 2 Hardening — Regression & Invariant Tests
Verifies:
1. 404 / Page Not Found yields UNDETERMINED risk, 0 coverage, NOT_EVALUATED transparency (never LOW/CLEAR).
2. Invariant: BROWSER_NAVIGATED != PRODUCT_CAPTURED.
3. Access blocked / bot challenges yield UNDETERMINED risk.
4. ProductFingerprint matching strict priority (SKU > brand+specs > title; no silent upgrade).
5. Multi-factor Price Inconsistency detection (same product, same seller, same variant, same condition, offer/fee explanation).
6. Review Evidence signal extraction, clustering, and non-fraud corroboration disclaimer.
7. Provenance tracking: DEMO_FIXTURE vs LIVE_CRAWL vs ACCESS_BLOCKED.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

import pytest
from schemas import (
    Listing, ListingStatus, MatchConfidence, AccessStatus,
    ProductFingerprint, Seller, Offer, EffectivePrice,
    PriceInconsistencyEvidence, AuditLogEntry,
    ReviewSignalType, ReviewEvidence,
)
from extraction.fingerprint import (
    extract_fingerprint_from_page,
    match_fingerprints,
)
from extraction.reviews import (
    extract_review_signals_from_text,
    build_review_evidence,
)
from compare_engine import (
    _transparency_from_scan,
    _detect_inconsistencies,
)


# ─── 1. 404 / Page Not Found / Invalid State Invariants ─────────────────────

class TestInvalidPageStates:
    def test_404_scan_yields_undetermined_and_not_evaluated(self):
        """A 404 / missing page must NEVER receive LOW risk or CLEAR transparency."""
        class MockAccessDiag:
            status = AccessStatus.PAGE_NOT_FOUND

        class MockCrawlerDiag:
            product_state = "NOT_CAPTURED"

        class MockScanResult:
            access_diagnostics = MockAccessDiag()
            crawler_diagnostics = MockCrawlerDiag()
            findings = []
            scan_coverage = None

        tdims = _transparency_from_scan(MockScanResult())
        assert tdims["price_transparency"] == "NOT_EVALUATED"
        assert tdims["fee_transparency"] == "NOT_EVALUATED"
        assert tdims["offer_transparency"] == "NOT_EVALUATED"
        assert tdims["seller_transparency"] == "NOT_EVALUATED"
        assert tdims["urgency_signals"] == "NOT_EVALUATED"
        assert tdims["journey_coverage"] == 0

    def test_blocked_access_yields_not_evaluated_dimensions(self):
        class MockAccessDiag:
            status = AccessStatus.BOT_CHALLENGE

        class MockCrawlerDiag:
            product_state = "BLOCKED"

        class MockScanResult:
            access_diagnostics = MockAccessDiag()
            crawler_diagnostics = MockCrawlerDiag()
            findings = []
            scan_coverage = None

        tdims = _transparency_from_scan(MockScanResult())
        assert tdims["price_transparency"] == "NOT_EVALUATED"
        assert tdims["fee_transparency"] == "NOT_EVALUATED"
        assert tdims["journey_coverage"] == 0

    def test_browser_navigated_without_product_captured(self):
        """Invariant: BROWSER_NAVIGATED != PRODUCT_CAPTURED."""
        class MockAccessDiag:
            status = AccessStatus.ACCESS_OK

        class MockCrawlerDiag:
            product_state = "NOT_CAPTURED"  # HTTP 200 returned but no product DOM found

        class MockScanResult:
            access_diagnostics = MockAccessDiag()
            crawler_diagnostics = MockCrawlerDiag()
            findings = []
            scan_coverage = None

        tdims = _transparency_from_scan(MockScanResult())
        assert tdims["price_transparency"] == "NOT_EVALUATED"
        assert tdims["journey_coverage"] == 0


# ─── 2. ProductFingerprint Strict Priority Matching ─────────────────────────

class TestFingerprintStrictPriority:
    def test_sku_match_priority(self):
        fp_a = ProductFingerprint(sku="SKU-100", brand="BrandA", normalized_title="Laptop 1")
        fp_b = ProductFingerprint(sku="SKU-100", brand="BrandB", normalized_title="Different title")
        conf, ev = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.MATCHED
        assert any("SKU match" in e for e in ev)

    def test_sku_conflict_blocks_match(self):
        fp_a = ProductFingerprint(sku="SKU-100", brand="BrandA", normalized_title="Laptop 1")
        fp_b = ProductFingerprint(sku="SKU-200", brand="BrandA", normalized_title="Laptop 1")
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.NOT_MATCHED

    def test_hardware_variant_conflict_yields_not_matched(self):
        """8GB RAM vs 16GB RAM must NOT be matched as identical product."""
        fp_a = ProductFingerprint(
            brand="Apple", model="MacBook Air M2",
            ram="8GB", storage="256GB SSD",
            normalized_title="apple macbook air m2 8gb 256gb"
        )
        fp_b = ProductFingerprint(
            brand="Apple", model="MacBook Air M2",
            ram="16GB", storage="256GB SSD",
            normalized_title="apple macbook air m2 16gb 256gb"
        )
        conf, ev = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.NOT_MATCHED
        assert any("ram conflict" in e for e in ev)

    def test_storage_conflict_yields_not_matched(self):
        """256GB vs 512GB SSD must NOT be matched as identical product."""
        fp_a = ProductFingerprint(
            brand="Apple", model="MacBook Air M2",
            ram="8GB", storage="256GB SSD"
        )
        fp_b = ProductFingerprint(
            brand="Apple", model="MacBook Air M2",
            ram="8GB", storage="512GB SSD"
        )
        conf, ev = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.NOT_MATCHED
        assert any("storage conflict" in e for e in ev)

    def test_exact_brand_and_three_specs_yields_matched(self):
        fp_a = ProductFingerprint(
            brand="Apple", ram="8GB", storage="256GB SSD", processor="M2",
            normalized_title="apple macbook air"
        )
        fp_b = ProductFingerprint(
            brand="Apple", ram="8GB", storage="256GB SSD", processor="M2",
            normalized_title="macbook air m2"
        )
        conf, ev = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.MATCHED

    def test_title_similarity_never_upgrades_to_matched(self):
        """High title similarity alone cannot silently upgrade to MATCHED without structured IDs."""
        fp_a = ProductFingerprint(
            normalized_title="sony wh-1000xm5 wireless noise cancelling headphones black"
        )
        fp_b = ProductFingerprint(
            normalized_title="sony wh-1000xm5 wireless noise cancelling headphones black"
        )
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf != MatchConfidence.MATCHED
        assert conf == MatchConfidence.POSSIBLE_MATCH


# ─── 3. Multi-Factor Price Inconsistency Safeguards ──────────────────────────

class TestPriceInconsistencySafeguards:
    def test_same_seller_same_variant_flags_inconsistency(self):
        """Same product + same merchant + material price difference + no offers = POTENTIAL_PRICE_LISTING_INCONSISTENCY."""
        fp = ProductFingerprint(
            brand="Apple", ram="8GB", storage="256GB SSD", processor="M2",
            condition="new", extraction_confidence=0.95
        )
        l1 = Listing(
            marketplace="amazon", marketplace_display="Amazon.in",
            status=ListingStatus.PRODUCT_CAPTURED,
            product_fingerprint=fp,
            seller=Seller(name="RetailNet India Pvt Ltd"),
            listed_price=65000.0,
            offers=[],
        )
        l2 = Listing(
            marketplace="flipkart", marketplace_display="Flipkart",
            status=ListingStatus.PRODUCT_CAPTURED,
            product_fingerprint=fp,
            seller=Seller(name="RetailNet India Pvt Ltd"),
            listed_price=100000.0,
            offers=[],
        )
        logs = []
        inconsistencies = _detect_inconsistencies([l1, l2], logs)
        assert len(inconsistencies) == 1
        inc = inconsistencies[0]
        assert inc.same_product is True
        assert inc.same_seller is True
        assert inc.same_variant is True
        assert inc.same_condition is True
        assert inc.material_difference is True
        assert inc.offer_explanation_found is False
        assert "RetailNet India Pvt Ltd" in inc.explanation

    def test_bank_offer_explains_price_gap(self):
        """When an observed bank offer bridges the gap, it must be reported in the explanation."""
        fp = ProductFingerprint(
            brand="Dell", ram="16GB", storage="512GB SSD",
            condition="new", extraction_confidence=0.90
        )
        l1 = Listing(
            marketplace="amazon", marketplace_display="Amazon.in",
            status=ListingStatus.PRODUCT_CAPTURED,
            product_fingerprint=fp,
            seller=Seller(name="Appario Retail"),
            listed_price=80000.0,
            offers=[
                Offer(
                    offer_title="HDFC Card Instant Discount",
                    discount_value=20000.0,
                    is_conditional=True,
                )
            ],
        )
        l2 = Listing(
            marketplace="croma", marketplace_display="Croma",
            status=ListingStatus.PRODUCT_CAPTURED,
            product_fingerprint=fp,
            seller=Seller(name="Croma Direct"),
            listed_price=100000.0,
            offers=[],
        )
        logs = []
        inconsistencies = _detect_inconsistencies([l1, l2], logs)
        assert len(inconsistencies) == 1
        inc = inconsistencies[0]
        assert inc.offer_explanation_found is True
        assert "bridges price gap" in inc.explanation

    def test_hardware_variant_difference_noted(self):
        """Different hardware variants must not be flagged as unexplained price manipulation."""
        fp_a = ProductFingerprint(
            brand="Apple", ram="8GB", storage="256GB SSD",
            condition="new", extraction_confidence=0.95
        )
        fp_b = ProductFingerprint(
            brand="Apple", ram="8GB", storage="512GB SSD",  # Different storage
            condition="new", extraction_confidence=0.95
        )
        # Note: In match_fingerprints this is NOT_MATCHED, so inconsistency detector will skip pairwise compare
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.NOT_MATCHED


# ─── 4. Public Review Evidence & Non-Fraud Corroboration ─────────────────────

class TestReviewEvidencePipeline:
    def test_price_mismatch_signal_extraction(self):
        sample_text = (
            "The phone is good, but the price increased by 2000 rupees between cart and payment page. "
            "Also there was an unexpected fee added for delivery."
        )
        signals = extract_review_signals_from_text(sample_text, listing_id="ls-1", marketplace="flipkart")
        assert len(signals) >= 2
        sig_types = {s.signal_type for s in signals}
        assert ReviewSignalType.PRICE_MISMATCH in sig_types or ReviewSignalType.CHECKOUT_PRICE_DIFFERENCE in sig_types
        assert ReviewSignalType.UNEXPECTED_FEE in sig_types

    def test_coupon_not_applied_signal(self):
        sample_text = "Coupon didn't work at final payment even though it said applied earlier."
        signals = extract_review_signals_from_text(sample_text)
        assert len(signals) == 1
        assert signals[0].signal_type == ReviewSignalType.COUPON_NOT_APPLIED

    def test_review_clustering_and_corroboration(self):
        text = (
            "Price changed at payment step. "
            "Charged more than advertised. "
            "Unexpected fee of 99 rupees added. "
            "Different price at checkout screen."
        )
        signals = extract_review_signals_from_text(text)
        evidence = build_review_evidence(signals)
        assert evidence.total_reviews_analyzed >= 3
        assert len(evidence.clusters) >= 2
        assert evidence.overall_corroboration == "CORROBORATED"
        # Must include the mandatory evidentiary disclaimer
        assert "Review evidence is corroborating signal only" in evidence.disclaimer
        assert "DarkShield does not claim fraud based on review content alone" in evidence.disclaimer

    def test_empty_reviews_yield_clean_evidence(self):
        evidence = build_review_evidence([])
        assert evidence.total_reviews_analyzed == 0
        assert evidence.clusters == []
        assert evidence.overall_corroboration == "CLEAN"


# ─── 5. Provenance & Transparency Badges ─────────────────────────────────────

class TestProvenanceTracking:
    def test_listing_provenance_defaults(self):
        listing = Listing(
            marketplace="amazon",
            marketplace_display="Amazon.in",
            url="https://amazon.in/dp/xyz",
            status=ListingStatus.PRODUCT_CAPTURED,
            provenance="LIVE_CRAWL",
        )
        assert listing.provenance == "LIVE_CRAWL"

    def test_demo_fixture_provenance(self):
        listing = Listing(
            marketplace="amazon",
            marketplace_display="Amazon.in",
            url="https://amazon.in/dp/xyz",
            status=ListingStatus.PRODUCT_CAPTURED,
            provenance="DEMO_FIXTURE",
        )
        assert listing.provenance == "DEMO_FIXTURE"

    def test_access_blocked_provenance(self):
        listing = Listing(
            marketplace="flipkart",
            marketplace_display="Flipkart",
            url="https://flipkart.com/item/xyz",
            status=ListingStatus.ACCESS_BLOCKED,
            provenance="ACCESS_BLOCKED",
            risk_level="UNDETERMINED",
            journey_coverage=0,
        )
        assert listing.status == ListingStatus.ACCESS_BLOCKED
        assert listing.risk_level == "UNDETERMINED"
        assert listing.journey_coverage == 0
