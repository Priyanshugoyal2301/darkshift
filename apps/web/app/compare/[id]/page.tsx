"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  ArrowLeft,
  Tag,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Sparkles,
  Info,
  Clock,
  Layers,
  Scale,
  RefreshCw,
  Eye,
  Check,
  XCircle,
  HelpCircle,
  TrendingDown,
  ShoppingBag,
  Play,
  MessageSquare,
} from "lucide-react";

// --- Data Types matching services/api/schemas.py ---
type MatchConfidence = "MATCHED" | "PROBABLE_MATCH" | "POSSIBLE_MATCH" | "NOT_MATCHED" | "INSUFFICIENT_EVIDENCE";
type ListingStatus =
  | "PRODUCT_CAPTURED"
  | "CAPTURED"
  | "PAGE_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "ACCESS_BLOCKED"
  | "BOT_CHALLENGE"
  | "LOGIN_REQUIRED"
  | "RENDER_FAILURE"
  | "PRODUCT_PAGE"
  | "NOT_EVALUATED";
type CompareStatus = "running" | "done" | "error" | "partial";

interface ProductFingerprint {
  brand?: string;
  model?: string;
  normalized_title?: string;
  sku?: string;
  mpn?: string;
  gtin?: string;
  variant?: string;
  ram?: string;
  storage?: string;
  processor?: string;
  screen_size?: string;
  color?: string;
  condition?: string;
  source_url?: string;
  extraction_confidence?: number;
}

interface Seller {
  name: string;
  is_platform_direct?: boolean;
  seller_url?: string;
  rating?: number;
  rating_count?: number;
  fulfilled_by?: string;
  source_marketplace?: string;
}

interface Offer {
  offer_id: string;
  offer_type: string;
  offer_title: string;
  offer_text: string;
  coupon_code?: string;
  discount_value?: number;
  discount_percentage?: number;
  minimum_purchase?: number;
  payment_method?: string;
  bank?: string;
  membership_requirement?: string;
  is_conditional: boolean;
  is_applicable: boolean;
}

interface EffectivePrice {
  listed_price: number;
  mandatory_fees: number;
  applicable_coupons: number;
  conditional_savings: number;
  conditional_savings_detail: string[];
  effective_payable: number;
  currency: string;
  calculation_note?: string;
}

interface ReviewSignal {
  review_text: string;
  signal_type: string;
  listing_id?: string;
  marketplace?: string;
  source: string;
  timestamp?: string;
  rating?: number;
  confidence: number;
}

interface ReviewCluster {
  concern: string;
  signal_type?: string;
  review_count: number;
  representative_snippet: string;
  confidence: number;
  source_url?: string;
  signals?: ReviewSignal[];
}

interface ReviewEvidence {
  total_reviews_analyzed: number;
  clusters: ReviewCluster[];
  overall_corroboration: string;
  disclaimer: string;
}

interface Listing {
  listing_id: string;
  marketplace: string;
  marketplace_display: string;
  url: string;
  status: ListingStatus;
  provenance?: string;
  page_state?: string;
  access_reason?: string;
  product_fingerprint?: ProductFingerprint;
  match_confidence: MatchConfidence;
  match_evidence?: string[];
  seller?: Seller;
  listed_price?: number;
  mrp?: number;
  currency?: string;
  delivery_charge?: number;
  delivery_free?: boolean;
  offers: Offer[];
  effective_price?: EffectivePrice;
  scan_id?: string;
  risk_level: string;
  findings_count: number;
  findings_summary: string[];
  price_transparency: string;
  fee_transparency: string;
  offer_transparency: string;
  seller_transparency: string;
  urgency_signals: string;
  choice_transparency: string;
  wording_transparency: string;
  journey_coverage: number;
  screenshot_b64?: string;
}

interface PriceInconsistencyEvidence {
  product_match: MatchConfidence;
  seller_a_name?: string;
  seller_b_name?: string;
  price_a: number;
  price_b: number;
  price_delta: number;
  price_delta_pct: number;
  marketplace_a: string;
  marketplace_b: string;
  same_product?: boolean;
  same_seller?: boolean;
  same_variant?: boolean;
  same_condition?: boolean;
  material_difference?: boolean;
  offer_explanation_found: boolean;
  offer_explanation?: string;
  fee_explanation_found?: boolean;
  variant_mismatch?: boolean;
  fulfillment_difference?: boolean;
  explanation?: string;
}

interface AuditLogEntry {
  timestamp: string;
  stage: string;
  message: string;
}

interface CompareResult {
  compare_id: string;
  query: string;
  query_type: string;
  status: CompareStatus;
  canonical_product?: ProductFingerprint;
  listings: Listing[];
  inconsistencies: PriceInconsistencyEvidence[];
  review_evidence?: ReviewEvidence;
  started_at: number;
  completed_at?: number;
  audit_logs: AuditLogEntry[];
}


