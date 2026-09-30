/**
 * DarkShield Shared Schema Definitions
 * Central types used across extension, web-app, and backend API
 *
 * These 13 categories map 1:1 to the CCPA Dark Patterns Guidelines 2023.
 */

// ─── CCPA 13-Pattern Taxonomy ───────────────────────────────────────────────

export type CCPAPattern =
  | "FALSE_URGENCY"
  | "BASKET_SNEAKING"
  | "CONFIRM_SHAMING"
  | "FORCED_ACTION"
  | "SUBSCRIPTION_TRAP"
  | "INTERFACE_INTERFERENCE"
  | "BAIT_AND_SWITCH"
  | "DRIP_PRICING"
  | "DISGUISED_ADVERTISEMENT"
  | "NAGGING"
  | "TRICK_WORDING"
  | "SAAS_BILLING"
  | "ROGUE_MALWARE";

export type PatternSubSignal =
  | "COUNTDOWN_TIMER"
  | "SCARCITY_CLAIM"
  | "SOCIAL_PROOF_PRESSURE"
  | "DEADLINE_LANGUAGE"
  | "MANDATORY_FEE"
  | "HIDDEN_FEE"
  | "PRE_TICKED_CHECKBOX"
  | "UNSOLICITED_ITEM"
  | "SHAME_LANGUAGE"
  | "DOUBLE_NEGATIVE"
  | "VISUAL_ASYMMETRY";

export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export type CoverageStatus = "DETECTED" | "EVALUATED_CLEAN" | "NOT_EVALUATED";

export type DetectionMethod =
  | "DOM_RULE"
  | "NLP_CLASSIFIER"
  | "PRICE_JOURNEY"
  | "STATE_DIFF"
  | "CSS_GEOMETRY"
  | "MUTATION_OBSERVER"
  | "LLM_EXPLANATION";

// ─── Price Component & Journey ───────────────────────────────────────────────

export type PriceState = "product" | "cart" | "checkout" | "payment" | "unknown";

export interface PriceComponent {
  component_type: string;     // subtotal, delivery, platform_fee, convenience_fee, insurance, donation, discount, unknown
  label: string;
  amount: number;
  is_mandatory: boolean;
  disclosed_early: boolean;
}

export interface PriceStage {
  stage: string;              // product, cart, checkout
  stage_label: string;        // "1. Product Listing", "2. Cart Review", "3. Checkout"
  total: number;
  currency: string;
  components: PriceComponent[];
  url: string;
  screenshot_b64?: string;
}

export interface PriceJourney {
  stages: PriceStage[];
  initial_price: number;
  final_observed_price: number;
  delta_total: number;
  percentage_increase: number;
  new_charges: PriceComponent[];
  is_drip_pricing: boolean;
  checkout_reached: boolean;
  explanation?: string;
}

// Legacy aliases
export interface FeeBreakdown {
  label: string;
  amount: number;
  mandatory: boolean;
  disclosed_early: boolean;
}

export interface PricePoint {
  state: PriceState;
  amount: number;
  currency: string;
  breakdown?: FeeBreakdown[];
  url: string;
  timestamp: number;
}

// ─── DOM Evidence ────────────────────────────────────────────────────────────

export interface DOMEvidence {
  selector: string;
  text_content: string;
  tag: string;
  attributes: Record<string, string>;
  bounding_box?: BoundingBox;
  computed_styles?: Partial<CSSStyleDeclaration>;
  visible: boolean;
  inner_html?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualProminenceScore {
  element_selector: string;
  label: string;
  area_px: number;
  font_size_px: number;
  contrast_ratio: number;
  position_score: number;
  visibility_score: number;
  prominence: number;
}

// ─── Finding ──────────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  pattern: CCPAPattern;
  sub_signals: PatternSubSignal[];
  confidence: number;
  confidence_tier?: ConfidenceTier;
  evidence_sources?: string[];
  severity: "low" | "medium" | "high";

  url: string;
  page_state: PriceState;

  dom_evidence: DOMEvidence[];
  price_journey?: PriceJourney;
  text_snippets: string[];
  visual_evidence?: VisualProminenceScore[];

  detection_methods: DetectionMethod[];
  rule_ids: string[];

  ccpa_category: CCPAPattern;
  ccpa_regulation: string;

  title: string;
  explanation: string;
  consumer_advice: string;
  remediation_hint?: string;

  timestamp: number;
}

// ─── Risk Assessment & Coverage ─────────────────────────────────────────────

export interface RiskAssessment {
  risk_level: "LOW" | "ELEVATED" | "HIGH";
  risk_score: number;                   // 0-100 where higher = higher risk
  checks_performed: number;
  signals_found: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
  summary: string;
}

export interface PatternCoverageItem {
  pattern: CCPAPattern;
  pattern_name: string;
  ccpa_section: string;
  status: CoverageStatus;
  reason: string;
}

export interface ScanCoverage {
  stages_scanned: string[];
  checkout_reached: boolean;
  coverage_score: number;
  items: PatternCoverageItem[];
}

// ─── Transparency Score (Secondary) ─────────────────────────────────────────

export interface TransparencyScore {
  total: number;
  dimensions: {
    price_transparency: number;
    choice_neutrality: number;
    consent_clarity: number;
    urgency_signals: number;
    flow_transparency: number;
  };
  deductions: ScoreDeduction[];
  disclaimer: string;
}

export interface ScoreDeduction {
  pattern: CCPAPattern;
  finding_id: string;
  points_deducted: number;
  reason: string;
}

// ─── Trace Logs & Metadata ──────────────────────────────────────────────────

export interface AuditLogEntry {
  timestamp: string;
  stage: string;
  message: string;
  details?: string;
}

export interface TargetMetadata {
  title?: string;
  http_status?: number;
  final_url?: string;
  latency_ms?: number;
  dom_elements_count?: number;
  forms_count?: number;
  inputs_count?: number;
  screenshot_captured?: boolean;
}

// ─── Scan Result ─────────────────────────────────────────────────────────────

export type ScanStatus = "queued" | "running" | "done" | "error";
export type ScanMode = "extension" | "url_audit";

export interface ScanResult {
  scan_id: string;
  url: string;
  mode: ScanMode;
  status: ScanStatus;
  started_at: number;
  completed_at?: number;

  pages_analyzed: number;
  interaction_states: number;
  findings: Finding[];

  // Honest Risk & Coverage Models
  risk_assessment?: RiskAssessment;
  scan_coverage?: ScanCoverage;
  price_journey?: PriceJourney;

  // Secondary legacy metric
  transparency_score?: TransparencyScore;

  findings_by_pattern: Partial<Record<CCPAPattern, number>>;
  error?: string;

  screenshot_base64?: string;
  audit_logs?: AuditLogEntry[];
  target_metadata?: TargetMetadata;
}

// ─── API contracts ───────────────────────────────────────────────────────────

export interface ScanRequest {
  url: string;
  mode?: ScanMode;
  max_depth?: number;
  safe_interact?: boolean;
}

export interface ScanResponse {
  scan_id: string;
  status: ScanStatus;
  estimated_seconds?: number;
}

export interface AnalyzeRequest {
  url: string;
  dom: string;
  visible_text: string;
  prices?: PricePoint[];
  page_state?: PriceState;
}
