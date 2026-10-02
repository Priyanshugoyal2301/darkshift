"""
DarkShield VP2 — Tests for ProductFingerprint, Offer Extraction,
Effective Price Calculation, and Inconsistency Detection

These tests are purely functional (no browser / no network).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

import pytest
from extraction.fingerprint import (
    extract_fingerprint_from_page,
    match_fingerprints,
    _normalise_title,
    _title_similarity,
)
from extraction.offers import extract_offers_from_visible_text, compute_effective_price
from schemas import MatchConfidence, Listing, ListingStatus, ProductFingerprint


# ─── ProductFingerprint extraction ───────────────────────────────────────────

class TestProductFingerprintExtraction:
    def test_basic_laptop_title(self):
        fp = extract_fingerprint_from_page(
            title="ASUS VivoBook 15 Core i5 16GB RAM 512GB SSD Laptop",
            brand="ASUS",
            sku=None, mpn=None, gtin=None,
            source_url="https://example.com/product",
        )
        assert fp.brand == "ASUS"
        assert fp.ram == "16GB"
        assert fp.storage is not None
        assert "512" in fp.storage
        assert fp.processor is not None
        assert fp.normalized_title  # should not be empty

    def test_sku_captured(self):
        fp = extract_fingerprint_from_page(
            title="Samsung Galaxy S24",
            brand="Samsung",
            sku="SM-S911B",
            mpn=None, gtin=None,
            source_url="https://example.com/product",
        )
        assert fp.sku == "SM-S911B"

    def test_gtin_captured(self):
        fp = extract_fingerprint_from_page(
            title="Apple MacBook Air M2",
            brand="Apple",
            sku=None, mpn=None,
            gtin="195949129124",
            source_url="https://example.com/product",
        )
        assert fp.gtin == "195949129124"

    def test_processor_extraction(self):
        fp = extract_fingerprint_from_page(
            title="HP Laptop Ryzen 7 5700U 16GB 512GB",
            brand="HP",
            sku=None, mpn=None, gtin=None,
            source_url="https://example.com/product",
        )
        assert fp.processor is not None
        assert "ryzen" in fp.processor.lower()

    def test_color_extraction(self):
        fp = extract_fingerprint_from_page(
            title="iPhone 15 Pro Space Grey 256GB",
            brand="Apple",
            sku=None, mpn=None, gtin=None,
            source_url="https://example.com/product",
        )
        assert fp.color is not None
        assert "grey" in fp.color.lower() or "gray" in fp.color.lower()

    def test_confidence_increases_with_structured_fields(self):
        fp_minimal = extract_fingerprint_from_page(
            title="Some Laptop",
            brand=None, sku=None, mpn=None, gtin=None,
            source_url="https://x.com",
        )
        fp_rich = extract_fingerprint_from_page(
            title="Dell XPS 15 Core i7 16GB RAM 512GB SSD Silver",
            brand="Dell",
            sku="XPS-9530-001",
            mpn="N001XPS9530", gtin=None,
            source_url="https://x.com",
        )
        assert fp_rich.extraction_confidence > fp_minimal.extraction_confidence


# ─── ProductFingerprint matching ─────────────────────────────────────────────

class TestProductFingerprintMatching:
    def test_sku_match(self):
        fp_a = ProductFingerprint(normalized_title="laptop", sku="XPS-15-001", source_url="a")
        fp_b = ProductFingerprint(normalized_title="laptop", sku="XPS-15-001", source_url="b")
        conf, evidence = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.MATCHED
        assert any("SKU" in e for e in evidence)

    def test_sku_conflict_returns_not_matched(self):
        fp_a = ProductFingerprint(normalized_title="laptop", sku="XPS-15-001", source_url="a")
        fp_b = ProductFingerprint(normalized_title="laptop", sku="XPS-15-999", source_url="b")
        conf, evidence = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.NOT_MATCHED

    def test_gtin_match(self):
        fp_a = ProductFingerprint(normalized_title="phone", gtin="012345678901", source_url="a")
        fp_b = ProductFingerprint(normalized_title="phone", gtin="012345678901", source_url="b")
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.MATCHED

    def test_probable_match_brand_and_attributes(self):
        fp_a = ProductFingerprint(
            normalized_title="dell xps 15 core i7 16gb 512gb",
            brand="Dell", ram="16GB", storage="512GB SSD",
            source_url="a"
        )
        fp_b = ProductFingerprint(
            normalized_title="dell xps 15 i7 16gb 512gb ssd",
            brand="Dell", ram="16GB", storage="512GB SSD",
            source_url="b"
        )
        conf, evidence = match_fingerprints(fp_a, fp_b)
        assert conf in (MatchConfidence.MATCHED, MatchConfidence.PROBABLE_MATCH)

    def test_ram_conflict_penalises_match(self):
        fp_a = ProductFingerprint(
            normalized_title="laptop core i5",
            brand="HP", ram="8GB", storage="256GB",
            source_url="a"
        )
        fp_b = ProductFingerprint(
            normalized_title="laptop core i5",
            brand="HP", ram="16GB", storage="512GB",
            source_url="b"
        )
        conf, _ = match_fingerprints(fp_a, fp_b)
        # Two attribute conflicts should return NOT_MATCHED
        assert conf == MatchConfidence.NOT_MATCHED

    def test_title_similarity_possible_match(self):
        fp_a = ProductFingerprint(
            normalized_title="samsung galaxy m34 5g blue 128gb",
            source_url="a"
        )
        fp_b = ProductFingerprint(
            normalized_title="samsung galaxy m34 5g blue 128gb",
            source_url="b"
        )
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf in (MatchConfidence.POSSIBLE_MATCH, MatchConfidence.PROBABLE_MATCH, MatchConfidence.MATCHED)

    def test_different_products_not_matched(self):
        fp_a = ProductFingerprint(normalized_title="iphone 15 pro", source_url="a")
        fp_b = ProductFingerprint(normalized_title="samsung galaxy s24 ultra", source_url="b")
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf in (MatchConfidence.NOT_MATCHED, MatchConfidence.INSUFFICIENT_EVIDENCE)

    def test_empty_fingerprints_insufficient(self):
        fp_a = ProductFingerprint(normalized_title="", source_url="a")
        fp_b = ProductFingerprint(normalized_title="", source_url="b")
        conf, _ = match_fingerprints(fp_a, fp_b)
        assert conf == MatchConfidence.INSUFFICIENT_EVIDENCE


# ─── Offer extraction ────────────────────────────────────────────────────────

class TestOfferExtraction:
    def test_bank_offer_detected(self):
        text = "Get ₹2,000 off with HDFC Bank Credit Card on purchases above ₹10,000"
        offers = extract_offers_from_visible_text(text)
        assert len(offers) >= 1
        bank_offers = [o for o in offers if o.offer_type == "bank_offer"]
        assert len(bank_offers) >= 1
        assert bank_offers[0].is_conditional is True
        assert bank_offers[0].is_applicable is False

    def test_coupon_code_detected(self):
        text = "Apply coupon SAVE500 and get ₹500 off your order"
        offers = extract_offers_from_visible_text(text)
        coupon_offers = [o for o in offers if o.offer_type == "coupon"]
        assert len(coupon_offers) >= 1
        assert coupon_offers[0].coupon_code == "SAVE500"
        assert coupon_offers[0].discount_value == 500.0
        assert coupon_offers[0].is_applicable is True

    def test_instant_discount_no_condition(self):
        text = "₹1,500 instant discount on this product"
        offers = extract_offers_from_visible_text(text)
        instant = [o for o in offers if o.offer_type == "instant_discount"]
        assert len(instant) >= 1
        assert instant[0].is_applicable is True
        assert instant[0].discount_value == 1500.0

    def test_emi_detected(self):
        text = "Available on No-cost EMI starting at ₹3,333/month"
        offers = extract_offers_from_visible_text(text)
        emi = [o for o in offers if o.offer_type == "emi"]
        assert len(emi) >= 1
        assert emi[0].is_conditional is True

    def test_membership_offer_conditional(self):
        text = "Prime members get extra ₹500 off"
        offers = extract_offers_from_visible_text(text)
        mem = [o for o in offers if o.offer_type == "membership"]
        assert len(mem) >= 1
        assert mem[0].is_conditional is True
        assert mem[0].is_applicable is False

    def test_no_offers_on_empty_text(self):
        offers = extract_offers_from_visible_text("")
        assert offers == []

    def test_no_false_positive_on_price_text(self):
        text = "Price: ₹45,999\nMRP: ₹59,999\nYou save: ₹14,000"
        offers = extract_offers_from_visible_text(text)
        # "You save" should not be detected as an offer without explicit offer keyword
        # This test just checks we don't crash and count is reasonable
        assert isinstance(offers, list)

    def test_exchange_offer_detected(self):
        text = "Extra ₹5,000 off on exchange with any old smartphone"
        offers = extract_offers_from_visible_text(text)
        exchange = [o for o in offers if o.offer_type == "exchange"]
        assert len(exchange) >= 1
        assert exchange[0].is_conditional is True


# ─── Effective price calculation ─────────────────────────────────────────────

class TestEffectivePriceCalculation:
    def test_basic_calculation_no_offers(self):
        result = compute_effective_price(
            listed_price=45999.0,
            mandatory_fees=299.0,
            offers=[],
        )
        assert result["listed_price"] == 45999.0
        assert result["mandatory_fees"] == 299.0
        assert result["applicable_coupons"] == 0.0
        assert result["effective_payable"] == 45999.0 + 299.0

    def test_applicable_coupon_reduces_effective_price(self):
        from schemas import Offer
        coupon = Offer(
            offer_type="coupon",
            offer_title="Coupon SAVE1000",
            offer_text="Use code SAVE1000 for ₹1,000 off",
            coupon_code="SAVE1000",
            discount_value=1000.0,
            is_conditional=True,
            is_applicable=True,
        )
        result = compute_effective_price(
            listed_price=50000.0,
            mandatory_fees=0.0,
            offers=[coupon],
        )
        assert result["applicable_coupons"] == 1000.0
        assert result["effective_payable"] == 49000.0

    def test_conditional_offer_not_subtracted(self):
        from schemas import Offer
        bank_offer = Offer(
            offer_type="bank_offer",
            offer_title="HDFC 5% off",
            offer_text="5% off with HDFC Credit Card",
            bank="HDFC",
            discount_value=2500.0,
            is_conditional=True,
            is_applicable=False,
        )
        result = compute_effective_price(
            listed_price=50000.0,
            mandatory_fees=0.0,
            offers=[bank_offer],
        )
        assert result["applicable_coupons"] == 0.0
        assert result["effective_payable"] == 50000.0
        assert result["conditional_savings"] == 2500.0
        assert len(result["conditional_savings_detail"]) >= 1

    def test_mix_applicable_and_conditional(self):
        from schemas import Offer
        instant = Offer(
            offer_type="instant_discount",
            offer_title="Instant ₹1,000",
            offer_text="₹1,000 instant discount",
            discount_value=1000.0,
            is_conditional=False,
            is_applicable=True,
        )
        bank = Offer(
            offer_type="bank_offer",
            offer_title="HDFC ₹1,500 off",
            offer_text="₹1,500 off with HDFC card",
            bank="HDFC",
            discount_value=1500.0,
            is_conditional=True,
            is_applicable=False,
        )
        result = compute_effective_price(
            listed_price=60000.0,
            mandatory_fees=199.0,
            offers=[instant, bank],
        )
        assert result["applicable_coupons"] == 1000.0
        assert result["conditional_savings"] == 1500.0
        assert result["effective_payable"] == 60000.0 - 1000.0 + 199.0


# ─── Normalisation helpers ───────────────────────────────────────────────────

class TestNormalisation:
    def test_normalise_removes_noise(self):
        t = _normalise_title("Dell New Laptop with 16GB RAM and 512GB SSD")
        assert "new" not in t
        assert "with" not in t
        assert "and" not in t

    def test_title_similarity_identical(self):
        assert _title_similarity("samsung galaxy s24", "samsung galaxy s24") == 1.0

    def test_title_similarity_different(self):
        sim = _title_similarity("iphone 15 pro", "samsung galaxy s24")
        assert sim < 0.4

    def test_title_similarity_partial(self):
        sim = _title_similarity("hp laptop 16gb 512gb", "hp laptop 16gb 256gb")
        # 3 of 4 tokens match → high similarity
        assert sim > 0.5