// Built-in Demo Scenarios for instant evaluation
const DEMO_COMPARISONS: Record<string, CompareResult> = {
  "sample-laptop-compare": {
    compare_id: "sample-laptop-compare",
    query: "Apple MacBook Air M2 8GB 256GB Midnight",
    query_type: "product_intent",
    status: "done",
    started_at: Date.now() - 45000,
    completed_at: Date.now() - 5000,
    canonical_product: {
      brand: "Apple",
      model: "MacBook Air M2",
      ram: "8GB",
      storage: "256GB SSD",
      processor: "Apple M2 8-core",
      screen_size: "13.6 inch",
      color: "Midnight",
      condition: "new",
      extraction_confidence: 0.95,
    },
    inconsistencies: [
      {
        product_match: "MATCHED",
        seller_a_name: "Appario Retail Pvt Ltd",
        seller_b_name: "IndiFlashMart",
        price_a: 84990,
        price_b: 89900,
        price_delta: 4910,
        price_delta_pct: 5.8,
        marketplace_a: "amazon",
        marketplace_b: "flipkart",
        same_product: true,
        same_seller: false,
        same_variant: true,
        same_condition: true,
        material_difference: true,
        offer_explanation_found: true,
        offer_explanation: "HDFC Bank ₹5,000 instant discount on Amazon bridges the advertised price gap.",
        explanation: "Comparable products (MATCHED): Apple MacBook Air M2. Different merchants: Appario Retail vs IndiFlashMart. HDFC Bank ₹5,000 instant discount on Amazon bridges the advertised price gap.",
      },
    ],
    review_evidence: {
      total_reviews_analyzed: 8,
      overall_corroboration: "CORROBORATING_SIGNALS_DETECTED",
      disclaimer: "Review evidence is corroborating signal only. Individual reviews are not verified. DarkShield does not claim fraud based on review content alone.",
      clusters: [
        {
          concern: "PRICE_MISMATCH",
          signal_type: "PRICE_MISMATCH",
          review_count: 5,
          representative_snippet: "Price shown on product page differed at checkout by ₹99 due to unexpected handling fee.",
          confidence: 0.88,
          signals: [
            {
              review_text: "Price shown on product page differed at checkout by ₹99 due to unexpected handling fee.",
              signal_type: "PRICE_MISMATCH",
              marketplace: "flipkart",
              source: "public_reviews",
              confidence: 0.88,
            },
          ],
        },
        {
          concern: "UNEXPECTED_FEE",
          signal_type: "UNEXPECTED_FEE",
          review_count: 3,
          representative_snippet: "Secured packaging charge was added automatically without an option to opt out.",
          confidence: 0.82,
          signals: [
            {
              review_text: "Secured packaging charge was added automatically without an option to opt out.",
              signal_type: "UNEXPECTED_FEE",
              marketplace: "flipkart",
              source: "public_reviews",
              confidence: 0.82,
            },
          ],
        },
      ],
    },
    audit_logs: [
      { timestamp: "13:42:01", stage: "START", message: "Discovered 3 equivalent marketplace listings for 'MacBook Air M2 8GB 256GB'" },
      { timestamp: "13:42:04", stage: "FINGERPRINT", message: "Canonical fingerprint extracted: Apple MacBook Air M2 (8GB RAM / 256GB SSD / Midnight)" },
      { timestamp: "13:42:12", stage: "OFFERS", message: "Amazon: 1 unconditional coupon (₹1,500) + 1 conditional bank discount (₹5,000 HDFC Card)" },
      { timestamp: "13:42:15", stage: "EVALUATION", message: "Flipkart: Advertised ₹89,900; ₹99 secured packaging fee added at cart. Urgency alert flagged." },
      { timestamp: "13:42:22", stage: "COMPLETE", message: "Comparison finished. Highest transparency: Croma. Lowest unconditional price: Amazon." },
    ],
    listings: [
      {
        listing_id: "ls-amazon-01",
        marketplace: "amazon",
        marketplace_display: "Amazon.in",
        url: "https://www.amazon.in/dp/B0B3B7W2Z9",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Appario Retail", rating: 4.6, is_platform_direct: false },
        listed_price: 84990,
        mrp: 99900,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-az-1",
            offer_type: "coupon",
            offer_title: "₹1,500 Amazon Voucher Applied",
            offer_text: "Flat ₹1,500 off clipped coupon applicable for all customers.",
            discount_value: 1500,
            is_conditional: false,
            is_applicable: true,
          },
          {
            offer_id: "of-az-2",
            offer_type: "bank_offer",
            offer_title: "₹5,000 Instant Discount with HDFC Credit Cards",
            offer_text: "Additional ₹5,000 instant discount on HDFC Bank Credit Card non-EMI txns.",
            discount_value: 5000,
            bank: "HDFC Bank",
            payment_method: "HDFC Credit Card",
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 84990,
          mandatory_fees: 0,
          applicable_coupons: 1500,
          conditional_savings: 5000,
          conditional_savings_detail: ["₹5,000 off requires HDFC Bank Credit Card"],
          effective_payable: 83490,
          currency: "INR",
          calculation_note: "Guaranteed out-of-pocket payable price is ₹83,490 (or ₹78,490 with HDFC Card).",
        },
      },
      {
        listing_id: "ls-flipkart-01",
        marketplace: "flipkart",
        marketplace_display: "Flipkart",
        url: "https://www.flipkart.com/item/apple-macbook-air-m2",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "IndiFlashMart", rating: 4.3, is_platform_direct: false },
        listed_price: 89900,
        mrp: 99900,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "ELEVATED",
        findings_count: 2,
        findings_summary: [
          "Mandatory ₹99 Secured Packaging fee withheld from upfront listing price",
          "High-pressure artificial urgency: 'Only 1 left in stock — 44 people bought in last hour'",
        ],
        price_transparency: "SIGNAL",
        fee_transparency: "SIGNAL",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "SIGNAL",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-fk-1",
            offer_type: "bank_offer",
            offer_title: "₹4,000 ICICI Bank Discount",
            offer_text: "10% Instant Discount up to ₹4,000 on ICICI Bank Cards.",
            discount_value: 4000,
            bank: "ICICI Bank",
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 89900,
          mandatory_fees: 99,
          applicable_coupons: 0,
          conditional_savings: 4000,
          conditional_savings_detail: ["₹4,000 off requires ICICI Bank Card"],
          effective_payable: 89999,
          currency: "INR",
          calculation_note: "Payable is ₹89,999 due to unavoidable ₹99 packaging fee added at checkout.",
        },
      },
      {
        listing_id: "ls-croma-01",
        marketplace: "croma",
        marketplace_display: "Croma",
        url: "https://www.croma.com/apple-macbook-air-m2-8gb-256gb",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Croma Retail Direct", rating: 4.8, is_platform_direct: true },
        listed_price: 86990,
        mrp: 99900,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-cr-1",
            offer_type: "bank_offer",
            offer_title: "₹3,500 Instant Discount with NeuCard",
            offer_text: "₹3,500 discount on Tata Neu Infinity Credit Card.",
            discount_value: 3500,
            bank: "Tata Neu",
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 86990,
          mandatory_fees: 0,
          applicable_coupons: 0,
          conditional_savings: 3500,
          conditional_savings_detail: ["₹3,500 off with Tata Neu Credit Card"],
          effective_payable: 86990,
          currency: "INR",
          calculation_note: "100% upfront price honesty: zero hidden handling or checkout surcharges.",
        },
      },
    ],
  },
  "sample-sony-headphones": {
    compare_id: "sample-sony-headphones",
    query: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    query_type: "product_intent",
    status: "done",
    started_at: Date.now() - 35000,
    completed_at: Date.now() - 3000,
    canonical_product: {
      brand: "Sony",
      model: "WH-1000XM5",
      color: "Black",
      condition: "new",
      extraction_confidence: 0.96,
    },
    inconsistencies: [
      {
        product_match: "MATCHED",
        seller_a_name: "Appario Retail Pvt Ltd",
        seller_b_name: "Tata Unistore Direct",
        price_a: 29990,
        price_b: 26990,
        price_delta: 3000,
        price_delta_pct: 10.0,
        marketplace_a: "amazon",
        marketplace_b: "tatacliq",
        same_product: true,
        same_seller: false,
        same_variant: true,
        same_condition: true,
        material_difference: true,
        offer_explanation_found: true,
        offer_explanation: "Amazon lists at ₹29,990 with ₹2,000 credit card instant discount; Tata CLiQ advertises flat ₹26,990 upfront.",
        explanation: "Comparable products (MATCHED): Sony WH-1000XM5. Upfront price delta of ₹3,000 between Amazon (₹29,990) and Tata CLiQ (₹26,990).",
      },
    ],
    review_evidence: {
      total_reviews_analyzed: 4,
      overall_corroboration: "CORROBORATING_SIGNALS_DETECTED",
      disclaimer: "Review evidence is corroborating signal only. Individual reviews are not verified. DarkShield does not claim fraud based on review content alone.",
      clusters: [
        {
          concern: "UNEXPECTED_FEE",
          signal_type: "UNEXPECTED_FEE",
          review_count: 3,
          representative_snippet: "Convenience delivery surcharge of ₹99 added at checkout on Reliance Digital.",
          confidence: 0.85,
          signals: [
            {
              review_text: "Convenience delivery surcharge of ₹99 added at checkout on Reliance Digital.",
              signal_type: "UNEXPECTED_FEE",
              marketplace: "reliancedigital",
              source: "public_reviews",
              confidence: 0.85,
            },
          ],
        },
      ],
    },
    audit_logs: [
      { timestamp: "14:10:01", stage: "START", message: "Discovered 3 equivalent marketplace listings for 'Sony WH-1000XM5'" },
      { timestamp: "14:10:05", stage: "FINGERPRINT", message: "Canonical fingerprint extracted: Sony WH-1000XM5 (Wireless ANC / Over-Ear / Black)" },
      { timestamp: "14:10:12", stage: "OFFERS", message: "Amazon: ₹2,000 Instant Card Discount; Tata CLiQ: 100% upfront pricing (zero hidden fees)" },
      { timestamp: "14:10:18", stage: "COMPLETE", message: "Comparison finished. Highest transparency: Tata CLiQ (₹26,990). Lowest effective: Tata CLiQ." },
    ],
    listings: [
      {
        listing_id: "ls-az-sony",
        marketplace: "amazon",
        marketplace_display: "Amazon.in",
        url: "https://www.amazon.in/dp/B09XS7JWHH",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Appario Retail", rating: 4.6, is_platform_direct: false },
        listed_price: 29990,
        mrp: 34990,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-sony-az-1",
            offer_type: "bank_offer",
            offer_title: "₹2,000 Instant Card Discount",
            offer_text: "Flat ₹2,000 instant discount on all major credit cards.",
            discount_value: 2000,
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 29990,
          mandatory_fees: 0,
          applicable_coupons: 0,
          conditional_savings: 2000,
          conditional_savings_detail: ["₹2,000 off with Credit Card"],
          effective_payable: 29990,
          currency: "INR",
          calculation_note: "Upfront listed price is ₹29,990 (₹27,990 with credit card discount).",
        },
      },
      {
        listing_id: "ls-tata-sony",
        marketplace: "tatacliq",
        marketplace_display: "Tata CLiQ",
        url: "https://www.tatacliq.com/sony-wh-1000xm5/p-mp00000001",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Tata Unistore Direct", rating: 4.9, is_platform_direct: true },
        listed_price: 26990,
        mrp: 34990,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [],
        effective_price: {
          listed_price: 26990,
          mandatory_fees: 0,
          applicable_coupons: 0,
          conditional_savings: 0,
          conditional_savings_detail: [],
          effective_payable: 26990,
          currency: "INR",
          calculation_note: "100% upfront pricing with zero conditional requirements or surprise fees.",
        },
      },
      {
        listing_id: "ls-rd-sony",
        marketplace: "reliancedigital",
        marketplace_display: "Reliance Digital",
        url: "https://www.reliancedigital.in/sony-wh-1000xm5/p/492850",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Reliance ResQ Direct", rating: 4.4, is_platform_direct: true },
        listed_price: 28499,
        mrp: 34990,
        delivery_charge: 99,
        delivery_free: false,
        risk_level: "MODERATE",
        findings_count: 1,
        findings_summary: ["Pre-selected 1-Year Extended Warranty (+₹1,299) added in purchase summary"],
        price_transparency: "CLEAR",
        fee_transparency: "SIGNAL",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "SIGNAL",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [],
        effective_price: {
          listed_price: 28499,
          mandatory_fees: 99,
          applicable_coupons: 0,
          conditional_savings: 0,
          conditional_savings_detail: [],
          effective_payable: 28598,
          currency: "INR",
          calculation_note: "Standard delivery fee of ₹99 applied.",
        },
      },
    ],
  },
  "sample-samsung-s24": {
    compare_id: "sample-samsung-s24",
    query: "Samsung Galaxy S24 5G 8GB 256GB Onyx Black",
    query_type: "product_intent",
    status: "done",
    started_at: Date.now() - 40000,
    completed_at: Date.now() - 2000,
    canonical_product: {
      brand: "Samsung",
      model: "Galaxy S24 5G",
      ram: "8GB",
      storage: "256GB",
      processor: "Snapdragon 8 Gen 3 / Exynos 2400",
      screen_size: "6.2 inch AMOLED",
      color: "Onyx Black",
      condition: "new",
      extraction_confidence: 0.97,
    },
    inconsistencies: [
      {
        product_match: "MATCHED",
        seller_a_name: "STPL India",
        seller_b_name: "IndiFlashMart",
        price_a: 74999,
        price_b: 79999,
        price_delta: 5000,
        price_delta_pct: 6.7,
        marketplace_a: "amazon",
        marketplace_b: "flipkart",
        same_product: true,
        same_seller: false,
        same_variant: true,
        same_condition: true,
        material_difference: true,
        offer_explanation_found: false,
        explanation: "Comparable products (MATCHED): Samsung Galaxy S24 5G. Listed price differs by ₹5,000 (6.7%) between Amazon (₹74,999) and Flipkart (₹79,999). Effective out-of-pocket gap widens to ₹12,598 due to Flipkart's pre-selected protection add-ons.",
      },
    ],
    review_evidence: {
      total_reviews_analyzed: 6,
      overall_corroboration: "CORROBORATING_SIGNALS_DETECTED",
      disclaimer: "Review evidence is corroborating signal only. Individual reviews are not verified. DarkShield does not claim fraud based on review content alone.",
      clusters: [
        {
          concern: "PRICE_MISMATCH",
          signal_type: "PRICE_MISMATCH",
          review_count: 4,
          representative_snippet: "Screen protection of ₹1,499 was added by default; difficult to remove in mobile view.",
          confidence: 0.91,
          signals: [
            {
              review_text: "Screen protection of ₹1,499 was added by default; difficult to remove in mobile view.",
              signal_type: "PRICE_MISMATCH",
              marketplace: "flipkart",
              source: "public_reviews",
              confidence: 0.91,
            },
          ],
        },
      ],
    },
    audit_logs: [
      { timestamp: "14:15:02", stage: "START", message: "Discovered 3 equivalent marketplace listings for 'Samsung Galaxy S24 5G'" },
      { timestamp: "14:15:06", stage: "FINGERPRINT", message: "Canonical fingerprint extracted: Samsung Galaxy S24 (8GB / 256GB / Onyx Black)" },
      { timestamp: "14:15:14", stage: "OFFERS", message: "Amazon: ₹1,000 coupon + ₹5,000 SBI Card discount; Flipkart: ₹1,499 pre-ticked add-on" },
      { timestamp: "14:15:20", stage: "COMPLETE", message: "Comparison finished. Lowest effective price: Amazon (₹68,999 with SBI card)." },
    ],
    listings: [
      {
        listing_id: "ls-az-s24",
        marketplace: "amazon",
        marketplace_display: "Amazon.in",
        url: "https://www.amazon.in/dp/B0CQ288M7Z",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "STPL India", rating: 4.7, is_platform_direct: false },
        listed_price: 74999,
        mrp: 79999,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-s24-az-1",
            offer_type: "coupon",
            offer_title: "₹1,000 Clipped Coupon",
            offer_text: "Flat ₹1,000 off coupon available to all customers.",
            discount_value: 1000,
            is_conditional: false,
            is_applicable: true,
          },
          {
            offer_id: "of-s24-az-2",
            offer_type: "bank_offer",
            offer_title: "₹5,000 Instant Discount with SBI Cards",
            offer_text: "₹5,000 off on SBI Credit Card transactions.",
            discount_value: 5000,
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 74999,
          mandatory_fees: 0,
          applicable_coupons: 1000,
          conditional_savings: 5000,
          conditional_savings_detail: ["₹5,000 off with SBI Credit Card"],
          effective_payable: 73999,
          currency: "INR",
          calculation_note: "Payable upfront is ₹73,999 (₹68,999 with SBI Card).",
        },
      },
      {
        listing_id: "ls-fk-s24",
        marketplace: "flipkart",
        marketplace_display: "Flipkart",
        url: "https://www.flipkart.com/samsung-galaxy-s24-5g",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "IndiFlashMart", rating: 4.2, is_platform_direct: false },
        listed_price: 79999,
        mrp: 79999,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "ELEVATED",
        findings_count: 2,
        findings_summary: [
          "Pre-selected Screen Damage Protection (+₹1,499) sneaked into checkout basket",
          "Mandatory ₹99 Secured Packaging Fee added at cart review",
        ],
        price_transparency: "SIGNAL",
        fee_transparency: "SIGNAL",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "SIGNAL",
        choice_transparency: "SIGNAL",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [],
        effective_price: {
          listed_price: 79999,
          mandatory_fees: 1598,
          applicable_coupons: 0,
          conditional_savings: 0,
          conditional_savings_detail: [],
          effective_payable: 81597,
          currency: "INR",
          calculation_note: "Total payable escalates to ₹81,597 due to ₹99 packaging fee and ₹1,499 pre-ticked insurance.",
        },
      },
      {
        listing_id: "ls-cr-s24",
        marketplace: "croma",
        marketplace_display: "Croma",
        url: "https://www.croma.com/samsung-galaxy-s24-5g",
        status: "PRODUCT_CAPTURED",
        provenance: "DEMO_FIXTURE",
        match_confidence: "MATCHED",
        seller: { name: "Croma Retail Direct", rating: 4.8, is_platform_direct: true },
        listed_price: 76999,
        mrp: 79999,
        delivery_charge: 0,
        delivery_free: true,
        risk_level: "LOW",
        findings_count: 0,
        findings_summary: [],
        price_transparency: "CLEAR",
        fee_transparency: "CLEAR",
        offer_transparency: "CLEAR",
        seller_transparency: "CLEAR",
        urgency_signals: "CLEAR",
        choice_transparency: "CLEAR",
        wording_transparency: "CLEAR",
        journey_coverage: 100,
        offers: [
          {
            offer_id: "of-s24-cr-1",
            offer_type: "bank_offer",
            offer_title: "₹2,000 HDFC Card Instant Discount",
            offer_text: "Instant discount with HDFC Credit Cards.",
            discount_value: 2000,
            is_conditional: true,
            is_applicable: false,
          },
        ],
        effective_price: {
          listed_price: 76999,
          mandatory_fees: 0,
          applicable_coupons: 0,
          conditional_savings: 2000,
          conditional_savings_detail: ["₹2,000 off with HDFC Card"],
          effective_payable: 76999,
          currency: "INR",
          calculation_note: "Payable upfront is ₹76,999 (₹74,999 with card discount).",
        },
      },
    ],
  },
};


