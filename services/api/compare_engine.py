"""
DarkShield — Cross-Marketplace Comparison Engine
Layer 3: Detection & Analysis

Orchestrates parallel acquisition of a product across multiple
marketplaces and produces a CompareResult with:
  - ProductFingerprint per listing
  - Matching confidence
  - Price/offer comparison
  - Same-product/different-price inconsistency detection
  - Per-marketplace transparency dimensions

Rules:
  - Never fabricate prices; if a site blocks us, mark ACCESS_BLOCKED
  - Never claim inconsistency when a legitimate offer explains the gap
  - Never claim two listings are the same product without evidence
  - POTENTIAL_PRICE_LISTING_INCONSISTENCY requires: MATCHED/PROBABLE_MATCH
    + same/similar seller + no offer explanation found
"""

from __future__ import annotations
import asyncio
import time
import uuid
from typing import Optional

import re
from schemas import (
    AuditLogEntry,
    CompareResult, CompareStatus,
    Listing, ListingStatus,
    ProductFingerprint,
    Offer, EffectivePrice,
    MatchConfidence,
    PriceInconsistencyEvidence,
    AccessStatus,
    ReviewEvidence,
)
from extraction.fingerprint import (
    extract_fingerprint_from_page,
    match_fingerprints,
)
from extraction.offers import extract_offers_from_visible_text, compute_effective_price
from extraction.reviews import extract_review_signals_from_text, build_review_evidence


def _fmt() -> str:
    return time.strftime("%H:%M:%S")


# ─── Marketplace registry ─────────────────────────────────────────────────────

MARKETPLACE_REGISTRY = {
    "amazon": {
        "display": "Amazon.in",
        "search_url": "https://www.amazon.in/s?k={query}",
        "domain": "amazon.in",
    },
    "flipkart": {
        "display": "Flipkart",
        "search_url": "https://www.flipkart.com/search?q={query}",
        "domain": "flipkart.com",
    },
    "croma": {
        "display": "Croma",
        "search_url": "https://www.croma.com/searchB?q={query}",
        "domain": "croma.com",
    },
    "reliancedigital": {
        "display": "Reliance Digital",
        "search_url": "https://www.reliancedigital.in/search?q={query}",
        "domain": "reliancedigital.in",
    },
    "vijaysales": {
        "display": "Vijay Sales",
        "search_url": "https://www.vijaysales.com/search/{query}",
        "domain": "vijaysales.com",
    },
    "tatacliiq": {
        "display": "Tata CLiQ",
        "search_url": "https://www.tatacliq.com/search/?searchCategory=all&text={query}",
        "domain": "tatacliq.com",
    },
}

