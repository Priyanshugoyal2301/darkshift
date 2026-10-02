"""
DarkShield — Crawler v3: Multi-Strategy Acquisition Orchestrator
Coordinates the Acquisition Ladder:
1. URL Normalization & Page-Type Profiling
2. Access Classification & Anti-Automation Verification
3. Level 1 HTTP Acquisition (JSON-LD + Hydration)
4. Level 2 Browser Acquisition (Playwright with Network Response Capture)
5. Platform Adapter Selection (Shopify, WooCommerce, Magento, BigCommerce, Generic)
6. Multi-Source Price Ensemble (JSON-LD + Network JSON + Hydration + DOM + Adapter)
7. Purchase Journey State Machine (P0 -> P1 -> P2 with SPA Cart & Checkout Verification)
8. Comprehensive Crawler Diagnostics Generation
"""

from __future__ import annotations
import time
import base64
from typing import Optional

from schemas import (
    ScanResult, ScanMode, ScanStatus, AuditLogEntry, TargetMetadata,
    PriceStage, PriceComponent, AccessStatus, AccessDiagnostics,
    PlatformType, PageType, SiteProfile, CrawlerDiagnostics,
    PriceCandidate, DarkPatternAssessmentStatus, ActionPolicyTier
)
from detection_engine import (
    analyze_page, assess_price_journey, compute_risk_assessment,
    compute_scan_coverage, compute_transparency_score
)
from price_extractor import extract_price_and_components
from extraction.jsonld import extract_jsonld_candidates
from extraction.hydration import HydrationExtractor
from extraction.product import ProductIdentityExtractor
from extraction.ensemble import PriceEnsemble
from adapters import resolve_platform_adapter
from .access_classifier import AccessClassifier
from .action_discovery import ActionDiscovery
from .http_client import HttpAcquisitionClient
from .browser import BrowserSession
from .state_machine import PurchaseStateMachine, PurchaseJourneyState


def format_ts() -> str:
    return time.strftime("%H:%M:%S")


