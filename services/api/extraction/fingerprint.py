"""
DarkShield — Product Fingerprint Extractor & Matcher
Layer 2: Page/DOM Analysis

Extracts canonical ProductFingerprint from a crawled page and
matches two fingerprints to determine whether they represent the
same product. Matching follows strict priority:

  1. SKU / MPN / GTIN (structural identifiers)
  2. Brand + Model + key hardware attributes
  3. Normalized title similarity
"""

from __future__ import annotations
import re
import unicodedata
from typing import Optional

from schemas import ProductFingerprint, MatchConfidence


# ─── Normalisation helpers ────────────────────────────────────────────────────

_NOISE = re.compile(
    r"\b(with|and|the|for|pack|of|set|combo|bundle|new|official|genuine|"
    r"original|certified|refurbished|open box|sealed)\b",
    re.I
)
_SPACES = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]")

# Attribute normalisation
_RAM_RE = re.compile(r"(\d+)\s*gb\s*ram", re.I)
_STORAGE_EXPLICIT_RE = re.compile(
    r"(\d+)\s*(gb|tb)\s*(ssd|hdd|storage|nvme|rom)\b",
    re.I
)
_STORAGE_GENERIC_RE = re.compile(
    r"(\d+)\s*(gb|tb)(?!\s*ram)\b",
    re.I
)
_PROC_RE = re.compile(r"(ryzen\s*\d|core\s*i\d|snapdragon\s*\d+|apple\s*m\d|"
                      r"celeron|pentium|mediatek|dimensity\s*\d+)", re.I)
_SCREEN_RE = re.compile(r"\b(\d{1,2}(?:\.\d+)?)\s*(?:inch|[\"']|cm\b)", re.I)
_COLOR_RE = re.compile(
    r"\b(black|white|silver|gold|blue|red|green|pink|purple|grey|gray|"
    r"midnight|starlight|space\s*grey|rose\s*gold|graphite|pacific\s*blue|"
    r"sierra\s*blue|phantom\s*black|mystic\s*black|atomic\s*blue)\b",
    re.I
)


def _normalise_title(title: str) -> str:
    """Remove noise words, punctuation, fold to lowercase."""
    t = unicodedata.normalize("NFKD", title)
    t = _PUNCT.sub(" ", t)
    t = _NOISE.sub(" ", t)
    t = _SPACES.sub(" ", t).strip().lower()
    return t


def _title_similarity(a: str, b: str) -> float:
    """Token-based Jaccard similarity between two normalised titles."""
    sa = set(_normalise_title(a).split())
    sb = set(_normalise_title(b).split())
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _extract_ram(text: str, storage: Optional[str] = None) -> Optional[str]:
    m = re.search(r"\b(\d+)\s*gb\s*(?:ram|memory|unified)\b", text, re.I)
    if m:
        return f"{m.group(1)}GB"
    for match in re.finditer(r"\b(\d+)\s*gb\b(?!\s*(?:ssd|hdd|storage|nvme|rom))", text, re.I):
        val = f"{match.group(1)}GB"
        if storage and val.lower() in storage.lower():
            continue
        return val
    return None


def _extract_storage(text: str, ram: Optional[str] = None) -> Optional[str]:
    m = _STORAGE_EXPLICIT_RE.search(text)
    if m:
        unit = m.group(2).upper()
        suffix = (m.group(3) or "").strip().upper()
        return f"{m.group(1)}{unit}{(' ' + suffix) if suffix else ''}"

    for match in _STORAGE_GENERIC_RE.finditer(text):
        val = f"{match.group(1)}{match.group(2).upper()}"
        if ram and val.lower() == ram.lower():
            continue
        return val

    return None


def _extract_processor(text: str) -> Optional[str]:
    m = _PROC_RE.search(text)
    return m.group(0).strip().lower() if m else None


def _extract_screen(text: str) -> Optional[str]:
    m = _SCREEN_RE.search(text)
    return f"{m.group(1)} inch" if m else None


def _extract_color(text: str) -> Optional[str]:
    m = _COLOR_RE.search(text)
    return m.group(0).strip().lower() if m else None


# ─── Fingerprint extraction ───────────────────────────────────────────────────

