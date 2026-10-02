"""
DarkShield — Pydantic schemas (Python mirror of TypeScript schemas)
Keeps backend in sync with the canonical TypeScript type definitions.
"""

from __future__ import annotations
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator
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
    PRICE_CHANGE_DETECTED = "PRICE_CHANGE_DETECTED"
    NOT_EVALUATED = "NOT_EVALUATED"


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


# ─── Crawler v3 Multi-Strategy Schemas ────────────────────────────────────────

class AccessStatus(str, Enum):
    ACCESS_OK = "ACCESS_OK"
    ACCESS_REDIRECTED = "ACCESS_REDIRECTED"
    PAGE_NOT_FOUND = "PAGE_NOT_FOUND"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    RATE_LIMITED = "RATE_LIMITED"
    FORBIDDEN = "FORBIDDEN"
    BOT_CHALLENGE = "BOT_CHALLENGE"
    CAPTCHA_PRESENT = "CAPTCHA_PRESENT"
    JS_REQUIRED = "JS_REQUIRED"
    TIMEOUT = "TIMEOUT"
    NETWORK_ERROR = "NETWORK_ERROR"


class PlatformType(str, Enum):
    SHOPIFY = "shopify"
    WOOCOMMERCE = "woocommerce"
    MAGENTO = "magento"
    BIGCOMMERCE = "bigcommerce"
    CUSTOM = "custom"
    GENERIC = "generic"


class PageType(str, Enum):
    PRODUCT = "product"
    CART = "cart"
    CHECKOUT = "checkout"
    HOMEPAGE = "homepage"
    CATEGORY = "category"
    SEARCH = "search"
    UNKNOWN = "unknown"


class AccessDiagnostics(BaseModel):
    status: AccessStatus = AccessStatus.ACCESS_OK
    initial_http_status: Optional[int] = 200
    browser_status: str = "OK"
    redirect_chain: list[str] = []
    block_reason: Optional[str] = None


class SiteProfile(BaseModel):
    platform: PlatformType = PlatformType.GENERIC
    page_type: PageType = PageType.PRODUCT
    rendering: str = "client_hydrated"
    currency: str = "INR"
    access: AccessStatus = AccessStatus.ACCESS_OK
    cart_model: str = "drawer"
    checkout_model: str = "redirect"


class PriceCandidate(BaseModel):
    amount: float
    currency: str = "INR"
    source: str                          # "json_ld", "network_json", "hydration", "dom", "adapter", "meta"
    confidence: float = 0.5
    stage: str = "product"
    selector: Optional[str] = None
    response_url: Optional[str] = None
    semantic_label: str = "Price Candidate"
    is_mrp: bool = False
    is_discount: bool = False
    belongs_to_product: bool = True

    @field_validator("confidence", mode="before")
    @classmethod
    def parse_confidence(cls, v):
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            v_upper = v.upper()
            if v_upper == "HIGH":
                return 0.95
            elif v_upper == "MEDIUM":
                return 0.80
            elif v_upper == "LOW":
                return 0.65
            try:
                return float(v)
            except ValueError:
                return 0.50
        return 0.50



class CrawlerDiagnostics(BaseModel):
    initial_http_status: Optional[int] = 200
    redirect_chain: list[str] = []
    browser_status: str = "OK"
    platform: str = "generic"
    page_type: str = "product"
    product_state: str = "CAPTURED"
    cart_state: str = "NOT_REACHED"
    checkout_state: str = "NOT_REACHED"
    p0: Optional[float] = None
    p1: Optional[float] = None
    p2: Optional[float] = None
    price_source: str = "NONE"
    price_confidence: float = 0.0
    candidate_count: int = 0
    actions_examined: int = 0
    actions_rejected: int = 0
    last_successful_action: Optional[str] = None
    failure_stage: Optional[str] = None
    failure_reason: Optional[str] = None


class PriceComponent(BaseModel):

    component_type: str = "unknown"  # subtotal, delivery, platform_fee, convenience_fee, insurance, donation, discount, tax, unknown
    label: str
    amount: float
    is_mandatory: bool = True
    disclosed_early: bool = False
    added_in_stage: Optional[str] = None
    first_observed_stage: Optional[str] = None
    first_seen_stage: Optional[str] = None
    last_seen_stage: Optional[str] = None
    carryover: bool = False
    is_aggregate: bool = False
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
    reconciled_carryover_note: Optional[str] = None

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

    # Crawler v3 Multi-Strategy Diagnostics
    site_profile: Optional[SiteProfile] = None
    access_diagnostics: Optional[AccessDiagnostics] = None
    crawler_diagnostics: Optional[CrawlerDiagnostics] = None

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


class ScanSummary(BaseModel):
    scan_id: str
    url: str
    status: ScanStatus
    started_at: float
    completed_at: Optional[float] = None
    risk_level: str
    findings_count: int
    checkout_reached: bool
    summary: str
    display_name: str


# ─── VP2: Product Identity & Listing Graph ───────────────────────────────────