class AcquisitionOrchestrator:
    def __init__(self):
        self.access_classifier = AccessClassifier()
        self.http_client = HttpAcquisitionClient()
        self.hydration_extractor = HydrationExtractor()
        self.product_extractor = ProductIdentityExtractor()
        self.price_ensemble = PriceEnsemble()
        self.action_discovery = ActionDiscovery()

    async def execute_audit(self, scan_id: str, url: str) -> ScanResult:
        logs: list[AuditLogEntry] = [
            AuditLogEntry(timestamp=format_ts(), stage="INITIALIZE", message=f"Starting Multi-Strategy Acquisition Ladder v3 for: {url}")
        ]

        start_time = time.time()
        target_meta = TargetMetadata(final_url=url)
        state_machine = PurchaseStateMachine()
        price_stages: list[PriceStage] = []
        all_findings = []
        stages_scanned = ["product"]

        # Track diagnostic metrics
        actions_examined = 0
        actions_rejected = 0
        last_successful_action = None
        failure_stage = None
        failure_reason = None
        all_candidates: list[PriceCandidate] = []

        # ─── STEP 1: URL Normalization & Page-Type Profiling ─────────────────
        page_type = self.access_classifier.classify_page_type(url)
        logs.append(AuditLogEntry(
            timestamp=format_ts(),
            stage="URL_PROFILED",
            message=f"URL analyzed: Page Type = {page_type.value.upper()}"
        ))

        if page_type == PageType.HOMEPAGE:
            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="HOMEPAGE_WARNING",
                message="Target URL is an e-commerce homepage, not a specific product. Purchase journey evaluation requires a specific product URL."
            ))

        # ─── STEP 2: Level 1 Lightweight HTTP Acquisition ─────────────────────
        logs.append(AuditLogEntry(
            timestamp=format_ts(),
            stage="HTTP_ACQUISITION",
            message="Executing Level 1 HTTP acquisition to inspect headers, redirects, and structured data..."
        ))

        http_result = await self.http_client.fetch(url)
        target_meta.http_status = http_result.status_code
        target_meta.final_url = http_result.final_url

        # Check if Level 1 HTTP encountered anti-bot mitigation or restriction
        if http_result.access_status in (AccessStatus.BOT_CHALLENGE, AccessStatus.CAPTCHA_PRESENT, AccessStatus.FORBIDDEN, AccessStatus.RATE_LIMITED):
            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="HTTP_CHALLENGED",
                message=f"Level 1 HTTP returned {http_result.access_status.value} ({http_result.access_reason}). Escalating to Level 2 Chromium Browser..."
            ))
        else:
            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="HTTP_ACQUISITION_OK",
                message=f"Level 1 HTTP successful (Status {http_result.status_code})."
            ))

        # ─── STEP 3: Level 2 Browser Acquisition (Playwright) ────────────────
        logs.append(AuditLogEntry(
            timestamp=format_ts(),
            stage="BROWSER_ACQUISITION",
            message="Launching Chromium browser with network JSON interceptor & state-based settling..."
        ))

        browser = BrowserSession()
        screenshot_b64: Optional[str] = None
        html_p0 = ""
        text_p0 = ""

        try:
            page = await browser.start()
            browser_status, html_p0, text_p0 = await browser.navigate_with_state_wait(url, timeout=30000)
            target_meta.title = await page.title() or http_result.product_title or "Target Product"
            target_meta.final_url = page.url
            target_meta.latency_ms = round((time.time() - start_time) * 1000, 1)

            screenshot_b64 = await browser.capture_screenshot()
            target_meta.screenshot_captured = bool(screenshot_b64)

            # Evidence Fusion fallback: if browser returned empty/error, fallback to http_result
            if not html_p0 or len(html_p0) < 500 or browser_status != 200:
                if http_result.html and len(http_result.html) > len(html_p0):
                    html_p0 = http_result.html
                    text_p0 = http_result.text
                    target_meta.title = http_result.product_title or target_meta.title

            # Check rendered page for bot challenges / CAPTCHA
            access_status, access_reason = self.access_classifier.classify_access(browser_status, html_p0, text_p0)
            if access_status in (AccessStatus.BOT_CHALLENGE, AccessStatus.CAPTCHA_PRESENT, AccessStatus.NETWORK_ERROR, AccessStatus.FORBIDDEN):
                logs.append(AuditLogEntry(
                    timestamp=format_ts(),
                    stage="ACCESS_RESTRICTED",
                    message=f"Access restriction identified: {access_status.value} ({access_reason})"
                ))

            # ─── STEP 4: Platform Profiling & Adapter Resolution ─────────────
            adapter = resolve_platform_adapter(html_p0, page.url)
            site_profile = SiteProfile(
                platform=adapter.platform_type,
                page_type=page_type,
                rendering="client_hydrated",
                currency="INR",
                access=access_status,
                cart_model="drawer" if adapter.platform_type == PlatformType.SHOPIFY else "redirect",
                checkout_model="redirect"
            )

            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="PLATFORM_IDENTIFIED",
                message=f"Platform profile: {adapter.platform_type.value.upper()} | Cart Model: {site_profile.cart_model}"
            ))

            # ─── STEP 5: Multi-Source Price Ensemble for Stage 1 (Product) ───
            # 1. JSON-LD candidates (Browser DOM + Level 1 HTTP)
            jsonld_cands, p_title = extract_jsonld_candidates(html_p0, target_stage="product")
            all_candidates.extend(jsonld_cands)
            all_candidates.extend(http_result.jsonld_candidates)

            # 2. Hydration candidates (Browser DOM + Level 1 HTTP)
            hyd_cands = self.hydration_extractor.extract(html_p0, target_stage="product")
            all_candidates.extend(hyd_cands)
            all_candidates.extend(http_result.hydration_candidates)

            # 3. Meta tag candidates (OpenGraph / itemprop from Level 1 HTTP)
            all_candidates.extend(http_result.meta_candidates)

            # 4. Network JSON candidates (from Playwright response capture)
            net_cands = browser.get_network_candidates()
            all_candidates.extend(net_cands)

            # 5. Platform Adapter candidates
            adapter_cands = adapter.extract_candidates(html_p0, page.url, stage="product")
            all_candidates.extend(adapter_cands)

            # 6. DOM Regex fallback candidates
            p0_dom, c0_dom, meta0_dom = extract_price_and_components(html_p0, text_p0, stage="product")
            if p0_dom:
                conf_float = 0.95 if str(meta0_dom.confidence).upper() == "HIGH" else (0.80 if str(meta0_dom.confidence).upper() == "MEDIUM" else 0.65)
                all_candidates.append(PriceCandidate(
                    amount=p0_dom,
                    currency="INR",
                    source="dom",
                    confidence=conf_float,
                    stage="product",
                    semantic_label="DOM Regex Extracted Price",
                    is_mrp=False
                ))

            # Rank ensemble
            p0, p0_source, p0_conf, valid_cands, has_conflict = self.price_ensemble.rank_and_select(
                all_candidates,
                target_stage="product",
                fallback_price=p0_dom,
                fallback_source=meta0_dom.source
            )

            p0_captured = p0 is not None and p0 > 0.0

            if p0_captured:
                state_machine.transition_to(
                    PurchaseJourneyState.PRODUCT_CAPTURED,
                    stage="product",
                    verified=True,
                    price_observed=p0,
                    reason=f"P0 verified via {p0_source} (Confidence: {p0_conf:.2f})"
                )
                last_successful_action = f"[STAGE_1_CAPTURED] Product loaded: Advertised Price P0: ₹{p0:,.0f} [{p0_source}]"
                msg = f"Stage 1 Product Captured: Advertised Price P0: ₹{p0:,.0f} [Source: {p0_source}, Confidence: {p0_conf:.2f}]"
                if has_conflict:
                    msg += " (Note: Cross-source price conflict resolved by priority)"
            else:
                if access_status != AccessStatus.ACCESS_OK:
                    failure_stage = "access"
                    failure_reason = f"Access restricted: {access_status.value} ({access_reason})"
                    last_successful_action = f"[ACCESS_RESTRICTED] {access_status.value}: {access_reason}"
                    msg = f"Stage 1 Product Access Blocked: {access_status.value} ({access_reason})"
                else:
                    last_successful_action = "[STAGE_1_CAPTURED] Product loaded: Advertised Price P0: UNKNOWN"
                    msg = "Stage 1 Product Loaded: Advertised Price P0: UNKNOWN (No valid price candidate captured)"

            logs.append(AuditLogEntry(timestamp=format_ts(), stage="STAGE_1_CAPTURED", message=msg))

            stage_conf_tier = "HIGH" if p0_conf >= 0.85 else ("MEDIUM" if p0_conf >= 0.50 else "LOW")
            price_stages.append(PriceStage(
                stage="product",
                stage_label="1. Product Listing",
                total=p0,
                is_captured=p0_captured,
                currency="INR",
                components=c0_dom,
                url=page.url,
                screenshot_b64=screenshot_b64,
                extraction_source=p0_source,
                extraction_confidence=stage_conf_tier
            ))


            # Analyze Product Page for Dark Patterns
            f_stage1, _ = analyze_page(page.url, html_p0, text_p0)
            all_findings.extend(f_stage1)

            # ─── STEP 6: Interactive Action Discovery & Cart Transition ──────
            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="ACTION_SCAN",
                message="Discovering interactive purchase action candidates using platform selectors & scoring..."
            ))

            candidate_data = await page.evaluate("""() => {
                const list = [];
                const els = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]');
                els.forEach((el, index) => {
                    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
                    if (!text || text.length > 80) return;
                    const form = el.closest('form');
                    const formAction = form ? (form.getAttribute('action') || '') : '';
                    const formInputs = form ? Array.from(form.querySelectorAll('input, select, textarea')).map(i => i.name || i.type || '') : [];
                    const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                    if (!isVisible) return;
                    
                    list.push({
                        index: index,
                        text: text,
                        tag: el.tagName.toLowerCase(),
                        href: el.getAttribute('href') || '',
                        type: el.getAttribute('type') || '',
                        form_action: formAction,
                        form_inputs: formInputs,
                        id: el.id || '',
                        className: el.className || ''
                    });
                });
                return list;
            }""")

            actions_examined = len(candidate_data)
            ranked_cart_actions = self.action_discovery.rank_add_to_cart_candidates(candidate_data)
            actions_rejected = actions_examined - len(ranked_cart_actions)

            cart_target = ranked_cart_actions[0] if ranked_cart_actions else None

            if cart_target:
                c_data, c_dec, c_score = cart_target
                logs.append(AuditLogEntry(
                    timestamp=format_ts(),
                    stage="ACTION_POLICY_APPROVE",
                    message=f"Executing Add to Cart CTA: '{c_dec.text}' (Score: {c_score:.0f}, Tier: {c_dec.action_tier})"
                ))

                try:
                    # Click element
                    if c_data.get("id"):
                        btn = await page.query_selector(f"#{c_data['id']}")
                    else:
                        btn = await page.query_selector(f"button:has-text('{c_dec.text}'), a:has-text('{c_dec.text}'), input[value='{c_dec.text}']")

                    url_before_cart = page.url
                    if btn:
                        # Use expect_navigation to handle full-page redirects (window.location.href)
                        # as well as SPA-style navigation (no redirect).
                        try:
                            async with page.expect_navigation(timeout=8000, wait_until="domcontentloaded"):
                                await btn.click(timeout=8000)
                        except Exception:
                            # No full-page navigation occurred (SPA drawer / modal)
                            pass
                    else:
                        await page.keyboard.press("Enter")

                    # Settle dynamic SPA drawer / network / JS
                    await page.wait_for_timeout(2500)

                    cart_url = page.url
                    html_p1 = await page.content()
                    text_p1 = await page.evaluate("() => document.body.innerText")

                    # ─── STEP 7: Verify Cart State (SPA Drawer / Modal / URL) ──
                    is_cart_confirmed, cart_score, observed_subtotal = adapter.verify_cart_state(html_p1, cart_url, text_p1)

                    if is_cart_confirmed:
                        stages_scanned.append("cart")
                        p1_dom, c1_dom, meta1_dom = extract_price_and_components(html_p1, text_p1, stage="cart")
                        p1 = observed_subtotal or p1_dom
                        p1_captured = p1 is not None and p1 > 0.0

                        state_machine.transition_to(
                            PurchaseJourneyState.CART_CAPTURED,
                            stage="cart",
                            verified=True,
                            price_observed=p1,
                            reason=f"Cart review confirmed (Score: {cart_score:.0f})"
                        )

                        last_successful_action = f"[STAGE_2_CAPTURED] Cart confirmed: P1: ₹{p1:,.0f}" if p1_captured else "[STAGE_2_CAPTURED] Cart confirmed: P1: UNKNOWN"

                        price_stages.append(PriceStage(
                            stage="cart",
                            stage_label="2. Cart Review",
                            total=p1,
                            is_captured=p1_captured,
                            currency="INR",
                            components=c1_dom,
                            url=cart_url,
                            extraction_source="adapter" if observed_subtotal else meta1_dom.source,
                            extraction_confidence="HIGH" if observed_subtotal else str(meta1_dom.confidence)
                        ))


                        logs.append(AuditLogEntry(
                            timestamp=format_ts(),
                            stage="STAGE_2_CAPTURED",
                            message=f"Cart state verified (Score: {cart_score:.0f}) | Cart Price P1: ₹{p1:,.0f}" if p1_captured else f"Cart state verified (Score: {cart_score:.0f}) | Cart Price P1: UNKNOWN"
                        ))

                        f_stage2, _ = analyze_page(cart_url, html_p1, text_p1)
                        all_findings.extend(f_stage2)

                        # ─── STEP 8: Proceed to Checkout Transition ───────────
                        co_candidates = await page.evaluate("""() => {
                            const list = [];
                            const els = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]');
                            els.forEach((el, index) => {
                                const text = (el.innerText || el.value || '').trim();
                                if (!text || text.length > 80) return;
                                const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                                if (!isVisible) return;
                                list.push({
                                    text: text,
                                    tag: el.tagName.toLowerCase(),
                                    id: el.id || '',
                                    href: el.getAttribute('href') || '',
                                    form_action: el.closest('form') ? (el.closest('form').getAttribute('action') || '') : '',
                                    surrounding: el.parentElement ? (el.parentElement.innerText || '').slice(0, 150) : ''
                                });
                            });
                            return list;
                        }""")

                        ranked_co_actions = self.action_discovery.rank_checkout_candidates(co_candidates)
                        co_target = ranked_co_actions[0] if ranked_co_actions else None

                        if co_target:
                            t_cand, t_dec, t_score = co_target
                            logs.append(AuditLogEntry(
                                timestamp=format_ts(),
                                stage="ACTION_CLICK",
                                message=f"Navigating to Checkout via '{t_dec.text}' (Score: {t_score:.0f})..."
                            ))

                            if t_cand.get("id"):
                                co_btn = await page.query_selector(f"#{t_cand['id']}")
                            else:
                                co_btn = await page.query_selector(f"button:has-text('{t_dec.text}'), a:has-text('{t_dec.text}')")

                            if co_btn:
                                # Use expect_navigation to handle full-page redirects and SPA transitions
                                try:
                                    async with page.expect_navigation(timeout=8000, wait_until="domcontentloaded"):
                                        await co_btn.click(timeout=8000)
                                except Exception:
                                    # No full-page navigation (SPA/modal checkout)
                                    pass
                            else:
                                await page.keyboard.press("Enter")

                            # Settle dynamic JS and network
                            await page.wait_for_timeout(2500)

                            co_url = page.url
                            html_p2 = await page.content()
                            text_p2 = await page.evaluate("() => document.body.innerText")

                            # ─── STEP 9: Verify Checkout State ────────────────
                            is_co_confirmed, co_score, observed_total = adapter.verify_checkout_state(html_p2, co_url, text_p2)

                            if is_co_confirmed:
                                stages_scanned.append("checkout")
                                p2_dom, c2_dom, meta2_dom = extract_price_and_components(html_p2, text_p2, stage="checkout")
                                p2 = observed_total or p2_dom
                                p2_captured = p2 is not None and p2 > 0.0

                                state_machine.transition_to(
                                    PurchaseJourneyState.CHECKOUT_CAPTURED,
                                    stage="checkout",
                                    verified=True,
                                    price_observed=p2,
                                    reason=f"Checkout review confirmed (Score: {co_score:.0f})"
                                )

                                last_successful_action = f"[STAGE_3_CAPTURED] Checkout review confirmed: P2: ₹{p2:,.0f}" if p2_captured else "[STAGE_3_CAPTURED] Checkout confirmed: P2: UNKNOWN"

                                price_stages.append(PriceStage(
                                    stage="checkout",
                                    stage_label="3. Checkout Review",
                                    total=p2,
                                    is_captured=p2_captured,
                                    currency="INR",
                                    components=c2_dom,
                                    url=co_url,
                                    extraction_source="adapter" if observed_total else meta2_dom.source,
                                    extraction_confidence="HIGH" if observed_total else str(meta2_dom.confidence)
                                ))


                                logs.append(AuditLogEntry(
                                    timestamp=format_ts(),
                                    stage="STAGE_3_CAPTURED",
                                    message=f"Checkout review confirmed (Score: {co_score:.0f}) | Final Observed Price P2: ₹{p2:,.0f}" if p2_captured else f"Checkout review confirmed (Score: {co_score:.0f}) | Final Observed Price P2: UNKNOWN"
                                ))

                                f_stage3, _ = analyze_page(co_url, html_p2, text_p2)
                                all_findings.extend(f_stage3)
                            else:
                                failure_stage = "checkout"
                                failure_reason = f"Checkout state could not be verified after clicking '{t_dec.text}'."
                                state_machine.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="checkout", verified=False, reason=failure_reason)
                                logs.append(AuditLogEntry(timestamp=format_ts(), stage="STATE_TRANSITION_FAILED", message=failure_reason))

                        else:
                            failure_stage = "checkout"
                            failure_reason = "No validated checkout CTA identified in cart state. Halting before unverified navigation."
                            state_machine.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="checkout", verified=False, reason=failure_reason)
                            logs.append(AuditLogEntry(timestamp=format_ts(), stage="ACTION_NOTICE", message=failure_reason))

                    else:
                        failure_stage = "cart"
                        failure_reason = "Cart state could not be verified after Add to Cart action. Purchase journey stopped at listing stage."
                        state_machine.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="cart", verified=False, reason=failure_reason)
                        logs.append(AuditLogEntry(timestamp=format_ts(), stage="STATE_TRANSITION_FAILED", message=failure_reason))

                except Exception as click_err:
                    failure_stage = "action"
                    failure_reason = f"Action interaction exception: {str(click_err)[:100]}"
                    state_machine.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="action", verified=False, reason=failure_reason)
                    logs.append(AuditLogEntry(timestamp=format_ts(), stage="ACTION_NOTICE", message=failure_reason))

            else:
                failure_stage = "cart"
                failure_reason = "Single-page audit completed (no safe action candidate identified without payment commitment)."
                state_machine.transition_to(PurchaseJourneyState.FAILED_INCONCLUSIVE, stage="cart", verified=False, reason=failure_reason)
                logs.append(AuditLogEntry(timestamp=format_ts(), stage="CRAWL_BOUNDARY", message=failure_reason))

        finally:
            await browser.close()

        # ─── STEP 10: Price Journey & Compliance Assessment ───────────────────
        price_journey, journey_findings = assess_price_journey(price_stages, stages_scanned)
        all_findings.extend(journey_findings)

        # Deduplicate findings
        deduped = []
        seen = set()
        for f in all_findings:
            k = f"{f.pattern}-{f.title}"
            if k not in seen:
                seen.add(k)
                deduped.append(f)

        risk_assessment = compute_risk_assessment(deduped, stages_scanned=stages_scanned, checks_performed=14)
        scan_coverage = compute_scan_coverage(stages_scanned, deduped)
        transparency_score = compute_transparency_score(deduped)

        findings_by_pattern = {}
        for f in deduped:
            findings_by_pattern[f.pattern.value] = findings_by_pattern.get(f.pattern.value, 0) + 1

        # Build comprehensive Diagnostics
        access_diag = AccessDiagnostics(
            status=access_status,
            initial_http_status=target_meta.http_status,
            browser_status="OK" if access_status == AccessStatus.ACCESS_OK else access_status.value,
            redirect_chain=http_result.redirect_chain or [url],
            block_reason=access_reason
        )

        crawler_diag = CrawlerDiagnostics(
            initial_http_status=target_meta.http_status,
            redirect_chain=http_result.redirect_chain or [url],
            browser_status="OK" if access_status == AccessStatus.ACCESS_OK else access_status.value,
            platform=site_profile.platform.value,
            page_type=page_type.value,
            product_state="CAPTURED" if state_machine.product_reached else ("BLOCKED" if access_status != AccessStatus.ACCESS_OK else "NOT_CAPTURED"),
            cart_state="CAPTURED" if state_machine.cart_reached else "NOT_REACHED",
            checkout_state="CAPTURED" if state_machine.checkout_reached else "NOT_REACHED",
            p0=state_machine.p0,
            p1=state_machine.p1,
            p2=state_machine.p2,
            price_source=p0_source,
            price_confidence=p0_conf,
            candidate_count=len(all_candidates),
            actions_examined=actions_examined,
            actions_rejected=actions_rejected,
            last_successful_action=last_successful_action,
            failure_stage=failure_stage,
            failure_reason=failure_reason
        )

        if access_status != AccessStatus.ACCESS_OK or not state_machine.product_reached:
            from schemas import RiskAssessment, DarkPatternAssessmentStatus, TransparencyScore, TransparencyDimensions
            deduped = []
            findings_by_pattern = {}
            risk_assessment = RiskAssessment(
                risk_level="UNDETERMINED",
                risk_score=0,
                checks_performed=14,
                signals_found=0,
                coverage_sufficient=False,
                summary=f"Website state: {access_status.value}. {access_reason or 'No valid product verified.'} Price analysis: Not evaluated."
            )
            price_journey.dark_pattern_assessment = DarkPatternAssessmentStatus.INCONCLUSIVE
            transparency_score = TransparencyScore(
                total=0,
                dimensions=TransparencyDimensions(
                    price_transparency=0,
                    choice_neutrality=0,
                    consent_clarity=0,
                    urgency_signals=0,
                    flow_transparency=0
                ),
                deductions=[],
                disclaimer="Page could not be evaluated: product was not captured."
            )
            if not state_machine.product_reached:
                scan_coverage.coverage_score = 0

        logs.append(AuditLogEntry(
            timestamp=format_ts(),
            stage="COMPLETED",
            message=f"Audit complete. Risk: {risk_assessment.risk_level} | Assessment: {price_journey.dark_pattern_assessment.value if hasattr(price_journey.dark_pattern_assessment, 'value') else price_journey.dark_pattern_assessment} | Coverage: {scan_coverage.coverage_score}%"
        ))

        return ScanResult(
            scan_id=scan_id,
            url=url,
            mode=ScanMode.URL_AUDIT,
            status=ScanStatus.DONE,
            started_at=start_time,
            completed_at=time.time(),
            pages_analyzed=len(stages_scanned),
            interaction_states=len(price_stages),
            findings=deduped,
            risk_assessment=risk_assessment,
            scan_coverage=scan_coverage,
            price_journey=price_journey,
            transparency_score=transparency_score,
            findings_by_pattern=findings_by_pattern,
            site_profile=site_profile,
            access_diagnostics=access_diag,
            crawler_diagnostics=crawler_diag,
            screenshot_base64=screenshot_b64,
            audit_logs=logs,
            target_metadata=target_meta
        )
