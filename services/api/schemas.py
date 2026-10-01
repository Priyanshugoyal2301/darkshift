"""
DarkShield — Pydantic schemas (Python mirror of TypeScript schemas)
Keeps backend in sync with the canonical TypeScript type definitions.
"""

from __future__ import annotations
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import time
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class CCPAPattern(str, Enum):
    FALSE_URGENCY = "FALSE_URGENCY"
    BASKET_SNEAKING = "BASKET_SNEAKING"
    CONFIRM_SHAMING = "CONFIRM_SHAMING"
    FORCED_ACTION = "FORCED_ACTION"
    SUBSCRIPTION_TRAP = "SUBSCRIPTION_TRAP"
    INTERFACE_INTERFERENCE = "INTERFACE_INTERFERENCE"
    BAIT_AND_SWITCH = "BAIT_AND_SWITCH"
    DRIP_PRICING = "DRIP_PRICING"
    DISGUISED_ADVERTISEMENT = "DISGUISED_ADVERTISEMENT"
    NAGGING = "NAGGING"
    TRICK_WORDING = "TRICK_WORDING"
    SAAS_BILLING = "SAAS_BILLING"
    ROGUE_MALWARE = "ROGUE_MALWARE"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ConfidenceTier(str, Enum):
    HIGH = "HIGH"       # Multi-source verifiable evidence (e.g. checkbox + price delta)
    MEDIUM = "MEDIUM"   # Strong single-source signal (e.g. countdown timer + DOM node)
    LOW = "LOW"         # Semantic heuristic / suggestive text


class CoverageStatus(str, Enum):
    DETECTED = "DETECTED"                  # Evidence found of dark pattern
    EVALUATED_CLEAN = "EVALUATED_CLEAN"    # Scanned and no deceptive pattern found
    NOT_EVALUATED = "NOT_EVALUATED"        # Stage not reached (e.g. Drip Pricing when checkout unreached)


class DetectionMethod(str, Enum):
    DOM_RULE = "DOM_RULE"
    NLP_CLASSIFIER = "NLP_CLASSIFIER"
    PRICE_JOURNEY = "PRICE_JOURNEY"
    STATE_DIFF = "STATE_DIFF"
    CSS_GEOMETRY = "CSS_GEOMETRY"
    MUTATION_OBSERVER = "MUTATION_OBSERVER"
    LLM_EXPLANATION = "LLM_EXPLANATION"


class ScanStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


class ScanMode(str, Enum):
    EXTENSION = "extension"
    URL_AUDIT = "url_audit"


class PriceState(str, Enum):
    PRODUCT = "product"
    CART = "cart"
    CHECKOUT = "checkout"
    PAYMENT = "payment"
    UNKNOWN = "unknown"


# ─── Price Component & Journey Models ────────────────────────────────────────

class DarkPatternAssessmentStatus(str, Enum):
    DETECTED = "DETECTED"
    POTENTIAL_SIGNAL = "POTENTIAL_SIGNAL"
    EVALUATED_CLEAN = "EVALUATED_CLEAN"
    INCONCLUSIVE = "INCONCLUSIVE"


class ActionPolicyTier(str, Enum):
    SAFE = "SAFE"
    CAUTION = "CAUTION"
    BLOCKED = "BLOCKED"


class ActionClassification(BaseModel):
    text: str
    action_tier: ActionPolicyTier
    reason: str
    target_url: Optional[str] = None
    form_action: Optional[str] = None
    is_payment_context: bool = False


class PriceComponent(BaseModel):
    component_type: str = "unknown"  # subtotal, delivery, platform_fee, convenience_fee, insurance, donation, discount, tax, unknown
    label: str
    amount: float
    is_mandatory: bool = True
    disclosed_early: bool = False
    added_in_stage: Optional[str] = None
    first_observed_stage: Optional[str] = None
    previously_disclosed: bool = False
    selected_by_default: bool = False
    included_in_advertised_price: bool = False
    is_delivery_dependent: bool = False


class PriceComponentExplanation(BaseModel):
    component_type: str
    label: str
    amount: float
    is_mandatory: bool
    disclosure_stage: str
    disclosed_early: bool = False
    assessment_status: DarkPatternAssessmentStatus = DarkPatternAssessmentStatus.EVALUATED_CLEAN
    assessment_reason: str = "Standard disclosed charge."


class PriceStage(BaseModel):
    stage: str                       # product, cart, checkout
    stage_label: str                 # "1. Product Listing", "2. Cart Review", "3. Checkout"
    total: Optional[float] = None
    is_captured: bool = True
    currency: str = "INR"
    components: list[PriceComponent] = []
    url: str = ""
    screenshot_b64: Optional[str] = None
    extraction_source: Optional[str] = None
    extraction_confidence: Optional[str] = None


class PriceJourney(BaseModel):
    stages: list[PriceStage] = []
    initial_price: Optional[float] = None
    cart_price: Optional[float] = None
    final_observed_price: Optional[float] = None

    # Mathematical Deltas
    delta_01: Optional[float] = None
    delta_12: Optional[float] = None
    delta_total: Optional[float] = None
    percentage_increase: Optional[float] = None

    # Explanations (What caused it)
    component_explanations: list[PriceComponentExplanation] = []
    new_charges: list[PriceComponent] = []

    # Dark-Pattern Assessment (Did deceptive concealment occur?)
    dark_pattern_assessment: DarkPatternAssessmentStatus = DarkPatternAssessmentStatus.EVALUATED_CLEAN
    is_drip_pricing: bool = False
    potential_drip: bool = False  # Legacy backward compatibility alias
    checkout_reached: bool = False
    explanation: Optional[str] = None


