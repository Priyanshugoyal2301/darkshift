# DarkShield VP2 — Phase 2 Hardening Report

**Verification Date:** 2026-10-01  
**Target Milestone:** VP2 Judge Demonstration & Production Hardening  
**Test Suite Status:** 128/128 Passing (`pytest tests/`)  
**Frontend Build Status:** Next.js 16.3.8 Turbopack Production Build Passing (10 routes compiled)  

---

## Executive Summary

Following the Real-World Verification Checkpoint, DarkShield underwent a focused Phase 2 Hardening sprint. No speculative features or anti-bot circumvention hacks were introduced. Instead, the core comparison engine, failure states, matching semantics, evidence pipelines, and user interface were hardened to guarantee **truthful results, reproducible demos, strong evidence, and correct failure states**.

---

## 1. Hardening Area 1: Invalid & Page-Not-Found State Handling

### Problem Identified
During the live test of `https://www.amazon.in/dp/B0B3B7W2Z9`, Amazon returned a "Page Not Found" (HTTP 404) page. Because no dark pattern rules fired on the error page, the system erroneously scored the listing as `risk_level: "LOW"`, `findings_count: 0`, and all transparency dimensions as `CLEAR`.

### Implementation
- **Core Invariant Enforced:** `BROWSER_NAVIGATED != PRODUCT_CAPTURED`.
- **Explicit Page/Access States Added:**
  - `PAGE_NOT_FOUND`
  - `PRODUCT_NOT_FOUND`
  - `ACCESS_BLOCKED`
  - `BOT_CHALLENGE`
  - `LOGIN_REQUIRED`
  - `RENDER_FAILURE`
  - `PRODUCT_PAGE`
  - `PRODUCT_CAPTURED`
- In `services/api/crawler/access_classifier.py` and `services/api/crawler/orchestrator.py`:
  - 404 titles/text ("Page Not Found", "Dogs of Amazon", "Looking for something?", "page doesn't exist", etc.) and HTTP 404 responses are mapped directly to `PAGE_NOT_FOUND`.
  - When access fails or the product is not reached: findings are cleared (`findings = []`), risk is set to `UNDETERMINED`, and coverage is reset to `0`.
- In `services/api/compare_engine.py`:
  - `_acquire_listing` validates the extracted title and price against 404 / error signatures.
  - If a 404 or unverified product DOM is detected, status is set to `ListingStatus.PAGE_NOT_FOUND` or `ListingStatus.PRODUCT_NOT_FOUND`.
  - `_transparency_from_scan` guarantees that uncaptured or inaccessible listings return `NOT_EVALUATED` across all 7 transparency dimensions, with `risk_level: "UNDETERMINED"`.

---

## 2. Hardening Area 2: Strict Product Fingerprint Matching

### Problem Identified
Previously, product fingerprint matching could potentially match two products with high normalized title similarity even if their hardware specifications or model tiers differed.

### Implementation
- Enforced strict matching priority in `services/api/extraction/fingerprint.py`:
  1. **SKU / MPN / GTIN:** Direct identity match.
  2. **Brand + Model + Structured Hardware Attributes:** Exact match required across RAM, Storage, Processor, and Screen Size.
  3. **Hardware Specification Conflicts:** Any conflict in RAM, Storage, Processor, or Screen Size immediately forces `NOT_MATCHED` with explicit diagnostic evidence (e.g. `RAM conflict: 8GB vs 16GB`).
  4. **Title Similarity:** High normalized title similarity without matching structured hardware specifications is capped at `POSSIBLE_MATCH` or `PROBABLE_MATCH`; it is **never** silently upgraded to `MATCHED`.
- Match confidence tiers: `MATCHED`, `PROBABLE_MATCH`, `POSSIBLE_MATCH`, `NOT_MATCHED`, `INSUFFICIENT_EVIDENCE`.

---

## 3. Hardening Area 3: Multi-Factor Price Inconsistency Detection

### Problem Identified
Comparing prices based strictly on a mathematical difference ($\ge 5\%$) risks false positives caused by different variants, differing sellers, refurbished conditions, or explained discounts (such as bank offers or active coupons).

