"""
DarkShield — Lightweight Public Review Evidence Extractor
Layer 4: Classification & Evidence Corroboration

Extracts public consumer review signals from visible text or review DOM
elements, categorising complaints into corroborating evidence clusters.

Rules:
- Public reviews are corroborating signals ONLY.
- Reviews alone NEVER determine fraud, guilt, or binding legal violations.
- Transparently captures snippet, timestamp, rating, and pattern cluster.
"""

from __future__ import annotations
import re
from typing import Optional
from schemas import (
    ReviewEvidence,
    ReviewCluster,
    ReviewSignal,
    ReviewSignalType,
)

# Regex indicators for consumer complaints
_PRICE_MISMATCH_PATTERNS = [
    (r"\b(price\s*(changed|increased|went\s*up|different|higher))\b", ReviewSignalType.PRICE_MISMATCH),
    (r"\b(charged\s*more\s*than\s*(shown|advertised|listed))\b", ReviewSignalType.PRICE_MISMATCH),
    (r"\b(different\s*price\s*at\s*checkout)\b", ReviewSignalType.CHECKOUT_PRICE_DIFFERENCE),
    (r"\b(checkout\s*price\s*(jumped|higher|more))\b", ReviewSignalType.CHECKOUT_PRICE_DIFFERENCE),
    (r"\b(unexpected\s*fee|hidden\s*charge|extra\s*fee|mandatory\s*fee|convenience\s*fee)\b", ReviewSignalType.UNEXPECTED_FEE),
    (r"\b(coupon\s*(didn'?t\s*work|invalid|not\s*applied|fake|failed))\b", ReviewSignalType.COUPON_NOT_APPLIED),
    (r"\b(different\s*seller|fake\s*seller|wrong\s*seller|seller\s*mismatch)\b", ReviewSignalType.SELLER_MISMATCH),
    (r"\b(wrong\s*item|received\s*different\s*product|fake\s*product)\b", ReviewSignalType.WRONG_PRODUCT),
    (r"\b(wrong\s*variant|different\s*color|different\s*model|wrong\s*spec)\b", ReviewSignalType.WRONG_VARIANT),
    (r"\b(fake\s*discount|misleading\s*discount|price\s*hiked\s*before\s*discount)\b", ReviewSignalType.MISLEADING_DISCOUNT),
]

_REVIEW_SPLIT_RE = re.compile(r"(?<=[.!?\n])\s+")


def extract_review_signals_from_text(
    text: str,
    listing_id: Optional[str] = None,
    marketplace: Optional[str] = None,
) -> list[ReviewSignal]:
    """
    Scan raw text (e.g. from customer review blocks or visible review DOM)
    and extract categorised ReviewSignal instances.
    """
    if not text:
        return []

    signals: list[ReviewSignal] = []
    sentences = _REVIEW_SPLIT_RE.split(text)

    for sentence in sentences:
        s_clean = sentence.strip()
        if len(s_clean) < 15 or len(s_clean) > 300:
            continue

        for pattern, sig_type in _PRICE_MISMATCH_PATTERNS:
            if re.search(pattern, s_clean, re.I):
                signals.append(
                    ReviewSignal(
                        review_text=s_clean,
                        signal_type=sig_type,
                        listing_id=listing_id,
                        marketplace=marketplace,
                        source="visible_consumer_reviews",
                        confidence=0.85,
                    )
                )
                break  # avoid multiple tags on same sentence

    return signals


def build_review_evidence(signals: list[ReviewSignal]) -> ReviewEvidence:
    """
    Cluster extracted signals by signal_type and construct a ReviewEvidence record.
    """
    if not signals:
        return ReviewEvidence(
            total_reviews_analyzed=0,
            clusters=[],
            overall_corroboration="CLEAN",
        )

    # Group by signal_type
    clusters_map: dict[ReviewSignalType, list[ReviewSignal]] = {}
    for sig in signals:
        clusters_map.setdefault(sig.signal_type, []).append(sig)

    clusters: list[ReviewCluster] = []
    for sig_type, group in clusters_map.items():
        representative = group[0].review_text
        clusters.append(
            ReviewCluster(
                concern=sig_type.value,
                signal_type=sig_type,
                review_count=len(group),
                representative_snippet=representative,
                confidence=min(0.95, 0.6 + len(group) * 0.1),
                signals=group,
            )
        )

    # Sort clusters by review count
    clusters.sort(key=lambda c: c.review_count, reverse=True)

    total_count = len(signals)
    overall = (
        "CORROBORATED" if total_count >= 3
        else "WEAK_SIGNAL" if total_count >= 1
        else "CLEAN"
    )

    return ReviewEvidence(
        total_reviews_analyzed=total_count,
        clusters=clusters,
        overall_corroboration=overall,
    )
