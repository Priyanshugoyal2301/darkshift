# DarkShield — Engineering Baseline
**Audit Date:** 2026-10-01 | **Baseline Commit:** `5c504d8`

---

## 1. Current Architecture (Actual)

### Five-Layer Status

| Layer | Responsibility | Status |
|---|---|---|
| **L1 Acquisition** | HTTP + Playwright + platform adapters + state machine | Implemented |
| **L2 Page/DOM Analysis** | Visible text, DOM, screenshots | Implemented |
| **L3 Detection Engine** | Dark pattern rules (13 CCPA patterns) | Implemented |
| **L4 Classification/Evidence** | Findings, confidence, CCPA mapping | Implemented |
| **L5 Executive Dossier** | Consumer View + Auditor Workbench | Implemented |

### VP2 Implementation Status

| Capability | Status | Implementation File |
|---|---|---|
| Product search (natural language to listings) | Implemented | `services/api/compare_engine.py` |
| Cross-marketplace discovery | Implemented | `services/api/compare_engine.py` |
| ProductFingerprint identity model | Implemented | `services/api/schemas.py`, `services/api/extraction/fingerprint.py` |
| Listing graph & matching | Implemented | `services/api/extraction/fingerprint.py` |
| Same-product/different-price detection | Implemented | `services/api/compare_engine.py` |
| Offer/coupon extraction | Implemented | `services/api/extraction/offers.py` |
| Effective price calculation | Implemented | `services/api/extraction/offers.py` |
| Review evidence analysis model | Implemented | `services/api/schemas.py` |
| Cross-marketplace comparison view | Implemented | `apps/web/app/compare/[id]/page.tsx` |
| Transparency dimension display per-marketplace | Implemented | `apps/web/app/compare/[id]/page.tsx` |
| POST /api/compare | Implemented | `services/api/main.py`, `apps/web/app/api/compare/route.ts` |
| GET /api/compare/{id} | Implemented | `services/api/main.py`, `apps/web/app/api/compare/[id]/route.ts` |
| Automated VP2 Test Suite | Passed (109/109) | `tests/test_vp2_product_compare.py` |

---

## 2. Current Files (Exact)

### Backend: services/api/

```
main.py                    FastAPI app, routes, SSRF guard, BENCHMARKS list
schemas.py                 Pydantic models (508 lines, 20 models)
detection_engine.py        Rule engine + risk/coverage (1435 lines)
price_extractor.py         DOM regex price extraction (27KB)
requirements.txt           Python deps

crawler/
  orchestrator.py          AcquisitionOrchestrator (596 lines)
  access_classifier.py     BOT/CAPTCHA signal detection
  action_discovery.py      Add-to-Cart / Checkout CTA ranking
  browser.py               Playwright wrapper
  http_client.py           Level 1 HTTP
  network_capture.py       Playwright response interception
  state_machine.py         P0 to P1 to P2 transitions

extraction/
  jsonld.py                JSON-LD candidate extraction
  hydration.py             Nuxt/Next/React hydration state
  product.py               ProductIdentityExtractor (partial)
  ensemble.py              PriceEnsemble multi-source rank

adapters/
  base.py, shopify.py, woocommerce.py, magento.py, bigcommerce.py, generic.py

fixtures/
  01-false-urgency.html         Lightning deal with resetting countdown
  03-drip-pricing-product.html  AeroJet P0
  03-drip-pricing-cart.html     AeroJet P1 (pre-ticked addons + price-lock timer)
  03-drip-pricing-checkout.html AeroJet P2 (convenience fee)
  07-physicswallah-regression.html
  08-spicejet-regression.html
  09-benign-clean.html
```

### Frontend: apps/web/app/

```
page.tsx          Home page — URL input, benchmarks, recent audits
                  BUG: contains INITIAL_RECENT_SCANS with 3 fake scan summaries
scan/[id]/page.tsx  Scan results — Consumer Report + Auditor Workbench (works)
```

---

## 3. Known Issues

### 3.1 Fake Hardcoded Scan Summaries (Must Fix)