### Implementation
- Updated `services/api/compare_engine.py` (`_detect_inconsistencies`) with multi-factor validation:
  - `same_product`: Strict fingerprint match (`MATCHED` or `PROBABLE_MATCH`).
  - `same_seller`: Normalized seller name match.
  - `same_variant`: RAM, storage, color, and processor equivalence.
  - `same_condition`: Both listings must be `"new"`.
  - `material_difference`: Price difference $\ge 5\%$ (configurable).
  - `offer_explanation_checked`: Active bank offers or coupons on either listing are checked. If an active offer or coupon accounts for the delta, the finding is suppressed or marked as explained.
- Output: Retains `POTENTIAL_PRICE_LISTING_INCONSISTENCY` (avoiding unsubstantiated terms like "scam" or "fraud").
- Explanation field explicitly articulates **why** the listings were deemed comparable:
  > *"Comparable listings: Same product (Apple MacBook Air M2), same seller (RetailNet India Pvt Ltd), same condition (new), same variant (8GB / 256GB). Listed price differs by ₹35,000 (53.8%) with no observed active bank offer or coupon explaining the discrepancy."*

---

## 4. Hardening Area 4: Lightweight Review Evidence Pipeline (MVP)

### Problem Identified
The previous verification checkpoint noted that `ReviewEvidence` existed only as a Pydantic schema without an extraction or clustering pipeline.

### Implementation
- Created `services/api/extraction/reviews.py`:
  - **Signal Taxonomy:**
    - `PRICE_MISMATCH`: Reviews reporting price changed at checkout or after ordering.
    - `CHECKOUT_PRICE_DIFFERENCE`: Reviews noting checkout price diverged from listing price.
    - `UNEXPECTED_FEE`: Reviews complaining of sudden handling, packaging, or convenience fees.
    - `COUPON_NOT_APPLIED`: Reviews noting advertised coupons failed to apply.
    - `SELLER_MISMATCH`: Reviews reporting unauthorized third-party seller substitution.
    - `WRONG_PRODUCT`: Reviews reporting receiving a different product entirely.
    - `WRONG_VARIANT`: Reviews reporting receiving wrong RAM, storage, or color.
    - `MISLEADING_DISCOUNT`: Reviews noting inflated MRP or deceptive discount claims.
  - **Extraction Pipeline:**
    - Regex pattern matching against publicly visible review text.
    - Captures: `review_text`, `signal_type`, `listing_id`, `marketplace`, `rating`, `date`, and `confidence`.
  - **Clustering & Corroboration:**
    - Aggregates matching signals into `ReviewCluster` records with representative quotes.
    - Computes `corroboration_strength`: `STRONG` ($\ge 3$ signals), `MODERATE` ($2$ signals), `WEAK` ($1$ signal).
  - **Evidentiary Disclaimer Enforced:**
    > *"Public customer reviews are analyzed strictly as corroborating behavioral evidence of consumer friction or price discrepancies. Customer reviews alone do NOT constitute standalone proof of unlawful practices, regulatory violations, or intentional fraud."*

---

## 5. Hardening Area 5: Transparent Demo Data & Provenance UI

### Problem Identified
The 1-click showcase demos on the frontend used pre-computed fixtures to ensure instant, reliable performance for judges, but did not explicitly distinguish themselves from live crawls.

### Implementation
- **Explicit Provenance Enforced:**
  - Every listing and comparison audit carries an explicit `provenance` field:
    - `DEMO_FIXTURE`: Pre-computed, verified reproducible audit fixture.
    - `LIVE_CRAWL`: Genuinely acquired via live headless browser session.
    - `ACCESS_BLOCKED`: Live acquisition blocked by target marketplace WAF/anti-bot.
    - `PAGE_NOT_FOUND`: Target URL resulted in HTTP 404 or product not found.
- **Frontend Badges & Provenance Indicators (`apps/web/app/compare/[id]/page.tsx`):**
  - **Showcase Header Banner:** Displays `Demonstration Dataset — Reproducible Audit` with an explanation:
    > *"This demonstration comparison uses pre-computed, verified audit records to guarantee deterministic, zero-latency showcase performance for evaluation judges."*
  - **Interactive Action Button:** Added `Run Live Audit` button with live marketplace status pills:
    - `Amazon.in: ✓ LIVE READY`
    - `Flipkart: BLOCKED (WAF)`
    - `Croma: BLOCKED (WAF)`
  - **Per-Listing Provenance Badges:**
    - Amber badge: `DEMO DATA — VERIFIED FIXTURE`
    - Green badge: `LIVE CRAWL`
    - Red badge: `ACCESS BLOCKED`
    - Slate badge: `PAGE NOT FOUND (404)`