class MatchConfidence(str, Enum):
    MATCHED = "MATCHED"                    # SKU/MPN/GTIN confirmed match
    PROBABLE_MATCH = "PROBABLE_MATCH"      # Brand + model + key attributes match
    POSSIBLE_MATCH = "POSSIBLE_MATCH"      # Normalized title similarity >= 0.80
    NOT_MATCHED = "NOT_MATCHED"            # Definitively different product
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"  # Too little data to decide


class ProductFingerprint(BaseModel):
    """Canonical product identity extracted from a listing."""
    brand: Optional[str] = None
    model: Optional[str] = None
    normalized_title: str = ""
    sku: Optional[str] = None
    mpn: Optional[str] = None
    gtin: Optional[str] = None
    variant: Optional[str] = None
    ram: Optional[str] = None
    storage: Optional[str] = None
    processor: Optional[str] = None
    screen_size: Optional[str] = None
    color: Optional[str] = None
    condition: str = "new"             # new, refurbished, used
    source_url: str = ""
    extraction_confidence: float = 0.5


class Seller(BaseModel):
    """Seller identity on a marketplace listing."""
    name: str
    is_platform_direct: bool = False   # e.g. "Sold by Amazon" / "Croma" itself
    seller_url: Optional[str] = None
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    fulfilled_by: Optional[str] = None  # e.g. "Fulfilled by Amazon"
    source_marketplace: str = ""


class Offer(BaseModel):
    """A single offer/discount/coupon observed on a listing page."""
    offer_id: str = Field(default_factory=lambda: f"of-{uuid.uuid4().hex[:8]}")
    offer_type: str = "unknown"        # bank_offer, coupon, instant_discount, exchange, emi, membership
    offer_title: str = ""
    offer_text: str = ""
    coupon_code: Optional[str] = None
    discount_value: Optional[float] = None      # absolute rupee discount
    discount_percentage: Optional[float] = None
    minimum_purchase: Optional[float] = None
    payment_method: Optional[str] = None        # e.g. "HDFC Credit Card"
    bank: Optional[str] = None
    membership_requirement: Optional[str] = None  # e.g. "Prime", "SuperCoin"
    expiry_visible: Optional[str] = None
    is_conditional: bool = True            # requires specific payment/membership
    is_applicable: bool = False            # True only if condition clearly met
    stage_first_observed: str = "product"
    source_selector: Optional[str] = None
    screenshot_reference: Optional[str] = None


class EffectivePrice(BaseModel):
    """Calculated effective payable price from observed price + offers + fees."""
    listed_price: float
    mandatory_fees: float = 0.0
    applicable_coupons: float = 0.0         # Only definitively applicable discounts
    conditional_savings: float = 0.0        # Savings that require bank/membership eligibility
    conditional_savings_detail: list[str] = []   # Human-readable conditions
    effective_payable: float                 # listed_price - applicable_coupons + mandatory_fees
    currency: str = "INR"
    calculation_note: str = ""


class ListingStatus(str, Enum):
    PRODUCT_CAPTURED = "PRODUCT_CAPTURED"
    CAPTURED = "PRODUCT_CAPTURED"            # Alias for backwards compatibility
    PAGE_NOT_FOUND = "PAGE_NOT_FOUND"
    PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND"
    ACCESS_BLOCKED = "ACCESS_BLOCKED"
    BOT_CHALLENGE = "BOT_CHALLENGE"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    RENDER_FAILURE = "RENDER_FAILURE"
    PRODUCT_PAGE = "PRODUCT_PAGE"
    NOT_EVALUATED = "NOT_EVALUATED"


class Listing(BaseModel):
    """A single product listing on one marketplace."""
    listing_id: str = Field(default_factory=lambda: f"ls-{uuid.uuid4().hex[:8]}")
    marketplace: str                        # "amazon", "flipkart", "croma", etc.
    marketplace_display: str = ""           # "Amazon.in", "Flipkart", etc.
    url: str = ""
    status: ListingStatus = ListingStatus.NOT_EVALUATED
    provenance: str = "LIVE_CRAWL"          # "LIVE_CRAWL", "DEMO_FIXTURE", "ACCESS_BLOCKED", "PAGE_NOT_FOUND"
    access_reason: Optional[str] = None
    page_state: str = "NOT_EVALUATED"       # "PRODUCT_PAGE", "PAGE_NOT_FOUND", "LOGIN_REQUIRED", etc.

    product_fingerprint: Optional[ProductFingerprint] = None
    match_confidence: MatchConfidence = MatchConfidence.INSUFFICIENT_EVIDENCE
    match_evidence: list[str] = []

    seller: Optional[Seller] = None
    listed_price: Optional[float] = None
    mrp: Optional[float] = None
    currency: str = "INR"
    delivery_charge: Optional[float] = None
    delivery_free: Optional[bool] = None
    delivery_estimate: Optional[str] = None

    offers: list[Offer] = []
    effective_price: Optional[EffectivePrice] = None

    # Dark pattern analysis for this listing
    scan_id: Optional[str] = None          # References a full ScanResult if crawled
    risk_level: str = "NOT_EVALUATED"
    findings_count: int = 0
    findings_summary: list[str] = []

    # Transparency per dimension
    price_transparency: str = "NOT_EVALUATED"     # CLEAR / SIGNAL / NOT_EVALUATED
    fee_transparency: str = "NOT_EVALUATED"
    offer_transparency: str = "NOT_EVALUATED"
    seller_transparency: str = "NOT_EVALUATED"
    urgency_signals: str = "NOT_EVALUATED"
    choice_transparency: str = "NOT_EVALUATED"
    wording_transparency: str = "NOT_EVALUATED"
    journey_coverage: int = 0              # percent of purchase journey evaluated

    screenshot_b64: Optional[str] = None
    captured_at: float = Field(default_factory=time.time)