def extract_fingerprint_from_page(
    title: str,
    brand: Optional[str],
    sku: Optional[str],
    mpn: Optional[str],
    gtin: Optional[str],
    source_url: str,
    raw_text: str = "",
) -> ProductFingerprint:
    """
    Build a ProductFingerprint from crawled page metadata.
    Falls back gracefully when fields are absent.
    """
    combined = f"{title} {raw_text}"[:2000]

    storage = _extract_storage(combined)
    ram = _extract_ram(combined, storage=storage)
    processor = _extract_processor(combined)
    screen = _extract_screen(combined)
    color = _extract_color(combined)

    # Attempt to split brand from title if not given
    if not brand and title:
        # First word of title is often the brand
        first_word = title.strip().split()[0] if title.strip() else None
        if first_word and len(first_word) > 2:
            brand = first_word

    # Attempt to extract model: first 3-4 tokens after brand in title
    model = None
    if brand and title:
        title_lower = title.lower()
        brand_lower = brand.lower()
        idx = title_lower.find(brand_lower)
        after = title[idx + len(brand):].strip() if idx >= 0 else title
        # Take up to 4 words as the model descriptor
        model_parts = after.strip().split()[:4]
        model = " ".join(model_parts) if model_parts else None

    # Confidence based on how many structured fields we found
    structured = sum(1 for v in [sku, mpn, gtin, ram, storage, processor] if v)
    confidence = min(0.95, 0.35 + structured * 0.10 + (0.15 if brand else 0))

    return ProductFingerprint(
        brand=brand,
        model=model,
        normalized_title=_normalise_title(title) if title else "",
        sku=sku,
        mpn=mpn,
        gtin=gtin,
        ram=ram,
        storage=storage,
        processor=processor,
        screen_size=screen,
        color=color,
        source_url=source_url,
        extraction_confidence=confidence,
    )


# ─── Fingerprint matching ─────────────────────────────────────────────────────

_STRUCT_IDS = ("sku", "mpn", "gtin")


def _ids_conflict(a: Optional[str], b: Optional[str]) -> bool:
    """Returns True if both IDs are present but different."""
    return bool(a and b and a.strip().lower() != b.strip().lower())


def _ids_match(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a and b and a.strip().lower() == b.strip().lower())


def match_fingerprints(
    fp_a: ProductFingerprint,
    fp_b: ProductFingerprint,
) -> tuple[MatchConfidence, list[str]]:
    """
    Compare two ProductFingerprints.

    Returns:
        (MatchConfidence, list of evidence strings)
    """
    evidence: list[str] = []

    # ── Priority 1: Structural identifiers ──────────────────────────────────
    for field in _STRUCT_IDS:
        a_val = getattr(fp_a, field)
        b_val = getattr(fp_b, field)
        if _ids_match(a_val, b_val):
            evidence.append(f"{field.upper()} match: {a_val}")
            return MatchConfidence.MATCHED, evidence
        if _ids_conflict(a_val, b_val):
            evidence.append(f"{field.upper()} conflict: {a_val!r} vs {b_val!r}")
            return MatchConfidence.NOT_MATCHED, evidence

    # ── Priority 2: Brand + model + key attributes ──────────────────────────
    brand_match = (
        fp_a.brand and fp_b.brand and
        fp_a.brand.strip().lower() == fp_b.brand.strip().lower()
    )

    # Hardware attributes match counter
    attr_matches = 0
    attr_conflicts = 0
    for attr in ("ram", "storage", "processor", "screen_size"):
        a_v = getattr(fp_a, attr)
        b_v = getattr(fp_b, attr)
        if a_v and b_v:
            if a_v.strip().lower() == b_v.strip().lower():
                attr_matches += 1
                evidence.append(f"{attr} match: {a_v}")
            else:
                attr_conflicts += 1
                evidence.append(f"{attr} conflict: {a_v!r} vs {b_v!r}")

    # Any specification conflict means different variant / hardware -> NOT_MATCHED
    if attr_conflicts >= 1:
        return MatchConfidence.NOT_MATCHED, evidence

    if brand_match:
        evidence.insert(0, f"Brand match: {fp_a.brand!r}")
        if attr_matches >= 3:
            return MatchConfidence.MATCHED, evidence
        elif attr_matches == 2:
            return MatchConfidence.PROBABLE_MATCH, evidence
        elif attr_matches == 1:
            return MatchConfidence.POSSIBLE_MATCH, evidence

    # ── Priority 3: Title similarity (POSSIBLE_MATCH only, never MATCHED) ────
    if fp_a.normalized_title and fp_b.normalized_title:
        sim = _title_similarity(fp_a.normalized_title, fp_b.normalized_title)
        evidence.append(f"Title similarity: {sim:.2f}")
        if sim >= 0.85:
            # Normalized title alone cannot yield MATCHED; requires structured specs
            return MatchConfidence.POSSIBLE_MATCH, evidence
        if sim < 0.35:
            return MatchConfidence.NOT_MATCHED, evidence

    return MatchConfidence.INSUFFICIENT_EVIDENCE, evidence

