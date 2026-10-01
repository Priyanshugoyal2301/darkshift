"""
DarkShield — Crawler: Action Discovery & Intent Scoring
Finds, scores, and contextually classifies candidate interactive elements (Add to Cart & Checkout).
Strictly eliminates navigation noise and non-purchasing UI elements.
"""

from __future__ import annotations
import re
from typing import Optional
from schemas import ActionPolicyTier, ActionClassification
from detection_engine import NAVIGATION_NOISE_REGEX, classify_action_element, score_checkout_action


ADD_TO_CART_REGEX = re.compile(
    r"\b(add\s+to\s+(?:cart|bag|basket)|buy\s+now|order\s+now|book\s+now|enroll\s+now|subscribe\s+now)\b",
    re.I
)


class ActionDiscovery:
    def score_cart_candidate(
        self,
        text: str,
        tag: str,
        href: str = "",
        form_action: str = "",
        is_in_product_form: bool = False,
        is_visible: bool = True
    ) -> float:
        if not is_visible or not text:
            return 0.0

        if NAVIGATION_NOISE_REGEX.search(text):
            return -100.0

        score = 0.0
        lower_text = text.lower().strip()

        if ADD_TO_CART_REGEX.search(lower_text):
            score += 45.0
        elif "cart" in lower_text or "bag" in lower_text:
            score += 20.0

        if "/cart/add" in form_action or "/cart" in href:
            score += 25.0

        if is_in_product_form:
            score += 20.0

        if tag in ("button", "input"):
            score += 10.0

        return score

    def rank_add_to_cart_candidates(self, candidates: list[dict]) -> list[tuple[dict, ActionClassification, float]]:
        ranked = []
        for c in candidates:
            score = self.score_cart_candidate(
                text=c.get("text", ""),
                tag=c.get("tag", ""),
                href=c.get("href", ""),
                form_action=c.get("form_action", ""),
                is_in_product_form=bool(c.get("form_action")),
                is_visible=c.get("is_visible", True)
            )

            decision = classify_action_element(
                text=c.get("text", ""),
                tag=c.get("tag", ""),
                attributes={"href": c.get("href", ""), "type": c.get("type", "")},
                form_context={"action": c.get("form_action", ""), "inputs": c.get("form_inputs", [])},
                current_stage="product"
            )

            if decision.action_tier == ActionPolicyTier.BLOCKED or score <= 0.0:
                continue

            ranked.append((c, decision, score))

        ranked.sort(key=lambda x: x[2], reverse=True)
        return ranked

    def rank_checkout_candidates(self, candidates: list[dict]) -> list[tuple[dict, ActionClassification, float]]:
        ranked = []
        for c in candidates:
            score = score_checkout_action(
                text=c.get("text", ""),
                href=c.get("href", ""),
                form_action=c.get("form_action", ""),
                surrounding_text=c.get("surrounding", ""),
                current_stage="cart"
            )

            decision = classify_action_element(
                text=c.get("text", ""),
                tag=c.get("tag", ""),
                attributes={"href": c.get("href", "")},
                form_context={"action": c.get("form_action", ""), "inputs": c.get("form_inputs", [])},
                current_stage="cart"
            )

            if decision.action_tier == ActionPolicyTier.BLOCKED or decision.is_payment_context or score < 35.0:
                continue

            ranked.append((c, decision, score))

        ranked.sort(key=lambda x: x[2], reverse=True)
        return ranked