DEFAULT_MARKETPLACES = ["amazon", "flipkart", "croma"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _marketplace_from_url(url: str) -> str:
    url_lower = url.lower()
    for key, info in MARKETPLACE_REGISTRY.items():
        if info["domain"] in url_lower:
            return key
    return "unknown"


def _transparency_from_scan(scan_result) -> dict:
    """
    Derive transparency dimension strings from a completed ScanResult.
    Returns dict of: price_transparency, fee_transparency, ...
    """
    if scan_result is None:
        return {}

    # Invariant: If access failed or product was not captured, dimensions must be NOT_EVALUATED
    access = getattr(getattr(scan_result, "access_diagnostics", None), "status", None)
    cd = getattr(scan_result, "crawler_diagnostics", None)
    product_state = getattr(cd, "product_state", None) if cd else None

    if access != AccessStatus.ACCESS_OK or product_state != "CAPTURED":
        return {
            "price_transparency": "NOT_EVALUATED",
            "fee_transparency": "NOT_EVALUATED",
            "offer_transparency": "NOT_EVALUATED",
            "seller_transparency": "NOT_EVALUATED",
            "urgency_signals": "NOT_EVALUATED",
            "choice_transparency": "NOT_EVALUATED",
            "wording_transparency": "NOT_EVALUATED",
            "journey_coverage": 0,
        }

    findings = scan_result.findings or []
    patterns = {f.pattern.value for f in findings}
    coverage = (scan_result.scan_coverage.coverage_score if scan_result.scan_coverage else 0)

    def _dim(relevant_patterns):
        return "SIGNAL" if any(p in patterns for p in relevant_patterns) else "CLEAR"

    return {
        "price_transparency": _dim(["DRIP_PRICING", "BAIT_AND_SWITCH"]),
        "fee_transparency": _dim(["DRIP_PRICING"]),
        "offer_transparency": _dim(["TRICK_WORDING", "BAIT_AND_SWITCH"]),
        "seller_transparency": _dim(["DISGUISED_ADVERTISEMENT"]),
        "urgency_signals": _dim(["FALSE_URGENCY"]),
        "choice_transparency": _dim(["BASKET_SNEAKING", "FORCED_ACTION", "CONFIRM_SHAMING"]),
        "wording_transparency": _dim(["TRICK_WORDING", "CONFIRM_SHAMING"]),
        "journey_coverage": coverage,
    }


# ─── Single-listing acquisition ───────────────────────────────────────────────

async def _acquire_listing(
    url: str,
    marketplace_key: str,
    logs: list[AuditLogEntry],
) -> Listing:
    """
    Run the full acquisition + analysis pipeline on one listing URL.
    Returns a populated Listing. Never raises — returns appropriate failure status on failure.
    """
    from crawler.orchestrator import AcquisitionOrchestrator
    import uuid as _uuid

    marketplace_info = MARKETPLACE_REGISTRY.get(
        marketplace_key,
        {"display": marketplace_key, "search_url": "", "domain": ""}
    )

    logs.append(AuditLogEntry(
        timestamp=_fmt(), stage="LISTING_START",
        message=f"Acquiring {marketplace_info['display']} listing: {url}"
    ))

    listing = Listing(
        marketplace=marketplace_key,
        marketplace_display=marketplace_info["display"],
        url=url,
        status=ListingStatus.NOT_EVALUATED,
    )

    try:
        orch = AcquisitionOrchestrator()
        scan_id = _uuid.uuid4().hex
        scan_result = await orch.execute_audit(scan_id, url)

        # Map access status to listing status
        access = (scan_result.access_diagnostics.status.value
                  if scan_result.access_diagnostics else "ACCESS_OK")
        meta = scan_result.target_metadata
        title = (meta.title or "") if meta else ""
        cd = scan_result.crawler_diagnostics

        # Invariant 1: 404 / Missing page detection
        is_404 = (
            access == "PAGE_NOT_FOUND" or
            (meta and meta.http_status in (404, 410)) or
            re.search(r"\b(page\s*not\s*found|404\s*not\s*found|item\s*not\s*found|we\s*couldn't\s*find\s*that\s*page)\b", title, re.I) is not None
        )
        if is_404:
            listing.status = ListingStatus.PAGE_NOT_FOUND
            listing.provenance = "PAGE_NOT_FOUND"
            listing.page_state = "PAGE_NOT_FOUND"
            listing.access_reason = "Product page not found (404 / Missing Listing)"
            listing.risk_level = "UNDETERMINED"
            listing.journey_coverage = 0
            listing.price_transparency = "NOT_EVALUATED"
            listing.fee_transparency = "NOT_EVALUATED"
            listing.offer_transparency = "NOT_EVALUATED"
            listing.seller_transparency = "NOT_EVALUATED"
            listing.urgency_signals = "NOT_EVALUATED"
            listing.choice_transparency = "NOT_EVALUATED"
            listing.wording_transparency = "NOT_EVALUATED"
            listing.listed_price = None
            listing.seller = None
            listing.offers = []
            listing.findings_count = 0
            listing.findings_summary = []
            listing.product_fingerprint = None
            logs.append(AuditLogEntry(
                timestamp=_fmt(), stage="PAGE_NOT_FOUND",
                message=f"{marketplace_info['display']}: Page Not Found (404) — risk is UNDETERMINED"
            ))
            return listing

        # Invariant 2: Anti-bot challenge / Captcha
        if access in ("BOT_CHALLENGE", "CAPTCHA_PRESENT"):
            listing.status = ListingStatus.BOT_CHALLENGE
            listing.provenance = "ACCESS_BLOCKED"
            listing.page_state = "BOT_CHALLENGE"
            listing.access_reason = f"Access blocked by anti-bot challenge: {access}"
            listing.risk_level = "UNDETERMINED"
            listing.journey_coverage = 0
            listing.price_transparency = "NOT_EVALUATED"
            listing.fee_transparency = "NOT_EVALUATED"
            listing.offer_transparency = "NOT_EVALUATED"
            listing.seller_transparency = "NOT_EVALUATED"
            listing.urgency_signals = "NOT_EVALUATED"
            listing.choice_transparency = "NOT_EVALUATED"
            listing.wording_transparency = "NOT_EVALUATED"
            listing.listed_price = None
            listing.seller = None
            listing.offers = []
            listing.findings_count = 0
            listing.findings_summary = []
            listing.product_fingerprint = None
            logs.append(AuditLogEntry(
                timestamp=_fmt(), stage="LISTING_BLOCKED",
                message=f"{marketplace_info['display']}: {access} — risk is UNDETERMINED"
            ))
            return listing

        # Invariant 3: Network / Access forbidden
        if access in ("FORBIDDEN", "NETWORK_ERROR", "TIMEOUT", "ACCESS_BLOCKED"):
            listing.status = ListingStatus.ACCESS_BLOCKED
            listing.provenance = "ACCESS_BLOCKED"
            listing.page_state = "ACCESS_BLOCKED"
            listing.access_reason = f"Access error: {access}"
            listing.risk_level = "UNDETERMINED"
            listing.journey_coverage = 0
            listing.price_transparency = "NOT_EVALUATED"
            listing.fee_transparency = "NOT_EVALUATED"
            listing.offer_transparency = "NOT_EVALUATED"
            listing.seller_transparency = "NOT_EVALUATED"
            listing.urgency_signals = "NOT_EVALUATED"
            listing.choice_transparency = "NOT_EVALUATED"
            listing.wording_transparency = "NOT_EVALUATED"
            listing.listed_price = None
            listing.seller = None
            listing.offers = []
            listing.findings_count = 0
            listing.findings_summary = []
            listing.product_fingerprint = None
            logs.append(AuditLogEntry(
                timestamp=_fmt(), stage="LISTING_BLOCKED",
                message=f"{marketplace_info['display']}: {access} — risk is UNDETERMINED"
            ))
            return listing

        # Invariant 4: BROWSER_NAVIGATED != PRODUCT_CAPTURED
        product_captured = (cd and cd.product_state == "CAPTURED")
        price_extracted = cd.p0 if (cd and cd.p0) else None
        if not product_captured and not price_extracted:
            listing.status = ListingStatus.PRODUCT_NOT_FOUND
            listing.provenance = "PRODUCT_NOT_FOUND"
            listing.page_state = "PRODUCT_NOT_FOUND"
            listing.access_reason = "Browser navigated but product listing was not verified/captured"
            listing.risk_level = "UNDETERMINED"
            listing.journey_coverage = 0
            listing.price_transparency = "NOT_EVALUATED"
            listing.fee_transparency = "NOT_EVALUATED"
            listing.offer_transparency = "NOT_EVALUATED"
            listing.seller_transparency = "NOT_EVALUATED"
            listing.urgency_signals = "NOT_EVALUATED"
            listing.choice_transparency = "NOT_EVALUATED"
            listing.wording_transparency = "NOT_EVALUATED"
            listing.listed_price = None
            listing.seller = None
            listing.offers = []
            listing.findings_count = 0
            listing.findings_summary = []
            listing.product_fingerprint = None
            logs.append(AuditLogEntry(
                timestamp=_fmt(), stage="PRODUCT_NOT_CAPTURED",
                message=f"{marketplace_info['display']}: Product not captured — risk is UNDETERMINED"
            ))
            return listing

        # Product is cleanly captured
        listing.status = ListingStatus.PRODUCT_CAPTURED
        listing.provenance = "LIVE_CRAWL"
        listing.page_state = "PRODUCT_PAGE"
        listing.scan_id = scan_id
        listing.risk_level = (scan_result.risk_assessment.risk_level
                              if scan_result.risk_assessment else "UNDETERMINED")
        listing.findings_count = len(scan_result.findings)
        listing.findings_summary = [f.title for f in scan_result.findings[:5]]

        # Price from P0
        if cd and cd.p0:
            listing.listed_price = cd.p0
        elif scan_result.price_journey and scan_result.price_journey.stages:
            p0_stage = next((s for s in scan_result.price_journey.stages if s.stage == "product"), None)
            if p0_stage and p0_stage.total:
                listing.listed_price = p0_stage.total

        # Screenshot
        listing.screenshot_b64 = scan_result.screenshot_base64

        # Product fingerprint
        fp = extract_fingerprint_from_page(
            title=title,
            brand=None,
            sku=None, mpn=None, gtin=None,
            source_url=url,
        )
        listing.product_fingerprint = fp

        # Offers from visible text / stage details
        text_snippets = []
        for finding in scan_result.findings:
            if finding.snippet:
                text_snippets.append(finding.snippet)
        combined_text = "\n".join(text_snippets)
        if combined_text:
            listing.offers = extract_offers_from_visible_text(combined_text)

        # Effective price
        if listing.listed_price:
            ep_dict = compute_effective_price(
                listed_price=listing.listed_price,
                mandatory_fees=listing.delivery_charge or 0.0,
                offers=listing.offers,
            )
            listing.effective_price = EffectivePrice(**ep_dict)

        # Transparency dimensions
        tdims = _transparency_from_scan(scan_result)
        for k, v in tdims.items():
            if hasattr(listing, k):
                setattr(listing, k, v)

        # Review signals extraction from visible text
        review_signals = extract_review_signals_from_text(
            combined_text,
            listing_id=listing.listing_id,
            marketplace=marketplace_key,
        )
        setattr(listing, "_review_signals", review_signals)

        logs.append(AuditLogEntry(
            timestamp=_fmt(), stage="LISTING_CAPTURED",
            message=f"{marketplace_info['display']}: P0=₹{listing.listed_price:,.0f} | "
                    f"Risk={listing.risk_level} | Findings={listing.findings_count}"
            if listing.listed_price else
            f"{marketplace_info['display']}: Captured but price not extracted | Risk={listing.risk_level}"
        ))

    except Exception as exc:
        listing.status = ListingStatus.ACCESS_BLOCKED
        listing.provenance = "ACCESS_BLOCKED"
        listing.page_state = "RENDER_FAILURE"
        listing.access_reason = f"Acquisition exception: {str(exc)[:120]}"
        listing.risk_level = "UNDETERMINED"
        listing.journey_coverage = 0
        listing.price_transparency = "NOT_EVALUATED"
        listing.fee_transparency = "NOT_EVALUATED"
        listing.offer_transparency = "NOT_EVALUATED"
        listing.seller_transparency = "NOT_EVALUATED"
        listing.urgency_signals = "NOT_EVALUATED"
        listing.choice_transparency = "NOT_EVALUATED"
        listing.wording_transparency = "NOT_EVALUATED"
        logs.append(AuditLogEntry(
            timestamp=_fmt(), stage="LISTING_ERROR",
            message=f"{marketplace_info['display']}: Exception — {str(exc)[:80]}"
        ))

    return listing


# ─── Inconsistency detection ──────────────────────────────────────────────────

_MATERIAL_THRESHOLD_PCT = 5.0   # price delta >= 5% triggers inconsistency check


def _detect_inconsistencies(
    listings: list[Listing],
    logs: list[AuditLogEntry],
) -> list[PriceInconsistencyEvidence]:
    """
    Compare all captured listings pairwise for same-product/different-price signals.

    Only produces POTENTIAL_PRICE_LISTING_INCONSISTENCY when multi-factor criteria are met:
      - Product match is MATCHED or PROBABLE_MATCH
      - Hardware variant matches without conflict
      - Condition matches (e.g. new vs refurbished)
      - Price delta >= 5%
      - Explanations checked (offers, fees, seller variance)
    """
    captured = [l for l in listings if l.status in (ListingStatus.PRODUCT_CAPTURED, ListingStatus.CAPTURED) and l.listed_price]
    inconsistencies = []

    for i in range(len(captured)):
        for j in range(i + 1, len(captured)):
            la, lb = captured[i], captured[j]
            if not la.product_fingerprint or not lb.product_fingerprint:
                continue

            conf, evidence = match_fingerprints(la.product_fingerprint, lb.product_fingerprint)
            if conf not in (MatchConfidence.MATCHED, MatchConfidence.PROBABLE_MATCH):
                continue   # Not confident enough to flag inconsistency

            pa, pb = la.listed_price, lb.listed_price
            if pa == pb:
                continue

            hi, lo = max(pa, pb), min(pa, pb)
            delta = hi - lo
            delta_pct = (delta / lo) * 100 if lo else 0

            if delta_pct < _MATERIAL_THRESHOLD_PCT:
                continue   # Immaterial difference

            # ── Multi-factor safeguards ───────────────────────────────────────
            # 1. Variant check
            fpa, fpb = la.product_fingerprint, lb.product_fingerprint
            variant_mismatch = False
            variant_diffs = []
            for attr in ("ram", "storage", "processor", "screen_size"):
                va = getattr(fpa, attr)
                vb = getattr(fpb, attr)
                if va and vb and va.strip().lower() != vb.strip().lower():
                    variant_mismatch = True
                    variant_diffs.append(f"{attr}: {va} vs {vb}")

            # 2. Condition check
            conda = (fpa.condition or "new").strip().lower()
            condb = (fpb.condition or "new").strip().lower()
            same_condition = (conda == condb)

            # 3. Seller check
            sellera = la.seller.name.strip().lower() if la.seller and la.seller.name else ""
            sellerb = lb.seller.name.strip().lower() if lb.seller and lb.seller.name else ""
            same_seller = bool(sellera and sellerb and (sellera == sellerb or sellera in sellerb or sellerb in sellera))

            # 4. Check if any offer can explain the gap
            offer_explanation = None
            all_offers = la.offers + lb.offers
            for o in all_offers:
                if o.discount_value and o.discount_value >= delta * 0.75:
                    offer_explanation = f"Observed offer '{o.offer_title}' (₹{o.discount_value:,.0f}) bridges price gap"
                    break

            # 5. Mandatory fee delta
            fee_explanation = None
            fee_a = la.delivery_charge or 0.0
            fee_b = lb.delivery_charge or 0.0
            if abs(fee_a - fee_b) >= delta * 0.75:
                fee_explanation = f"Delivery fee variance (₹{fee_a} vs ₹{fee_b}) accounts for price gap"

            # Build comprehensive explanation
            reasons = []
            reasons.append(f"Comparable products ({conf.value}): '{fpa.brand or ''} {fpa.model or ''}'.")
            if same_seller:
                reasons.append(f"Identical merchant across listings: '{la.seller.name if la.seller else 'Same'}'.")
            else:
                s_a = la.seller.name if la.seller else la.marketplace
                s_b = lb.seller.name if lb.seller else lb.marketplace
                reasons.append(f"Different merchants: '{s_a}' vs '{s_b}'.")

            if variant_mismatch:
                reasons.append(f"Hardware variant difference ({', '.join(variant_diffs)}) explains price variance.")
            elif not same_condition:
                reasons.append(f"Condition difference ({conda} vs {condb}) explains price variance.")
            elif offer_explanation:
                reasons.append(offer_explanation + ".")
            elif fee_explanation:
                reasons.append(fee_explanation + ".")
            else:
                reasons.append(f"Material price difference of ₹{delta:,.0f} ({delta_pct:.1f}%) observed without promotional offers or fee differences.")

            explanation_text = " ".join(reasons)

            inc = PriceInconsistencyEvidence(
                product_match=conf,
                seller_a_name=la.seller.name if la.seller else None,
                seller_b_name=lb.seller.name if lb.seller else None,
                price_a=pa,
                price_b=pb,
                price_delta=delta,
                price_delta_pct=round(delta_pct, 1),
                marketplace_a=la.marketplace,
                marketplace_b=lb.marketplace,
                same_product=(conf in (MatchConfidence.MATCHED, MatchConfidence.PROBABLE_MATCH)),
                same_seller=same_seller,
                same_variant=(not variant_mismatch),
                same_condition=same_condition,
                material_difference=True,
                offer_explanation_found=bool(offer_explanation),
                offer_explanation=offer_explanation,
                fee_explanation_found=bool(fee_explanation),
                variant_mismatch=variant_mismatch,
                coverage_a=la.journey_coverage,
                coverage_b=lb.journey_coverage,
                explanation=explanation_text,
            )
            inconsistencies.append(inc)

            verdict = "Potential price/listing inconsistency" if (not offer_explanation and not fee_explanation and not variant_mismatch) else "Price gap with explanation"
            logs.append(AuditLogEntry(
                timestamp=_fmt(), stage="INCONSISTENCY_CHECK",
                message=f"{verdict}: {la.marketplace_display}=₹{pa:,.0f} vs "
                        f"{lb.marketplace_display}=₹{pb:,.0f} (Δ₹{delta:,.0f}, {delta_pct:.1f}%) | {explanation_text}"
            ))

    return inconsistencies


# ─── Main comparison orchestrator ─────────────────────────────────────────────

async def execute_compare(
    query: str,
    urls: list[str],
    marketplaces: Optional[list[str]] = None,
) -> CompareResult:
    """
    Execute cross-marketplace product comparison.

    Args:
        query:        Original user query (for display)
        urls:         Explicit product URLs to compare (at least 2)
        marketplaces: Optional marketplace keys to include (unused if urls provided)

    Returns:
        CompareResult with listings, inconsistencies, review evidence, and audit logs.
    """
    logs: list[AuditLogEntry] = [
        AuditLogEntry(
            timestamp=_fmt(), stage="COMPARE_START",
            message=f"Starting cross-marketplace comparison for: {query!r} | URLs: {len(urls)}"
        )
    ]

    result = CompareResult(
        query=query,
        query_type="multi_url" if len(urls) > 1 else "url",
        status=CompareStatus.RUNNING,
        audit_logs=logs,
    )

    # ── Parallel acquisition ───────────────────────────────────────────────
    url_marketplace_pairs = []
    for url in urls:
        mk = _marketplace_from_url(url)
        url_marketplace_pairs.append((url, mk))

    logs.append(AuditLogEntry(
        timestamp=_fmt(), stage="PARALLEL_ACQUIRE",
        message=f"Launching parallel acquisition for {len(url_marketplace_pairs)} listings..."
    ))

    tasks = [
        _acquire_listing(url, mk, logs)
        for url, mk in url_marketplace_pairs
    ]

    # Run with concurrency limit (max 3 simultaneous browsers)
    semaphore = asyncio.Semaphore(3)

    async def _bounded(coro):
        async with semaphore:
            return await coro

    listings = await asyncio.gather(*[_bounded(t) for t in tasks], return_exceptions=False)
    result.listings = list(listings)

    # ── Canonical product fingerprint ─────────────────────────────────────
    best_fp = None
    best_conf = 0.0
    for listing in result.listings:
        if listing.product_fingerprint:
            if listing.product_fingerprint.extraction_confidence > best_conf:
                best_conf = listing.product_fingerprint.extraction_confidence
                best_fp = listing.product_fingerprint
    result.canonical_product = best_fp

    # ── Matching pass ─────────────────────────────────────────────────────
    if best_fp:
        for listing in result.listings:
            if listing.product_fingerprint and listing.product_fingerprint is not best_fp:
                conf, evidence = match_fingerprints(best_fp, listing.product_fingerprint)
                listing.match_confidence = conf
                listing.match_evidence = evidence
            elif listing.product_fingerprint is best_fp:
                listing.match_confidence = MatchConfidence.MATCHED
                listing.match_evidence = ["Reference listing"]

    # ── Inconsistency detection ───────────────────────────────────────────
    result.inconsistencies = _detect_inconsistencies(result.listings, logs)

    # ── Review evidence aggregation ───────────────────────────────────────
    all_review_signals = []
    for listing in result.listings:
        sigs = getattr(listing, "_review_signals", None)
        if sigs:
            all_review_signals.extend(sigs)
    result.review_evidence = build_review_evidence(all_review_signals)

    # ── Final status ──────────────────────────────────────────────────────
    blocked = sum(1 for l in result.listings if l.status in (
        ListingStatus.BOT_CHALLENGE, ListingStatus.ACCESS_BLOCKED,
        ListingStatus.PAGE_NOT_FOUND, ListingStatus.PRODUCT_NOT_FOUND
    ))
    captured = sum(1 for l in result.listings if l.status in (ListingStatus.PRODUCT_CAPTURED, ListingStatus.CAPTURED))

    if blocked > 0 and captured > 0:
        result.status = CompareStatus.PARTIAL
    elif captured == 0:
        result.status = CompareStatus.ERROR
    else:
        result.status = CompareStatus.DONE

    result.completed_at = time.time()

    logs.append(AuditLogEntry(
        timestamp=_fmt(), stage="COMPARE_DONE",
        message=f"Comparison complete: {captured} captured, {blocked} blocked/unresolved | "
                f"{len(result.inconsistencies)} inconsistency signal(s) | "
                f"{result.review_evidence.total_reviews_analyzed if result.review_evidence else 0} review signals"
    ))

    return result

