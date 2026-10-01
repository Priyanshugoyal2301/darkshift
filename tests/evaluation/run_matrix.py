"""
DarkShield — Evaluation Harness & Benchmark Matrix Runner
Automated verification against the 14 standardized evaluation scenarios.
Computes True Positives (TP), False Positives (FP), False Negatives (FN),
Inconclusive counts, and Scan Coverage.
"""

import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Add services/api to sys.path so detection engine can be imported directly
api_path = os.path.join(os.path.dirname(__file__), "..", "..", "services", "api")
sys.path.insert(0, os.path.abspath(api_path))

from detection_engine import (
    analyze_page, assess_price_journey, compute_risk_assessment,
    compute_scan_coverage, classify_action_element, extract_price_components
)
from schemas import (
    CCPAPattern, ConfidenceTier, CoverageStatus, DarkPatternAssessmentStatus,
    ActionPolicyTier, PriceStage, PriceComponent
)

def run_evaluation_matrix():
    fixtures_dir = os.path.join(api_path, "fixtures")

    matrix_results = []
    tp = 0
    fp = 0
    fn = 0
    inconclusive_count = 0

    print("=" * 80)
    print("DARKSHIELD EVALUATION HARNESS — 14 SCENARIO REGRESSION MATRIX")
    print("=" * 80)

    # ── 1. Clean E-Commerce Baseline ──────────────────────────────────────────
    clean_html_path = os.path.join(fixtures_dir, "09-benign-clean.html")
    with open(clean_html_path, "r", encoding="utf-8") as f:
        clean_html = f.read()
    clean_findings, _ = analyze_page("https://example.com/clean", clean_html, clean_html)
    clean_risk = compute_risk_assessment(clean_findings, stages_scanned=["product", "cart", "checkout"])
    
    is_clean = (len([f for f in clean_findings if f.confidence_tier == ConfidenceTier.HIGH]) == 0 and clean_risk.risk_level == "LOW")
    if is_clean:
        matrix_results.append(("Clean ecommerce baseline", "Clean (LOW)", clean_risk.risk_level, "PASS"))
    else:
        matrix_results.append(("Clean ecommerce baseline", "Clean (LOW)", clean_risk.risk_level, "FAIL"))
        fp += 1

    # ── 2. False Urgency ───────────────────────────────────────────────────────
    urgency_path = os.path.join(fixtures_dir, "01-false-urgency.html")
    with open(urgency_path, "r", encoding="utf-8") as f:
        urgency_html = f.read()
    urg_findings, _ = analyze_page("https://example.com/urgency", urgency_html, urgency_html)
    has_urgency = any(f.pattern == CCPAPattern.FALSE_URGENCY for f in urg_findings)
    if has_urgency:
        matrix_results.append(("False urgency (resetting timer)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("False urgency (resetting timer)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 3. Basket Sneaking (Pre-ticked Add-ons) ────────────────────────────────
    cart_path = os.path.join(fixtures_dir, "03-drip-pricing-cart.html")
    with open(cart_path, "r", encoding="utf-8") as f:
        cart_html = f.read()
    cart_findings, _ = analyze_page("https://example.com/cart", cart_html, cart_html)
    has_sneaking = any(f.pattern == CCPAPattern.BASKET_SNEAKING for f in cart_findings)
    if has_sneaking:
        matrix_results.append(("Basket sneaking (pre-ticked add-on)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Basket sneaking (pre-ticked add-on)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 4. Confirm Shaming ─────────────────────────────────────────────────────
    shame_html = "<button class='btn-secondary'>No thanks, I hate saving money and prefer full price</button>"
    shame_findings, _ = analyze_page("https://example.com/shame", shame_html, shame_html)
    has_shame = any(f.pattern == CCPAPattern.CONFIRM_SHAMING for f in shame_findings)
    if has_shame:
        matrix_results.append(("Confirm shaming (guilt-inducing opt-out)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Confirm shaming (guilt-inducing opt-out)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 5. Interface Interference (Visual Asymmetry) ───────────────────────────
    interference_html = "<div class='choice-modal'><a href='/accept' style='font-size: 24px; background: blue; padding: 20px;'>Accept Terms</a><a href='/decline' style='font-size: 9px; opacity: 0.1; color: #888888;'>Decline</a></div>"
    int_findings, _ = analyze_page("https://example.com/interference", interference_html, interference_html)
    has_int = any(f.pattern == CCPAPattern.INTERFACE_INTERFERENCE for f in int_findings)
    if has_int:
        matrix_results.append(("Interface interference (visual asymmetry)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Interface interference (visual asymmetry)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 6. Drip Pricing (Late Mandatory Fee) ───────────────────────────────────
    st_p0 = PriceStage(stage="product", stage_label="1. Product", total=4890.0, components=[])
    st_p1 = PriceStage(stage="cart", stage_label="2. Cart", total=4890.0, components=[])
    st_p2 = PriceStage(stage="checkout", stage_label="3. Checkout", total=5340.0, components=[
        PriceComponent(component_type="convenience_fee", label="Convenience Fee", amount=450.0, is_mandatory=True, disclosed_early=False)
    ])
    journey_drip, j_findings = assess_price_journey([st_p0, st_p1, st_p2], stages_scanned=["product", "cart", "checkout"])
    is_drip_flagged = journey_drip.is_drip_pricing and journey_drip.dark_pattern_assessment == DarkPatternAssessmentStatus.DETECTED
    if is_drip_flagged:
        matrix_results.append(("Drip pricing (late convenience fee)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Drip pricing (late convenience fee)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 7. Subscription Trap ───────────────────────────────────────────────────
    sub_html = "<div>Start your free 7-day trial. Automatic recurring renewal of ₹999/month will be billed to your card. Strict no-refund policy. To cancel, mail notarized written notice.</div>"
    sub_findings, _ = analyze_page("https://example.com/sub", sub_html, sub_html)
    has_sub = any(f.pattern == CCPAPattern.SUBSCRIPTION_TRAP for f in sub_findings)
    if has_sub:
        matrix_results.append(("Subscription trap (hidden auto-renewal)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Subscription trap (hidden auto-renewal)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 8. Forced Action ───────────────────────────────────────────────────────
    forced_html = "<div>To view this product details, you must install DarkApp mobile extension and grant access to your contacts.</div>"
    forced_findings, _ = analyze_page("https://example.com/forced", forced_html, forced_html)
    has_forced = any(f.pattern == CCPAPattern.FORCED_ACTION for f in forced_findings)
    if has_forced:
        matrix_results.append(("Forced action (mandatory download barrier)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Forced action (mandatory download barrier)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 9. Inconclusive Scenario (No Checkout Available) ───────────────────────
    # Single product page without cart/checkout reached
    single_stage_risk = compute_risk_assessment([], stages_scanned=["product"])
    is_undetermined = (single_stage_risk.risk_level == "UNDETERMINED" and not single_stage_risk.coverage_sufficient)
    if is_undetermined:
        matrix_results.append(("No checkout reached (insufficient coverage)", "Inconclusive (UNDETERMINED)", "UNDETERMINED", "PASS"))
        inconclusive_count += 1
    else:
        matrix_results.append(("No checkout reached (insufficient coverage)", "Inconclusive (UNDETERMINED)", single_stage_risk.risk_level, "FAIL"))

    # ── 10. Checkout Reached with Zero Price Escalation ────────────────────────
    st_clean_p0 = PriceStage(stage="product", stage_label="1. Product", total=999.0, components=[])
    st_clean_p1 = PriceStage(stage="cart", stage_label="2. Cart", total=999.0, components=[])
    st_clean_p2 = PriceStage(stage="checkout", stage_label="3. Checkout", total=999.0, components=[])
    journey_clean, _ = assess_price_journey([st_clean_p0, st_clean_p1, st_clean_p2], stages_scanned=["product", "cart", "checkout"])
    is_eval_clean = (journey_clean.dark_pattern_assessment == DarkPatternAssessmentStatus.EVALUATED_CLEAN and journey_clean.delta_total == 0)
    if is_eval_clean:
        matrix_results.append(("Checkout reached, stable transparent price", "Evaluated Clean", "Evaluated Clean", "PASS"))
    else:
        matrix_results.append(("Checkout reached, stable transparent price", "Evaluated Clean", str(journey_clean.dark_pattern_assessment), "FAIL"))

    # ── 11. Legitimate Variable Shipping at Cart (NOT Drip Pricing) ─────────────
    st_ship_p0 = PriceStage(stage="product", stage_label="1. Product", total=999.0, components=[])
    st_ship_p1 = PriceStage(stage="cart", stage_label="2. Cart", total=1049.0, components=[
        PriceComponent(component_type="shipping", label="Standard Delivery Charges", amount=50.0, is_mandatory=True, disclosed_early=True)
    ])
    journey_ship, ship_findings = assess_price_journey([st_ship_p0, st_ship_p1], stages_scanned=["product", "cart"])
    is_legit_shipping = (not journey_ship.is_drip_pricing and journey_ship.dark_pattern_assessment == DarkPatternAssessmentStatus.EVALUATED_CLEAN)
    if is_legit_shipping and len(ship_findings) == 0:
        matrix_results.append(("Cart price increase (Standard Shipping)", "Evaluated Clean (Not Drip)", "Evaluated Clean", "PASS"))
    else:
        matrix_results.append(("Cart price increase (Standard Shipping)", "Evaluated Clean (Not Drip)", "Drip Flagged", "FAIL"))
        fp += 1

    # ── 12. Checkout Multi-Stage Escalation Evidence ───────────────────────────
    st_aero_p0 = PriceStage(stage="product", stage_label="1. Product", total=4890.0, components=[])
    st_aero_p1 = PriceStage(stage="cart", stage_label="2. Cart", total=5188.0, components=[
        PriceComponent(component_type="protection", label="Travel Insurance", amount=199.0, is_mandatory=False, disclosed_early=False),
        PriceComponent(component_type="donation", label="Carbon Offset", amount=99.0, is_mandatory=False, disclosed_early=False)
    ])
    st_aero_p2 = PriceStage(stage="checkout", stage_label="3. Checkout", total=5638.0, components=[
        PriceComponent(component_type="convenience_fee", label="Convenience Fee", amount=450.0, is_mandatory=True, disclosed_early=False)
    ])
    journey_aero, _ = assess_price_journey([st_aero_p0, st_aero_p1, st_aero_p2], stages_scanned=["product", "cart", "checkout"])
    has_full_deltas = (journey_aero.delta_01 == 298.0 and journey_aero.delta_12 == 450.0 and journey_aero.delta_total == 748.0)
    if has_full_deltas:
        matrix_results.append(("Checkout multi-stage delta audit (P0/P1/P2)", "Deltas Captured (+₹748)", f"+₹{journey_aero.delta_total:,.0f} (+{journey_aero.percentage_increase}%)", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Checkout multi-stage delta audit (P0/P1/P2)", "Deltas Captured", "Delta Mismatch", "FAIL"))
        fn += 1

    # ── 13. Preselected Add-on Checkbox (PhysicsWallah Regression) ─────────────
    pw_path = os.path.join(fixtures_dir, "07-physicswallah-regression.html")
    with open(pw_path, "r", encoding="utf-8") as f:
        pw_html = f.read()
    pw_findings, _ = analyze_page("https://example.com/pw", pw_html, pw_html)
    pw_sneaking = any(f.pattern == CCPAPattern.BASKET_SNEAKING for f in pw_findings)
    if pw_sneaking:
        matrix_results.append(("Preselected donation (CCPA June 2026 case)", "Detected", "Detected", "PASS"))
        tp += 1
    else:
        matrix_results.append(("Preselected donation (CCPA June 2026 case)", "Detected", "Not Detected", "FAIL"))
        fn += 1

    # ── 14. Action Policy Safety Classifier (Pay Now BLOCKED) ──────────────────
    action_pay = classify_action_element("Pay ₹5,638 Now", tag="button", attributes={}, form_context={}, current_stage="checkout")
    action_cart = classify_action_element("Add to Cart", tag="button", attributes={}, form_context={}, current_stage="product")
    action_safe = (action_pay.action_tier == ActionPolicyTier.BLOCKED and action_cart.action_tier == ActionPolicyTier.SAFE)
    if action_safe:
        matrix_results.append(("Action policy safety (Pay Now BLOCKED, Cart SAFE)", "Enforced", "Enforced", "PASS"))
    else:
        matrix_results.append(("Action policy safety (Pay Now BLOCKED, Cart SAFE)", "Enforced", f"Pay: {action_pay.action_tier}", "FAIL"))

    # ── Summary Report ─────────────────────────────────────────────────────────
    print(f"\n{'Test Scenario':<48} | {'Expected':<22} | {'Actual':<22} | {'Result':<6}")
    print("-" * 105)
    for test_name, exp, act, res in matrix_results:
        res_str = f"[\033[92mPASS\033[0m]" if res == "PASS" else f"[\033[91mFAIL\033[0m]"
        print(f"{test_name:<48} | {exp:<22} | {act:<22} | {res:<6}")

    passed_count = sum(1 for _, _, _, res in matrix_results if res == "PASS")
    total_tests = len(matrix_results)
    pass_rate = round((passed_count / total_tests) * 100, 1)

    print("-" * 105)
    print(f"EVALUATION RESULTS: {passed_count}/{total_tests} Scenarios Passed ({pass_rate}% Success Rate)")
    print(f"Metrics: True Positives (TP) = {tp} | False Positives (FP) = {fp} | False Negatives (FN) = {fn}")
    print(f"Inconclusive Handled = {inconclusive_count} | Scan Coverage = 100% of defined matrix")
    print("=" * 80)

    return passed_count == total_tests

if __name__ == "__main__":
    success = run_evaluation_matrix()
    sys.exit(0 if success else 1)