# Legacy compatibility aliases
class FeeBreakdown(BaseModel):
    label: str
    amount: float
    mandatory: bool = True
    disclosed_early: bool = False


class PricePoint(BaseModel):
    state: PriceState
    amount: float
    currency: str = "INR"
    breakdown: list[FeeBreakdown] = []
    url: str
    timestamp: float = Field(default_factory=time.time)


# ─── DOM Evidence ─────────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class DOMEvidence(BaseModel):
    selector: str
    text_content: str
    tag: str
    attributes: dict[str, str] = {}
    bounding_box: Optional[BoundingBox] = None
    visible: bool = True


class VisualProminenceScore(BaseModel):
    element_selector: str
    label: str
    area_px: float
    font_size_px: float
    contrast_ratio: float
    position_score: float
    visibility_score: float
    prominence: float


# ─── Finding ──────────────────────────────────────────────────────────────────

class Finding(BaseModel):
    id: str = Field(default_factory=lambda: f"ds-{uuid.uuid4().hex[:8]}")
    pattern: CCPAPattern
    sub_signals: list[str] = []
    confidence: float
    confidence_tier: ConfidenceTier = ConfidenceTier.MEDIUM
    evidence_sources: list[str] = []
    severity: Severity

    url: str
    page_state: PriceState = PriceState.UNKNOWN

    dom_evidence: list[DOMEvidence] = []
    price_journey: Optional[PriceJourney] = None
    text_snippets: list[str] = []
    visual_evidence: list[VisualProminenceScore] = []

    detection_methods: list[DetectionMethod] = []
    rule_ids: list[str] = []

    ccpa_category: CCPAPattern
    ccpa_regulation: str = "CCPA_DARK_PATTERNS_2023"

    title: str
    explanation: str
    consumer_advice: str
    remediation_hint: Optional[str] = None

    timestamp: float = Field(default_factory=time.time)


# ─── Risk Assessment & Coverage Models ───────────────────────────────────────

class RiskAssessment(BaseModel):
    risk_level: str = "UNDETERMINED"       # "UNDETERMINED", "LOW", "ELEVATED", "HIGH"
    risk_score: int = 0                    # 0 to 100 where higher = higher risk
    checks_performed: int = 14
    signals_found: int = 0
    high_confidence_count: int = 0
    medium_confidence_count: int = 0
    low_confidence_count: int = 0
    coverage_sufficient: bool = True
    summary: str = "No critical dark pattern indicators observed on evaluated stages."


class PatternCoverageItem(BaseModel):
    pattern: CCPAPattern
    pattern_name: str
    ccpa_section: str
    status: CoverageStatus
    reason: str


class ScanCoverage(BaseModel):
    stages_scanned: list[str] = ["product"]
    checkout_reached: bool = False
    coverage_score: int = 60               # percentage of purchase lifecycle evaluated
    items: list[PatternCoverageItem] = []


# ─── Transparency Score (Legacy Secondary Metric) ───────────────────────────

class ScoreDeduction(BaseModel):
    pattern: CCPAPattern
    finding_id: str
    points_deducted: int
    reason: str


class TransparencyDimensions(BaseModel):
    price_transparency: int = 100
    choice_neutrality: int = 100
    consent_clarity: int = 100
    urgency_signals: int = 100
    flow_transparency: int = 100


class TransparencyScore(BaseModel):
    total: int
    dimensions: TransparencyDimensions
    deductions: list[ScoreDeduction] = []
    disclaimer: str = (
        "DarkShield Transparency Score is a secondary product metric, "
        "not an official CCPA compliance score or certificate."
    )


# ─── Execution Trace & Metadata ──────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    timestamp: str
    stage: str
    message: str
    details: Optional[str] = None


class TargetMetadata(BaseModel):
    title: Optional[str] = "Target Site"
    http_status: Optional[int] = 200
    final_url: Optional[str] = None
    latency_ms: Optional[float] = None
    dom_elements_count: Optional[int] = 0
    forms_count: Optional[int] = 0
    inputs_count: Optional[int] = 0
    screenshot_captured: bool = False


# ─── Scan Result ─────────────────────────────────────────────────────────────

class ScanResult(BaseModel):
    scan_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    url: str
    mode: ScanMode = ScanMode.URL_AUDIT
    status: ScanStatus = ScanStatus.QUEUED
    started_at: float = Field(default_factory=time.time)
    completed_at: Optional[float] = None

    pages_analyzed: int = 0
    interaction_states: int = 0
    findings: list[Finding] = []

    # New honest risk & coverage models
    risk_assessment: Optional[RiskAssessment] = None
    scan_coverage: Optional[ScanCoverage] = None
    price_journey: Optional[PriceJourney] = None

    # Secondary transparency score
    transparency_score: Optional[TransparencyScore] = None

    findings_by_pattern: dict[str, int] = {}
    error: Optional[str] = None

    screenshot_base64: Optional[str] = None
    audit_logs: list[AuditLogEntry] = []
    target_metadata: Optional[TargetMetadata] = None


# ─── API Contracts ────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    url: str
    mode: ScanMode = ScanMode.URL_AUDIT
    max_depth: int = Field(default=3, ge=1, le=10)
    safe_interact: bool = True


class ScanResponse(BaseModel):
    scan_id: str
    status: ScanStatus
    estimated_seconds: Optional[int] = None


class AnalyzeRequest(BaseModel):
    url: str
    dom: str
    visible_text: str
    prices: list[PricePoint] = []
    page_state: PriceState = PriceState.UNKNOWN