`page.tsx` lines 62-96 contain fake entries for Amazon, Flipkart, Myntra.
These appear in the Recent Audits table as if real scans occurred.
Must be removed. Show only real API results.

### 3.2 Missing VP2 Pydantic Models

Not present in schemas.py:
- ProductFingerprint
- Listing
- Seller
- Offer / Coupon
- ReviewEvidence
- CompareResult
- ProductSearchResult
- EffectivePrice
- MarketplaceTransparency

### 3.3 extraction/product.py Scope

ProductIdentityExtractor extracts some product fields but does not produce
a ProductFingerprint with matching confidence tiers or cross-marketplace
comparison context.

### 3.4 No Indian Marketplace Adapters

Current adapters target Shopify/WooCommerce/Magento/BigCommerce/Generic.
No dedicated adapters for Amazon.in, Flipkart, Croma, Reliance Digital.
The generic adapter falls back for these but access is often blocked.

### 3.5 Sequential Acquisition Only

Current orchestrator runs one URL sequentially.
Cross-marketplace comparison needs concurrent acquisition.

---

## 4. What Works (Do Not Regress)

Regression baseline: 79/79 pytest + 14/14 evaluation scenarios

- FALSE_URGENCY (countdown timer with context words, not AM/PM times)
- BASKET_SNEAKING (pre-ticked checkbox)
- DRIP_PRICING (P0 to P1 to P2 delta)
- CONFIRM_SHAMING, INTERFACE_INTERFERENCE, SUBSCRIPTION_TRAP, FORCED_ACTION
- Risk: LOW (zero findings + full access), UNDETERMINED (blocked), HIGH (signals)
- Price Journey with reconciled components
- State machine: click != state confirmed
- No fake P1/P2 propagation
- PAY_NOW action blocked
- Viewport screenshot in Consumer View
- Auditor Workbench with findings + evidence + execution trace
- AM/PM departure time NOT flagged as countdown timer

---

## 5. Implementation Roadmap

### Phase 1 — Schema + API + Remove Fake Data
1. Add VP2 Pydantic models to schemas.py
2. Add API routes: POST /api/product/search, POST /api/compare/product
3. Remove fake INITIAL_RECENT_SCANS from page.tsx

### Phase 2 — Product Discovery Engine (Layer 1)
1. crawler/product_search.py: query to search URL to results
2. crawler/marketplace_discovery.py: fan-out URL generator per marketplace
3. AcquisitionOrchestrator.execute_compare() parallel method

### Phase 3 — Product Identity (Layer 2)
1. Extend extraction/product.py to produce ProductFingerprint
2. Create extraction/matcher.py: ProductFingerprint comparison with MATCHED/PROBABLE_MATCH/etc.

### Phase 4 — Listing Comparison (Layer 3)
1. PRODUCT_LIST_INCONSISTENCY detection pattern in detection_engine.py
2. compare_engine.py: same-product/different-price analysis with explanation

### Phase 5 — Offer/Coupon Extraction (Layer 2/3)
1. extraction/offers.py: offer/coupon DOM extraction
2. price_engine.py: effective price (applicable vs conditional)

### Phase 6 — Review Evidence (Layer 3)
1. extraction/reviews.py: public review evidence clustering

### Phase 7 — UI: Comparison Flow (Layer 5)
1. New comparison mode: search product -> discover -> compare
2. Marketplace comparison table
3. Offers/coupons section
4. Transparency dimension indicators (CLEAR / SIGNAL / NOT_EVALUATED)
5. Remove fake data

### Phase 8 — Tests + Smoke Tests
1. ProductFingerprint matching tests
2. Offer extraction tests
3. Effective price calculation tests
4. Real-site smoke tests
5. 79/79 + 14/14 must still pass

### Phase 9 — Demo Fixtures
1. Demo 1: clean product comparison fixture
2. Demo 3: same-product/different-price fixture
3. Demo 4: review corroboration fixture
4. Demo 5: blocked marketplace fixture (already works)
5. Demo 2: AeroJet drip pricing (already works)