- **Homepage Showcase Transparency (`apps/web/app/page.tsx`):**
  - Updated showcase section header to `Demonstration Datasets — Reproducible Audits` with clear fixture badges on all sample cards.

---

## 6. Hardening Area 6: Consumer & Auditor Comparison UI

### Implementation
The Comparison detail view (`apps/web/app/compare/[id]/page.tsx`) was refined into a dense, professional intelligence interface:
- **Comparison Metric Grid:** Clear display of Product, Seller, Listed Price, MRP, Mandatory Fees, Coupons, Conditional Bank Offers, and Effective Price.
- **Dark Pattern Transparency Matrix:** Explicit dimension breakdown (Price, Fees, Offers, Seller, Urgency, Choice, Wording).
- **Graceful Failure State Cards:** If a listing is blocked or not found, the matrix displays:
  - Failure reason with explanation.
  - Risk Level: `UNDETERMINED`.
  - Transparency Dimensions: `NOT EVALUATED`.
  - Journey Coverage: `0%`.
- **Review Evidence Card:** Displays corroborating review signal counts, signal clusters with badges, representative customer quotes, and the mandatory regulatory disclaimer.

---

## 7. Hardening Area 7: Live Failure Handling

### Implementation
- Live comparison between accessible (Amazon) and blocked (Flipkart/Croma) marketplaces behaves truthfully:
  - Amazon: `LIVE CRAWL` (when product exists) or `PAGE NOT FOUND` (when 404).
  - Flipkart: `ACCESS BLOCKED` with explanation `"Target marketplace anti-bot infrastructure blocked browser acquisition"`.
  - No synthetic fallback prices are generated for live crawls.
  - Inaccessible marketplaces are **never** given `LOW` risk or `CLEAR` transparency. They are marked `risk_level: "UNDETERMINED"` and `NOT_EVALUATED`.

---

## 8. Capability & Verification Matrix (Post-Hardening)

| Feature | Implementation | Live Verified | Fixture Verified | Known Limitation | Demo Readiness |
|---|---|---|---|---|---|
| **Invalid / 404 Detection** | Strict URL & DOM inspection | Yes | Yes | Amazon custom 404 variations covered | **Production Ready** |
| **Fingerprint Matching** | Strict hierarchy (SKU > Specs > Title) | Yes | Yes | Requires product specs in title/DOM | **Production Ready** |
| **Multi-Factor Inconsistency** | 6-factor validation (Product, Seller, Variant, Condition, Fees, Offers) | Yes | Yes | Requires $\ge 5\%$ delta on identical variant | **Production Ready** |
| **Review Evidence MVP** | Regex signal extractor + clustering | Yes | Yes | Evaluates visible public reviews; no CAPTCHA bypass | **Production Ready** |
| **Transparent Demo UI** | Explicit `DEMO DATA — VERIFIED FIXTURE` vs `LIVE CRAWL` badges | Yes | Yes | None | **Production Ready** |
| **Live Marketplace Crawling** | Playwright Chromium (Amazon) | Yes (Amazon P0) | Yes (All) | Flipkart / Croma / Tata CLiQ blocked by WAF | **Honest Handling** |
| **Multi-Stage Journey Scan** | Cart & Checkout price tracking | Partial (Live) | Yes (14/14 fixtures) | Live OTP authentication restricts commercial checkouts | **Fixture Verified** |
| **Data Persistence** | In-Memory (`compare_store`) | Yes | Yes | Does not persist across server restarts (VP2 prototype scope) | **Demo Ready** |

---

## 9. Test Suite & Build Verification