class ReviewSignalType(str, Enum):
    PRICE_MISMATCH = "PRICE_MISMATCH"
    CHECKOUT_PRICE_DIFFERENCE = "CHECKOUT_PRICE_DIFFERENCE"
    UNEXPECTED_FEE = "UNEXPECTED_FEE"
    COUPON_NOT_APPLIED = "COUPON_NOT_APPLIED"
    SELLER_MISMATCH = "SELLER_MISMATCH"
    WRONG_PRODUCT = "WRONG_PRODUCT"
    WRONG_VARIANT = "WRONG_VARIANT"
    MISLEADING_DISCOUNT = "MISLEADING_DISCOUNT"


class ReviewSignal(BaseModel):
    review_text: str
    signal_type: ReviewSignalType
    listing_id: Optional[str] = None
    marketplace: Optional[str] = None
    source: str = "public_reviews"
    timestamp: Optional[str] = None
    rating: Optional[float] = None
    confidence: float = 0.8


class ReviewCluster(BaseModel):
    """A cluster of public reviews mentioning a specific concern."""
    concern: str                           # "PRICE_MISMATCH", "UNEXPECTED_FEE", etc.
    signal_type: Optional[ReviewSignalType] = None
    review_count: int
    representative_snippet: str
    confidence: float = 0.5
    source_url: Optional[str] = None
    signals: list[ReviewSignal] = []


class ReviewEvidence(BaseModel):
    """Public review evidence corroborating dark-pattern findings."""
    total_reviews_analyzed: int = 0
    clusters: list[ReviewCluster] = []
    overall_corroboration: str = "INSUFFICIENT_DATA"  # CORROBORATED / WEAK_SIGNAL / CLEAN / INSUFFICIENT_DATA
    disclaimer: str = (
        "Review evidence is corroborating signal only. "
        "Individual reviews are not verified. "
        "DarkShield does not claim fraud based on review content alone."
    )


class PriceInconsistencyEvidence(BaseModel):
    """Evidence record for same-product/different-price finding."""
    product_match: MatchConfidence
    seller_a_name: Optional[str] = None
    seller_b_name: Optional[str] = None
    price_a: float
    price_b: float
    price_delta: float
    price_delta_pct: float
    marketplace_a: str
    marketplace_b: str
    same_product: bool = True
    same_seller: bool = True
    same_variant: bool = True
    same_condition: bool = True
    material_difference: bool = True
    offer_explanation_found: bool = False
    offer_explanation: Optional[str] = None
    fee_explanation_found: bool = False
    variant_mismatch: bool = False
    fulfillment_difference: bool = False
    coverage_a: int = 0
    coverage_b: int = 0
    explanation: str = ""


# ─── VP2: Comparison Result ───────────────────────────────────────────────────

class CompareStatus(str, Enum):
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    PARTIAL = "partial"   # some marketplaces blocked


class CompareResult(BaseModel):
    """Cross-marketplace product comparison result."""
    compare_id: str = Field(default_factory=lambda: f"cmp-{uuid.uuid4().hex[:8]}")
    query: str                             # Original search query or URL
    query_type: str = "url"               # "query", "url", "multi_url"
    status: CompareStatus = CompareStatus.RUNNING

    canonical_product: Optional[ProductFingerprint] = None
    listings: list[Listing] = []

    # Price inconsistency findings
    inconsistencies: list[PriceInconsistencyEvidence] = []
    review_evidence: Optional[ReviewEvidence] = None

    started_at: float = Field(default_factory=time.time)
    completed_at: Optional[float] = None
    audit_logs: list[AuditLogEntry] = []


# ─── VP2: API Request Models ──────────────────────────────────────────────────

class ProductSearchRequest(BaseModel):
    """Search for a product across marketplaces by natural language query or URL."""
    query: str                              # Natural language query OR product URL
    marketplaces: list[str] = []            # Empty = use default set
    max_listings_per_marketplace: int = Field(default=1, ge=1, le=3)


class CompareRequest(BaseModel):
    """Compare specific product URLs or a product query across marketplaces."""
    urls: list[str] = []                    # Product URLs to compare (can be empty if query provided)
    query: Optional[str] = None             # Product search intent (e.g. "MacBook Air M2")
    reference_url: Optional[str] = None    # Which URL is the reference listing


class CompareResponse(BaseModel):
    compare_id: str
    status: CompareStatus
    estimated_seconds: Optional[int] = None
