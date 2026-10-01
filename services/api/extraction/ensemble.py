"""
DarkShield — Extraction: Multi-Source Price Ensemble
Combines JSON-LD, Hydration State, Network JSON, Platform Adapters, and DOM candidates.
Applies semantic ranking, filters MRP/discounts, and detects price conflicts.
"""

from __future__ import annotations
from typing import Optional
from schemas import PriceCandidate


SOURCE_WEIGHTS = {
    "adapter": 1.10,
    "json_ld": 1.00,
    "network_json": 0.98,
    "shopify_embedded": 0.96,
    "meta_tag": 0.95,
    "next_data": 0.95,
    "window_hydration_state": 0.92,
    "dom": 0.88,
    "meta": 0.80,
    "regex": 0.70,
}


class PriceEnsemble:
    def rank_and_select(
        self,
        candidates: list[PriceCandidate],
        target_stage: str = "product",
        fallback_price: Optional[float] = None,
        fallback_source: str = "NONE"
    ) -> tuple[Optional[float], str, float, list[PriceCandidate], bool]:
        """
        Ranks candidates and returns:
        (selected_price, selected_source, confidence, filtered_candidates, has_conflict)
        """
        if not candidates and fallback_price:
            return fallback_price, fallback_source, 0.75, [], False
        if not candidates:
            return None, "NONE", 0.0, [], False

        # Filter out MRP, strike-through, and discount amounts
        valid_candidates: list[PriceCandidate] = [
            c for c in candidates
            if not c.is_mrp and not c.is_discount and c.amount > 0 and c.belongs_to_product
        ]

        # If only MRP candidates were found and no selling price exists, keep them with low confidence
        if not valid_candidates:
            valid_candidates = [c for c in candidates if c.amount > 0 and not c.is_discount]

        if not valid_candidates:
            if fallback_price:
                return fallback_price, fallback_source, 0.75, candidates, False
            return None, "NONE", 0.0, candidates, False

        # Score candidates
        scored = []
        for c in valid_candidates:
            weight = SOURCE_WEIGHTS.get(c.source, 0.80)
            stage_match = 1.0 if c.stage == target_stage else 0.85
            composite_score = c.confidence * weight * stage_match
            scored.append((composite_score, c))

        scored.sort(key=lambda x: x[0], reverse=True)

        best_score, best_candidate = scored[0]
        selected_price = best_candidate.amount
        selected_source = best_candidate.source
        confidence = min(0.99, best_candidate.confidence)

        # Check for price conflicts across distinct high-confidence sources
        high_conf_prices = set()
        for score, c in scored:
            if score >= 0.75 and c.source in ("json_ld", "network_json", "adapter", "dom"):
                high_conf_prices.add(round(c.amount, 2))

        has_conflict = len(high_conf_prices) > 1

        return selected_price, selected_source, confidence, valid_candidates, has_conflict