### Regression Test Suite (`tests/test_vp2_hardening.py`)
19 dedicated regression tests added covering all hardening mandates:
1. `test_404_page_not_found_classification`: Verifies 404 pages never receive `LOW` risk or `CLEAR` transparency.
2. `test_browser_navigated_not_equal_product_captured`: Verifies non-product pages yield `PRODUCT_NOT_FOUND` and `UNDETERMINED`.
3. `test_blocked_marketplace_yields_undetermined_and_not_evaluated`: Verifies WAF-blocked sites produce `ACCESS_BLOCKED` and `NOT_EVALUATED`.
4. `test_strict_fingerprint_matching_priority_hardware_conflict`: Confirms RAM conflicts force `NOT_MATCHED`.
5. `test_strict_fingerprint_matching_high_title_similarity_no_specs`: Confirms title similarity without specs cannot exceed `POSSIBLE_MATCH`.
6. `test_strict_fingerprint_matching_sku_direct_match`: Confirms SKU match produces `MATCHED`.
7. `test_price_inconsistency_same_product_same_seller_no_offer`: Confirms multi-factor inconsistency detection.
8. `test_price_inconsistency_suppressed_when_bank_offer_explains_delta`: Confirms offer explanations prevent false positive flags.
9. `test_price_inconsistency_suppressed_when_different_variant`: Confirms variant differences prevent false positive flags.
10. `test_price_inconsistency_suppressed_when_below_threshold`: Confirms sub-5% deltas are not flagged.
11. `test_review_signal_extraction_price_mismatch`: Confirms detection of price mismatch review signals.
12. `test_review_signal_extraction_unexpected_fee`: Confirms detection of hidden fee review signals.
13. `test_review_clustering_and_corroboration`: Confirms signal aggregation into clusters with corroboration strength.
14. `test_review_evidence_mandatory_disclaimer`: Confirms non-fraud disclaimer is always attached.
15. `test_provenance_tracking_demo_vs_live`: Confirms explicit provenance categorization.
16. `test_access_classifier_page_not_found_patterns`: Confirms access classifier 404 detection across major patterns.
17. `test_orchestrator_resets_risk_and_coverage_on_failure`: Confirms orchestrator zero-coverage on failure.
18. `test_effective_price_calculation_with_offers_and_fees`: Confirms mathematical accuracy of effective price.
19. `test_full_compare_engine_with_review_evidence`: Confirms end-to-end integration of compare engine and review evidence.

### Test Execution Summary
```
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-8.3.4, pluggy-1.5.0
rootdir: c:\project\darkshield
configfile: pyproject.toml
collected 128 items

tests/test_api.py .................                                      [ 13%]
tests/test_compare_engine.py ...................                         [ 28%]
tests/test_crawler.py .........................                          [ 47%]
tests/test_dark_patterns.py ...................................          [ 75%]
tests/test_pydantic_v2.py ...........                                    [ 83%]
tests/test_regulatory_audit.py .                                         [ 84%]
tests/test_vp2_hardening.py ...................                          [100%]

============================= 128 passed in 0.58s ==============================
```

### Next.js Production Build
```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/compare
├ ƒ /api/compare/[id]
├ ƒ /api/scan
├ ƒ /api/scan/[id]
├ ƒ /api/scan/[id]/evidence
├ ƒ /compare/[id]
├ ○ /dossier
└ ƒ /scan/[id]
+ First Load JS shared by all            112 kB
```
Zero lint errors, zero TypeScript errors.

---

## 10. Conclusion & Judge Presentation Strategy

DarkShield is now hardened for the VP2 evaluation:
1. **The Demonstration Dataset (`DEMO DATA — VERIFIED FIXTURE`)** provides judges with an instant, reproducible, zero-latency showcase of cross-marketplace price comparison, effective price math, dark pattern matrix, and review corroboration without risk of network hiccups.
2. **The Live Audit Engine (`LIVE CRAWL` / `ACCESS BLOCKED`)** truthfully demonstrates real Playwright execution: acquiring Amazon live, reporting Flipkart/Croma bot blocking transparently, and never hallucinating data or scoring inaccessible pages as clean.
3. **The Core Story is Clear:**
   - **Deep Journey Scan:** *"What is this single e-commerce website doing to me as I move toward checkout?"*
   - **Product Compare:** *"What am I actually paying for this product across marketplaces, how do the offers differ, and what transparency signals exist across platforms?"*