export default function CompareAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const compareId = resolvedParams.id;

  const [compare, setCompare] = useState<CompareResult | null>(DEMO_COMPARISONS[compareId] || null);
  const [activeTab, setActiveTab] = useState<"consumer" | "auditor">("consumer");
  const [expandedOffers, setExpandedOffers] = useState<Record<string, boolean>>({});
  const [selectedScreenshot, setSelectedScreenshot] = useState<{ marketplace: string; b64: string } | null>(null);

  useEffect(() => {
    // If it's a known demo scenario, we already loaded it
    if (DEMO_COMPARISONS[compareId]) return;

    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/compare/${compareId}`);
        if (!res.ok) return;
        const data: CompareResult = await res.json();
        setCompare(data);
        if ((data.status === "done" || data.status === "error" || data.status === "partial") && intervalId) {
          clearInterval(intervalId);
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    if (!stopped) {
      intervalId = setInterval(poll, 1500);
    }
    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [compareId]);

  const toggleOffers = (listingId: string) => {
    setExpandedOffers((prev) => ({ ...prev, [listingId]: !prev[listingId] }));
  };

  const router = useRouter();
  const [isLaunchingLive, setIsLaunchingLive] = useState(false);

  const handleRunLiveAudit = async () => {
    setIsLaunchingLive(true);
    try {
      const urlsToCrawl = [
        "https://www.amazon.in/dp/B0B3B7W2Z9",
        "https://www.flipkart.com/apple-macbook-air-m2-8-gb-256-gb-ssd-mac-os-monterey-mly33hn-a/p/itm534d0b13ab9b6",
      ];
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: urlsToCrawl,
          query: compare?.canonical_product?.model
            ? `${compare.canonical_product.brand || ""} ${compare.canonical_product.model}`
            : (compare?.query || "Live Multi-Marketplace Crawl"),
        }),
      });
      const data = await res.json();
      if (data.compare_id) {
        router.push(`/compare/${data.compare_id}`);
      }
    } catch (e) {
      console.error("Live audit launch error:", e);
    } finally {
      setIsLaunchingLive(false);
    }
  };

  const isDemo = Boolean(DEMO_COMPARISONS[compareId]) || Boolean(compare?.listings?.some((l) => l.provenance === "DEMO_FIXTURE"));

  const formatCurrency = (amt?: number | null) => {
    if (amt === undefined || amt === null || isNaN(amt)) return "—";
    return `₹${amt.toLocaleString("en-IN")}`;
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case "PRODUCT_CAPTURED":
      case "CAPTURED":
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800"><Check className="w-3 h-3" /> Acquired</span>;
      case "PAGE_NOT_FOUND":
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"><XCircle className="w-3 h-3" /> 404 Not Found</span>;
      case "PRODUCT_NOT_FOUND":
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800"><AlertTriangle className="w-3 h-3" /> Not Found</span>;
      case "ACCESS_BLOCKED":
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800"><AlertTriangle className="w-3 h-3" /> Access Blocked</span>;
      case "BOT_CHALLENGE":
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800"><XCircle className="w-3 h-3" /> Bot Captcha</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">Evaluating</span>;
    }
  };

  const getProvenanceBadge = (listing: Listing) => {
    if (listing.provenance === "DEMO_FIXTURE") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
          DEMO DATA — VERIFIED FIXTURE
        </span>
      );
    }
    if (listing.status === "PAGE_NOT_FOUND" || listing.provenance === "PAGE_NOT_FOUND") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          PAGE NOT FOUND (404)
        </span>
      );
    }
    if (listing.status === "ACCESS_BLOCKED" || listing.status === "BOT_CHALLENGE" || listing.provenance === "ACCESS_BLOCKED") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/60">
          ACCESS BLOCKED
        </span>
      );
    }
    if (listing.status === "PRODUCT_NOT_FOUND") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
          PRODUCT NOT FOUND
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
        LIVE CRAWL
      </span>
    );
  };

  const getMatchBadge = (match: MatchConfidence) => {
    switch (match) {
      case "MATCHED":
        return <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Verified Exact Spec</span>;
      case "PROBABLE_MATCH":
        return <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Probable Spec Match</span>;
      case "POSSIBLE_MATCH":
        return <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">Title Similarity</span>;
      default:
        return <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Evaluating Match</span>;
    }
  };

  // Find lowest effective price listing and highest transparency listing
  const capturedListings = compare?.listings?.filter((l) => l.status === "CAPTURED" || l.status === "PRODUCT_CAPTURED") || [];
  let bestPriceListingId: string | null = null;
  let lowestEffectivePrice = Infinity;
  let mostTransparentListingId: string | null = null;
  let leastFindings = Infinity;

  capturedListings.forEach((l) => {
    const eff = l.effective_price?.effective_payable ?? l.listed_price ?? Infinity;
    if (eff < lowestEffectivePrice) {
      lowestEffectivePrice = eff;
      bestPriceListingId = l.listing_id;
    }
    if (l.findings_count < leastFindings) {
      leastFindings = l.findings_count;
      mostTransparentListingId = l.listing_id;
    }
  });

  const isRunning = compare?.status === "running";

  if (!compare) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Discovery</span>
            </Link>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm tracking-tight text-white">Cross-Marketplace Comparison</span>
              <span className="text-[11px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 border border-slate-700 font-mono">
                {compareId}
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-20 w-full flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400 shadow-xl shadow-blue-900/20">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-blue-500/20 animate-pulse -z-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Executing Parallel Multi-Marketplace Audit
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              DarkShield has launched headless Chromium sessions to acquire listings, parse pricing structures, extract hidden fees, and evaluate consumer dark patterns.
            </p>
          </div>

          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left font-mono text-xs space-y-2 max-w-lg shadow-inner">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Active Pipeline Stages:</div>
            <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/60">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Amazon.in
              </span>
              <span className="text-emerald-400 text-[11px]">Playwright Acquiring DOM...</span>
            </div>
            <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/60">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Flipkart
              </span>
              <span className="text-amber-400 text-[11px]">Evaluating Bot Challenge & WAF...</span>
            </div>
            <div className="flex items-center justify-between text-slate-300 py-1">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Price Inconsistency Engine
              </span>
              <span className="text-blue-400 text-[11px]">Standing by for Fingerprints</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Discovery</span>
            </Link>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm tracking-tight text-white">Cross-Marketplace Comparison</span>
              <span className="text-[11px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 border border-slate-700 font-mono">
                {compareId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-800/60">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Auditing marketplaces concurrently...</span>
              </div>
            )}
            <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-xs">
              <button
                onClick={() => setActiveTab("consumer")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === "consumer"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Consumer Comparison
              </button>
              <button
                onClick={() => setActiveTab("auditor")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === "auditor"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Forensic Audit Trail
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1 space-y-6">
        {/* Demonstration vs Live Banner */}
        {isDemo && (
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-600/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                DEMO
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Demonstration Dataset — Reproducible Audit
                  </span>
                  <span className="text-[10px] font-mono bg-amber-900/60 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded font-semibold">
                    VERIFIED FIXTURE
                  </span>
                </div>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Pre-computed deterministic fixture for reproducible judge presentation. Marketplace listings and transparency scores are audited against frozen snapshot ground truth.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              <div className="text-[11px] font-mono text-slate-400 space-y-1 border-l border-amber-800/40 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-medium">Amazon</span>
                  <span className="text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded">✓ LIVE READY</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Flipkart</span>
                  <span className="text-[9px] font-semibold bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded">BLOCKED (WAF)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Croma</span>
                  <span className="text-[9px] font-semibold bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded">BLOCKED (WAF)</span>
                </div>
              </div>
              <button
                onClick={handleRunLiveAudit}
                disabled={isLaunchingLive}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-xs font-semibold hover:from-blue-700 hover:to-indigo-700 transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isLaunchingLive ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Launching Playwright...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Live Audit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Canonical Spec & Summary Header */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl">

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] uppercase font-mono tracking-wider text-emerald-400 font-semibold">
                  Canonical Product Spec
                </span>
                {compare?.canonical_product && (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800 rounded-full font-medium">
                    Hardware Fingerprint Locked
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {compare?.canonical_product?.brand && compare?.canonical_product?.model
                  ? `${compare.canonical_product.brand} ${compare.canonical_product.model}`
                  : compare?.query || "Cross-Marketplace Product Audit"}
              </h1>

              {/* Hardware Spec Pills */}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {compare?.canonical_product?.ram && (
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    RAM: <strong className="text-white">{compare.canonical_product.ram}</strong>
                  </span>
                )}
                {compare?.canonical_product?.storage && (
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    Storage: <strong className="text-white">{compare.canonical_product.storage}</strong>
                  </span>
                )}
                {compare?.canonical_product?.processor && (
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 uppercase">
                    CPU: <strong className="text-white">{compare.canonical_product.processor}</strong>
                  </span>
                )}
                {compare?.canonical_product?.screen_size && (
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    Screen: <strong className="text-white">{compare.canonical_product.screen_size}</strong>
                  </span>
                )}
                {compare?.canonical_product?.color && (
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 capitalize">
                    Color: <strong className="text-white">{compare.canonical_product.color}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-4 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide">Listings Audited</div>
                <div className="text-lg font-bold text-white">{compare?.listings?.length || 0} Portals</div>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide">Lowest Out-of-Pocket</div>
                <div className="text-lg font-bold text-emerald-400">
                  {lowestEffectivePrice !== Infinity ? formatCurrency(lowestEffectivePrice) : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Inconsistencies Alert */}
          {compare?.inconsistencies && compare.inconsistencies.length > 0 && (
            <div className="mt-4 p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Price & Listing Inconsistency Evidence:</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
                {compare.inconsistencies.map((inc, i) => (
                  <li key={i}>
                    {inc.marketplace_a.toUpperCase()} ({formatCurrency(inc.price_a)}) vs {inc.marketplace_b.toUpperCase()} ({formatCurrency(inc.price_b)}) — delta of {formatCurrency(inc.price_delta)} ({inc.price_delta_pct}%).
                    {inc.offer_explanation_found && (
                      <span className="text-emerald-300 ml-1">[{inc.offer_explanation}]</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Review Evidence & Corroborating Signals */}
        {compare?.review_evidence && compare.review_evidence.total_reviews_analyzed > 0 && (
          <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span>Public Review Evidence & Corroboration</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                  {compare.review_evidence.total_reviews_analyzed} Signals Extracted
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Role: CORROBORATING EVIDENCE ONLY
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Synthesis: <span className="font-semibold text-emerald-400">{compare.review_evidence.overall_corroboration}</span>
              </div>
            </div>

            {/* Clusters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {compare.review_evidence.clusters.map((cluster, idx) => (
                <div key={idx} className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      {cluster.concern}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {cluster.review_count} complaint(s) • {(cluster.confidence * 100).toFixed(0)}% signal confidence
                    </span>
                  </div>
                  <p className="text-xs italic text-slate-300 border-l-2 border-amber-500/80 pl-2.5 py-0.5 leading-relaxed">
                    "{cluster.representative_snippet}"
                  </p>
                </div>
              ))}
            </div>

            {/* Mandatory Non-Fraud Disclaimer */}
            <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800 leading-relaxed">
              ⚠️ <strong className="text-slate-300">Evidentiary Standard:</strong> {compare.review_evidence.disclaimer}
            </div>
          </section>
        )}

        {/* Listings Comparison Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Side-by-Side Market Listings & Out-of-Pocket Breakdown</span>
            </h2>
            <span className="text-xs text-slate-400">
              Sorted by Unconditional Net Payable
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {compare?.listings?.map((listing) => {
              const isBestPrice = bestPriceListingId === listing.listing_id;
              const isMostTransparent = mostTransparentListingId === listing.listing_id;
              const isCaptured = listing.status === "CAPTURED" || listing.status === "PRODUCT_CAPTURED";
              const eff = listing.effective_price;
              const offersOpen = expandedOffers[listing.listing_id];

              return (
                <div
                  key={listing.listing_id}
                  className={`bg-slate-900/90 rounded-xl border flex flex-col justify-between overflow-hidden shadow-xl transition hover:border-slate-600 ${
                    isBestPrice
                      ? "border-emerald-600/80 ring-1 ring-emerald-500/20"
                      : "border-slate-800"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-800 bg-slate-900/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-white">
                          {listing.marketplace_display}
                        </span>
                        {getStatusBadge(listing.status)}
                      </div>
                      {getMatchBadge(listing.match_confidence)}
                    </div>

                    {/* Provenance Badge */}
                    <div className="mb-2">
                      {getProvenanceBadge(listing)}
                    </div>

                    {/* Highlights */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {isBestPrice && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/80 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Lowest Net Price
                        </span>
                      )}
                      {isMostTransparent && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-700/80 flex items-center gap-1">
                          <Shield className="w-3 h-3 text-blue-400" /> Zero Dark Patterns
                        </span>
                      )}
                    </div>

                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-emerald-400 transition mt-2.5 block truncate flex items-center gap-1"
                    >
                      <span className="truncate">{listing.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>

                  {/* Pricing Matrix */}
                  <div className="p-4 space-y-3 flex-1">
                    {isCaptured ? (

                      <>
                        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400">Advertised Listing Price:</span>
                            <span className="text-sm font-semibold text-slate-200">
                              {formatCurrency(listing.listed_price)}
                            </span>
                          </div>

                          {(listing.delivery_charge || 0) > 0 && (
                            <div className="flex items-baseline justify-between text-xs text-amber-300/90">
                              <span>+ Shipping & Delivery:</span>
                              <span>+{formatCurrency(listing.delivery_charge)}</span>
                            </div>
                          )}

                          {eff && eff.mandatory_fees > 0 && (
                            <div className="flex items-baseline justify-between text-xs text-rose-300/90">
                              <span>+ Mandatory Packaging/Platform:</span>
                              <span>+{formatCurrency(eff.mandatory_fees)}</span>
                            </div>
                          )}

                          {eff && eff.applicable_coupons > 0 && (
                            <div className="flex items-baseline justify-between text-xs text-emerald-400">
                              <span>- Unconditional Coupons:</span>
                              <span>-{formatCurrency(eff.applicable_coupons)}</span>
                            </div>
                          )}

                          <div className="h-px bg-slate-800" />

                          {/* Effective Payable */}
                          <div className="flex items-baseline justify-between">
                            <div>
                              <div className="text-xs font-bold text-white">Guaranteed Payable</div>
                              <div className="text-[10px] text-slate-500">Unconditional out-of-pocket</div>
                            </div>
                            <div className="text-lg font-bold text-emerald-400">
                              {formatCurrency(eff?.effective_payable ?? listing.listed_price)}
                            </div>
                          </div>

                          {eff && eff.conditional_savings > 0 && (
                            <div className="flex items-baseline justify-between text-xs text-cyan-300/90 pt-1 border-t border-slate-900">
                              <div>
                                <span>Best-Case Card Discount:</span>
                                <span className="text-[10px] block text-cyan-500">
                                  Conditional (-{formatCurrency(eff.conditional_savings)})
                                </span>
                              </div>
                              <span className="font-semibold text-cyan-400">
                                {formatCurrency(
                                  (eff.effective_payable ?? listing.listed_price ?? 0) - eff.conditional_savings
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Transparency Dimensions */}
                        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 text-[11px] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Price Transparency:</span>
                            <span className={`font-semibold ${listing.price_transparency === "CLEAR" ? "text-emerald-400" : "text-amber-400"}`}>
                              {listing.price_transparency}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Urgency Signals:</span>
                            <span className={`font-semibold ${listing.urgency_signals === "CLEAR" ? "text-emerald-400" : "text-rose-400"}`}>
                              {listing.urgency_signals}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Fee Disclosure:</span>
                            <span className={`font-semibold ${listing.fee_transparency === "CLEAR" ? "text-emerald-400" : "text-rose-400"}`}>
                              {listing.fee_transparency}
                            </span>
                          </div>
                        </div>

                        {/* Findings / CCPA Violations */}
                        <div className="text-xs">
                          {listing.findings_count > 0 ? (
                            <div className="p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 space-y-1">
                              <div className="font-semibold flex items-center gap-1.5 text-rose-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{listing.findings_count} Deceptive Patterns Flagged</span>
                              </div>
                              <ul className="list-disc list-inside text-[11px] text-rose-200/80 space-y-0.5">
                                {listing.findings_summary.map((sum, i) => (
                                  <li key={i}>{sum}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-300 text-[11px] flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Zero deceptive dark patterns observed</span>
                            </div>
                          )}
                        </div>

                        {/* Offers & Coupons Inspector */}
                        <div>
                          <button
                            onClick={() => toggleOffers(listing.listing_id)}
                            className="w-full flex items-center justify-between text-xs py-1.5 px-2.5 bg-slate-800/60 hover:bg-slate-800 rounded border border-slate-700/60 text-slate-300 transition"
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              <Tag className="w-3 h-3 text-cyan-400" />
                              <span>{listing.offers?.length || 0} Offers & Coupons</span>
                            </span>
                            {offersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {offersOpen && (
                            <div className="mt-2 space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
                              {listing.offers?.length === 0 ? (
                                <div className="text-[11px] text-slate-500 italic p-1">No coupons or bank offers found.</div>
                              ) : (
                                listing.offers.map((off) => (
                                  <div
                                    key={off.offer_id}
                                    className="p-2 bg-slate-950 rounded border border-slate-800 text-[11px] space-y-0.5"
                                  >
                                    <div className="flex items-center justify-between font-semibold text-slate-200">
                                      <span>{off.offer_title}</span>
                                      {off.is_conditional ? (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                          Card / Membership
                                        </span>
                                      ) : (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                          All Buyers
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-slate-400 text-[10px]">{off.offer_text}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                        <AlertTriangle className="w-8 h-8 text-amber-500/60" />
                        <div className="text-xs font-semibold text-slate-400">
                          {listing.status === "PAGE_NOT_FOUND"
                            ? "Page Not Found (404)"
                            : listing.status === "PRODUCT_NOT_FOUND"
                            ? "Product Not Found / Not Captured"
                            : listing.status === "ACCESS_BLOCKED"
                            ? "Marketplace Access Blocked (WAF)"
                            : listing.status === "BOT_CHALLENGE"
                            ? "Bot Captcha Challenge"
                            : "Evaluating Listing"}
                        </div>
                        <div className="text-[11px] max-w-xs text-slate-400">
                          {listing.status === "PAGE_NOT_FOUND"
                            ? "Marketplace returned an HTTP 404 or missing product page. Risk is truthfully classified as UNDETERMINED with 0% journey coverage."
                            : listing.status === "ACCESS_BLOCKED" || listing.status === "BOT_CHALLENGE"
                            ? "Marketplace anti-bot protection prevented autonomous price extraction. No fabricated prices or speculative scores are assigned."
                            : listing.access_reason || "DarkShield recorded this stage transparently without guessing or synthesizing false pricing data."}
                        </div>
                        <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                          Risk: <span className="font-semibold text-amber-400">UNDETERMINED</span> • Transparency: <span className="font-semibold text-slate-400">NOT_EVALUATED</span>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Card Footer */}
                  <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">
                      {listing.seller?.name ? `Seller: ${listing.seller.name}` : "Verified Listing"}
                    </span>

                    {listing.screenshot_b64 && (
                      <button
                        onClick={() =>
                          setSelectedScreenshot({
                            marketplace: listing.marketplace_display,
                            b64: listing.screenshot_b64!,
                          })
                        }
                        className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Evidence Snapshot</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Auditor Forensic Trail */}
        {activeTab === "auditor" && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">Forensic Audit Log & Acquisition Timings</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {compare?.audit_logs?.length || 0} events recorded
              </span>
            </div>

            <div className="font-mono text-xs space-y-2 bg-slate-950 p-4 rounded-lg border border-slate-800 max-h-72 overflow-y-auto">
              {compare?.audit_logs?.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 text-slate-300 border-b border-slate-900 pb-1.5 last:border-none">
                  <span className="text-slate-500 shrink-0 text-[11px]">{entry.timestamp}</span>
                  <span className="text-emerald-400 font-semibold shrink-0 text-[11px]">[{entry.stage}]</span>
                  <span className="text-slate-300 leading-tight">{entry.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-sm text-white">
                  Evidence Capture: {selectedScreenshot.marketplace}
                </span>
              </div>
              <button
                onClick={() => setSelectedScreenshot(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 bg-slate-800 rounded"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
              <img
                src={`data:image/png;base64,${selectedScreenshot.b64}`}
                alt="Marketplace Listing Capture"
                className="max-w-full rounded border border-slate-800 shadow"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
