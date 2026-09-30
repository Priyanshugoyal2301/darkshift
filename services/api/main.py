"""
DarkShield — FastAPI Compliance & Evidentiary Audit Engine
Production-Grade Automated CCPA 2023 Inspection Platform

Capabilities:
  - Multi-page automated checkout crawler (Product -> Cart -> Checkout)
  - Price component extractor & chronological price journey builder
  - Honest calibrated Risk Assessment & Scan Coverage matrix
  - Headless Chromium crawler (Playwright) with safe action classifier
  - Live viewport screenshot capture & base64 transmission across stages
  - Ground-truth synthetic CCPA test fixtures & historical regression cases
  - 13 CCPA 2023 Guidelines Section 5 deterministic rule engine
"""

from __future__ import annotations
import base64
import time
import uuid
import re
import ipaddress
import socket
import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from playwright.async_api import async_playwright

from schemas import (
    CCPAPattern, Severity, DetectionMethod, PriceState,
    ScanRequest, ScanResponse, ScanResult, ScanStatus, ScanMode,
    AnalyzeRequest, Finding, TransparencyScore, TransparencyDimensions,
    ScoreDeduction, PriceJourney, PricePoint, FeeBreakdown,
    DOMEvidence, VisualProminenceScore, BoundingBox,
    AuditLogEntry, TargetMetadata,
    ConfidenceTier, CoverageStatus, RiskAssessment, ScanCoverage,
    PatternCoverageItem, PriceComponent, PriceStage
)
from detection_engine import (
    analyze_page, compute_transparency_score, extract_prices_from_text,
    classify_page_state, PATTERN_META,
    compute_risk_assessment, compute_scan_coverage, extract_price_components
)


# ─── In-Memory Audit Store ──────────────────────────────────────────────────

scan_store: dict[str, ScanResult] = {}


# ─── SSRF Guard ─────────────────────────────────────────────────────────────

BLOCKED_PATTERNS = [
    re.compile(r'^0\.0\.0\.0'),
    re.compile(r'^169\.254\.'),
    re.compile(r'metadata\.google|169\.254\.169\.254'),
]

PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
]


def validate_url_security(url: str) -> str:
    """Validates URL schemes and guards against SSRF, allowing local fixtures."""
    if "127.0.0.1:8000/fixtures" in url or "localhost:8000/fixtures" in url or url.startswith("benchmark://"):
        return url

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid scheme '{parsed.scheme}'. Only http and https permitted.")

    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("Target hostname cannot be empty.")

    # Block localhost unless specifically calling fixtures
    if hostname.lower() in ("localhost", "127.0.0.1") and "/fixtures" not in url:
        raise ValueError("Direct localhost scanning is restricted.")

    for pattern in BLOCKED_PATTERNS:
        if pattern.search(hostname):
            raise ValueError(f"Target host '{hostname}' is a restricted network address.")

    try:
        resolved_ip = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(resolved_ip)
        for network in PRIVATE_NETWORKS:
            if ip in network:
                raise ValueError(f"Target host resolves to private IP: {resolved_ip}")
    except socket.gaierror:
        pass

    return url


# ─── Official CCPA Benchmark Suites ─────────────────────────────────────────

BENCHMARKS = [
    {
        "id": "aerojet-drip-journey",
        "url": "http://127.0.0.1:8000/fixtures/03-drip-pricing-product.html",
        "name": "AeroJet Multi-Stage Booking Journey",
        "industry": "Travel & Aviation",
        "description": "Interactive 3-stage purchase flow: Product (₹4,890) -> Cart Review (sneaked ₹199 insurance + ₹99 carbon fee) -> Checkout (+₹450 late convenience fee).",
        "finding_count": 3
    },
    {
        "id": "physicswallah-ccpa-case",
        "url": "http://127.0.0.1:8000/fixtures/07-physicswallah-regression.html",
        "name": "PhysicsWallah CCPA Enforcement Case (June 2026)",
        "industry": "EdTech Checkout",
        "description": "Historical regression case: Course checkout with automatically pre-ticked ₹10 student welfare foundation donation.",
        "finding_count": 2
    },
    {
        "id": "spicejet-ccpa-case",
        "url": "http://127.0.0.1:8000/fixtures/08-spicejet-regression.html",
        "name": "SpiceJet CCPA Enforcement Case (July 2026)",
        "industry": "Airlines / Booking",
        "description": "Historical regression case: Pre-ticked SpiceClub enrollment, promotional WhatsApp consent, and seat assignment interface interference.",
        "finding_count": 3
    },
    {
        "id": "lightning-deal-urgency",
        "url": "http://127.0.0.1:8000/fixtures/01-false-urgency.html",
        "name": "Lightning Deal False Urgency",
        "industry": "Electronics Flash Sale",
        "description": "Ungrounded scarcity ('Only 2 left!') and artificial countdown timer resetting on refresh.",
        "finding_count": 2
    },
    {
        "id": "clean-baseline-control",
        "url": "http://127.0.0.1:8000/fixtures/09-benign-clean.html",
        "name": "Compliant E-Commerce Baseline",
        "industry": "Retail E-Commerce",
        "description": "Known-good negative control: Upfront all-inclusive pricing, neutral choice buttons, and affirmative opt-in.",
        "finding_count": 0
    }
]


# ─── Live Crawler & Multi-Stage Journey Engine ──────────────────────────────

def format_ts() -> str:
    return time.strftime("%H:%M:%S")


async def execute_live_scan(scan_id: str, url: str) -> None:
    """
    Executes an automated multi-stage checkout crawl:
    Stage 1: Product page -> Extract initial price P0
    Stage 2: Safe Add to Cart interaction -> Extract cart subtotal & sneaked add-ons P1
    Stage 3: Proceed to Checkout -> Extract final observed payable price P2
    Computes honest RiskAssessment & ScanCoverage.
    """
    scan = scan_store.get(scan_id)
    if not scan:
        return

    logs: list[AuditLogEntry] = [
        AuditLogEntry(timestamp=format_ts(), stage="INITIALIZE", message=f"Starting multi-stage audit for: {url}")
    ]

    scan_store[scan_id] = scan.model_copy(update={
        "status": ScanStatus.RUNNING,
        "audit_logs": logs
    })

    start_time = time.time()
    stages_scanned: list[str] = ["product"]
    price_stages: list[PriceStage] = []
    all_findings: list[Finding] = []
    checkout_reached = False
    screenshot_b64: Optional[str] = None
    target_meta = TargetMetadata(final_url=url)

    try:
        logs.append(AuditLogEntry(timestamp=format_ts(), stage="PLAYWRIGHT", message="Launching Chromium crawler with safe action classifier..."))

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-infobars",
                    "--disable-dev-shm-usage",
                ]
            )

            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1366, "height": 768},
                locale="en-IN",
                timezone_id="Asia/Kolkata",
            )

            page = await context.new_page()
            await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")

            # ── STAGE 1: PRODUCT LISTING ─────────────────────────────────────
            logs.append(AuditLogEntry(timestamp=format_ts(), stage="STAGE_1_PRODUCT", message=f"Navigating to Stage 1 (Product page): {url}"))

            try:
                resp = await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                target_meta.http_status = resp.status if resp else 200
            except Exception as e:
                logs.append(AuditLogEntry(timestamp=format_ts(), stage="NAV_WARNING", message=f"Navigation note: {str(e)[:100]}"))

            # Settle dynamic JS / WAF challenges
            await page.wait_for_timeout(3000)

            title = await page.title()
            final_url = page.url
            target_meta.title = title or "Target Website"
            target_meta.final_url = final_url
            target_meta.latency_ms = round((time.time() - start_time) * 1000, 1)

            # Capture Stage 1 screenshot
            try:
                ss_bytes = await page.screenshot(type="jpeg", quality=55)
                screenshot_b64 = "data:image/jpeg;base64," + base64.b64encode(ss_bytes).decode("utf-8")
                target_meta.screenshot_captured = True
            except Exception:
                pass

            # Extract Stage 1 DOM & text
            html_p0 = await page.content()
            text_p0 = await page.evaluate("() => document.body.innerText")
            p0, c0 = extract_price_components(html_p0, text_p0)

            price_stages.append(PriceStage(
                stage="product",
                stage_label="1. Product Listing",
                total=p0,
                components=c0,
                url=page.url,
                screenshot_b64=screenshot_b64
            ))

            logs.append(AuditLogEntry(
                timestamp=format_ts(),
                stage="STAGE_1_CAPTURED",
                message=f"Product page loaded: '{target_meta.title[:50]}' | Initial Price P0: ₹{p0:,.0f}"
            ))

            # Run detection rules on Product page
            f_stage1, _ = analyze_page(page.url, html_p0, text_p0)
            all_findings.extend(f_stage1)

            # Measure DOM elements
            target_meta.dom_elements_count = await page.evaluate("() => document.querySelectorAll('*').length")
            target_meta.forms_count = await page.evaluate("() => document.forms.length")
            target_meta.inputs_count = await page.evaluate("() => document.querySelectorAll('input').length")

            # ── STAGE 2: SAFE ADD TO CART INTERACTION ────────────────────────
            logs.append(AuditLogEntry(timestamp=format_ts(), stage="SAFE_ACTION", message="Scanning DOM for safe 'Add to Cart' or 'Add to Bag' triggers..."))

            # Safe action classifier: Look for Add to Cart
            add_cart_btn = await page.query_selector(
                "button:has-text('Add to Cart'), button:has-text('Add to Bag'), button:has-text('Add to Basket'), "
                "[id*='add-to-cart'], [id*='book-flight'], [class*='add-to-cart'], input[value*='Add to Cart'], "
                "button:has-text('Book Now'), button:has-text('Enroll')"
            )

            if add_cart_btn:
                logs.append(AuditLogEntry(timestamp=format_ts(), stage="ACTION_CLICK", message="Safe action approved: Clicking 'Add to Cart' / 'Book Now'..."))
                try:
                    await add_cart_btn.click()
                    await page.wait_for_timeout(2500)

                    # Check if reached Cart
                    cart_url = page.url
                    html_p1 = await page.content()
                    text_p1 = await page.evaluate("() => document.body.innerText")
                    p1, c1 = extract_price_components(html_p1, text_p1)

                    if p1 == 0.0 and p0 > 0.0:
                        p1 = p0

                    stages_scanned.append("cart")

                    # Stage 2 screenshot
                    ss_cart = None
                    try:
                        cart_ss_bytes = await page.screenshot(type="jpeg", quality=50)
                        ss_cart = "data:image/jpeg;base64," + base64.b64encode(cart_ss_bytes).decode("utf-8")
                    except Exception:
                        pass

                    price_stages.append(PriceStage(
                        stage="cart",
                        stage_label="2. Cart Review",
                        total=p1,
                        components=c1,
                        url=cart_url,
                        screenshot_b64=ss_cart
                    ))

                    logs.append(AuditLogEntry(
                        timestamp=format_ts(),
                        stage="STAGE_2_CAPTURED",
                        message=f"Cart review reached: P1: ₹{p1:,.0f} (Δ: +₹{p1 - p0:,.0f})"
                    ))

                    # Run detection rules on Cart page
                    f_stage2, _ = analyze_page(cart_url, html_p1, text_p1)
                    all_findings.extend(f_stage2)

                    # ── STAGE 3: PROCEED TO CHECKOUT ─────────────────────────
                    checkout_btn = await page.query_selector(
                        "button:has-text('Proceed to Checkout'), a:has-text('Proceed to Checkout'), "
                        "[id*='proceed-checkout'], [class*='checkout-btn'], button:has-text('Continue Booking')"
                    )

                    if checkout_btn:
                        logs.append(AuditLogEntry(timestamp=format_ts(), stage="ACTION_CLICK", message="Navigating to Checkout Review..."))
                        await checkout_btn.click()
                        await page.wait_for_timeout(2500)

                        co_url = page.url
                        html_p2 = await page.content()
                        text_p2 = await page.evaluate("() => document.body.innerText")

                        # Check if authentication barrier
                        if any(k in text_p2.lower() for k in ["enter password", "sign in with", "otp"]):
                            logs.append(AuditLogEntry(timestamp=format_ts(), stage="CHECKOUT_BARRIER", message="Authentication barrier encountered. Stopped before credential entry."))
                        else:
                            p2, c2 = extract_price_components(html_p2, text_p2)
                            if p2 == 0.0:
                                p2 = p1

                            stages_scanned.append("checkout")
                            checkout_reached = True

                            # Stage 3 screenshot
                            ss_co = None
                            try:
                                co_ss_bytes = await page.screenshot(type="jpeg", quality=50)
                                ss_co = "data:image/jpeg;base64," + base64.b64encode(co_ss_bytes).decode("utf-8")
                            except Exception:
                                pass

                            price_stages.append(PriceStage(
                                stage="checkout",
                                stage_label="3. Checkout Review",
                                total=p2,
                                components=c2,
                                url=co_url,
                                screenshot_b64=ss_co
                            ))

                            logs.append(AuditLogEntry(
                                timestamp=format_ts(),
                                stage="STAGE_3_CAPTURED",
                                message=f"Final checkout observed: P2: ₹{p2:,.0f} (Total Δ: +₹{p2 - p0:,.0f})"
                            ))

                            f_stage3, _ = analyze_page(co_url, html_p2, text_p2)
                            all_findings.extend(f_stage3)

                except Exception as click_e:
                    logs.append(AuditLogEntry(timestamp=format_ts(), stage="ACTION_NOTICE", message=f"Cart interaction notice: {str(click_e)[:80]}"))
            else:
                logs.append(AuditLogEntry(timestamp=format_ts(), stage="CRAWL_BOUNDARY", message="Single-page audit completed (no safe 'Add to Cart' trigger identified)."))

            await browser.close()

        # Deduplicate findings by rule & pattern
        seen_keys = set()
        deduped_findings: list[Finding] = []
        for f in all_findings:
            key = f"{f.pattern}-{f.title}"
            if key not in seen_keys:
                seen_keys.add(key)
                deduped_findings.append(f)

        # Build PriceJourney
        initial_p = price_stages[0].total if price_stages else 0.0
        final_p = price_stages[-1].total if price_stages else initial_p
        delta = max(0.0, final_p - initial_p)
        pct = round((delta / initial_p) * 100, 1) if initial_p > 0 else 0.0

        all_components = []
        for s in price_stages[1:]:
            all_components.extend(s.components)

        is_drip = delta > 0 and len(price_stages) > 1

        # If components don't cover full delta, add the unexplained remainder
        comp_sum = sum(c.amount for c in all_components)
        if delta > comp_sum and delta > 0:
            diff = delta - comp_sum
            all_components.append(PriceComponent(
                component_type="mandatory_fee",
                label="Late Stage Mandatory Price Escalation",
                amount=diff,
                is_mandatory=True,
                disclosed_early=False
            ))

        price_journey = PriceJourney(
            stages=price_stages,
            initial_price=initial_p,
            final_observed_price=final_p,
            delta_total=delta,
            percentage_increase=pct,
            new_charges=all_components,
            is_drip_pricing=is_drip,
            checkout_reached=checkout_reached,
            explanation=(
                f"Initial advertised price was ₹{initial_p:,.0f}. "
                + (f"Final observed payable amount increased by ₹{delta:,.0f} (+{pct}%) across purchase journey." if delta > 0 else "No price inflation observed across evaluated stages.")
            )
        )

        # If Drip Pricing confirmed across multi-stage journey, ensure finding exists
        if is_drip and not any(f.pattern == CCPAPattern.DRIP_PRICING for f in deduped_findings):
            deduped_findings.append(Finding(
                pattern=CCPAPattern.DRIP_PRICING,
                confidence=0.95,
                confidence_tier=ConfidenceTier.HIGH,
                evidence_sources=["PRICE_STATE_DIFF", "STAGE_JOURNEY_AUDIT"],
                severity=Severity.HIGH,
                url=url,
                page_state=PriceState.CHECKOUT,
                ccpa_category=CCPAPattern.DRIP_PRICING,
                ccpa_regulation="CCPA_2023_SEC_5_7",
                title=f"Drip Pricing: ₹{delta:,.0f} (+{pct}%) Added After Initial Listing",
                explanation=f"Initial advertised price of ₹{initial_p:,.0f} increased to ₹{final_p:,.0f} at checkout due to unadvertised mandatory additions.",
                consumer_advice="Inspect every line item before payment. Mandatory convenience or platform fees must be disclosed upfront under CCPA 2023.",
                remediation_hint="Incorporate all mandatory surcharges into initial advertised prices.",
                text_snippets=[f"Initial: ₹{initial_p:,.0f}", f"Checkout: ₹{final_p:,.0f}", f"Delta: +₹{delta:,.0f}"],
                detection_methods=[DetectionMethod.PRICE_JOURNEY]
            ))

        # Honest Risk Assessment & Scan Coverage
        risk_assessment = compute_risk_assessment(deduped_findings, checks_performed=14)
        scan_coverage = compute_scan_coverage(stages_scanned, deduped_findings)
        transparency_score = compute_transparency_score(deduped_findings)

        logs.append(AuditLogEntry(
            timestamp=format_ts(),
            stage="COMPLETED",
            message=f"Audit complete. Risk: {risk_assessment.risk_level} ({risk_assessment.signals_found} signals, {risk_assessment.high_confidence_count} high-confidence). Coverage: {scan_coverage.coverage_score}%."
        ))

        findings_by_pattern: dict[str, int] = {}
        for f in deduped_findings:
            findings_by_pattern[f.pattern.value] = findings_by_pattern.get(f.pattern.value, 0) + 1

        scan_store[scan_id] = ScanResult(
            scan_id=scan_id,
            url=url,
            mode=ScanMode.URL_AUDIT,
            status=ScanStatus.DONE,
            started_at=scan.started_at,
            completed_at=time.time(),
            pages_analyzed=len(stages_scanned),
            interaction_states=len(price_stages),
            findings=deduped_findings,
            risk_assessment=risk_assessment,
            scan_coverage=scan_coverage,
            price_journey=price_journey,
            transparency_score=transparency_score,
            findings_by_pattern=findings_by_pattern,
            screenshot_base64=screenshot_b64,
            audit_logs=logs,
            target_metadata=target_meta
        )

    except Exception as e:
        print(f"[DarkShield Crawler Error]: {e}")
        logs.append(AuditLogEntry(timestamp=format_ts(), stage="ERROR_FALLBACK", message=f"Crawler error: {str(e)[:120]}. Running HTTP fallback..."))

        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(url)
                html = resp.text
                final_url = str(resp.url)

            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text(separator=" ", strip=True)
            findings, _ = analyze_page(final_url, html, text)

            risk_assessment = compute_risk_assessment(findings)
            scan_coverage = compute_scan_coverage(["product"], findings)
            transparency_score = compute_transparency_score(findings)

            scan_store[scan_id] = ScanResult(
                scan_id=scan_id,
                url=url,
                mode=ScanMode.URL_AUDIT,
                status=ScanStatus.DONE,
                started_at=scan.started_at,
                completed_at=time.time(),
                pages_analyzed=1,
                interaction_states=1,
                findings=findings,
                risk_assessment=risk_assessment,
                scan_coverage=scan_coverage,
                transparency_score=transparency_score,
                findings_by_pattern={},
                audit_logs=logs,
                target_metadata=TargetMetadata(
                    title=soup.title.string if soup.title else "Target Site",
                    http_status=resp.status_code,
                    final_url=final_url,
                    latency_ms=round((time.time() - start_time) * 1000, 1),
                    dom_elements_count=len(soup.find_all(True))
                )
            )
        except Exception as fb_e:
            logs.append(AuditLogEntry(timestamp=format_ts(), stage="FATAL_ERROR", message=f"Audit failed: {fb_e}"))
            scan_store[scan_id] = ScanResult(
                scan_id=scan_id,
                url=url,
                mode=ScanMode.URL_AUDIT,
                status=ScanStatus.DONE,
                started_at=scan.started_at,
                completed_at=time.time(),
                pages_analyzed=0,
                findings=[],
                risk_assessment=RiskAssessment(risk_level="LOW", summary="Scan incomplete due to target host inaccessibility."),
                scan_coverage=ScanCoverage(stages_scanned=[]),
                audit_logs=logs,
                error=str(fb_e)
            )


# ─── FastAPI Lifecycle & Setup ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[DarkShield API] CCPA 2023 Multi-Stage Journey Audit Engine Online.")
    yield
    print("[DarkShield API] Engine shutdown complete.")


app = FastAPI(
    title="DarkShield CCPA 2023 Journey Engine",
    description="Multi-Stage E-Commerce Purchase Flow & Evidence Inspector",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local synthetic test fixtures
fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
if os.path.exists(fixtures_dir):
    app.mount("/fixtures", StaticFiles(directory=fixtures_dir), name="fixtures")


# ─── API Routes ──────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "service": "DarkShield Multi-Stage Audit Engine",
        "version": "2.2.0",
        "active_scans": len(scan_store),
        "fixtures_active": os.path.exists(fixtures_dir)
    }


@app.get("/api/benchmarks")
async def list_benchmarks():
    return [
        {
            "id": b["id"],
            "url": b["url"],
            "name": b["name"],
            "industry": b["industry"],
            "description": b["description"],
            "finding_count": b["finding_count"]
        }
        for b in BENCHMARKS
    ]


@app.post("/api/scan", response_model=ScanResponse)
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    try:
        safe_url = validate_url_security(str(request.url).strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    scan_id = uuid.uuid4().hex
    scan = ScanResult(
        scan_id=scan_id,
        url=safe_url,
        mode=ScanMode.URL_AUDIT,
        status=ScanStatus.QUEUED,
        audit_logs=[
            AuditLogEntry(timestamp=format_ts(), stage="QUEUED", message=f"Multi-stage scan queued for {safe_url}")
        ]
    )
    scan_store[scan_id] = scan

    background_tasks.add_task(execute_live_scan, scan_id, safe_url)

    return ScanResponse(
        scan_id=scan_id,
        status=ScanStatus.QUEUED,
        estimated_seconds=8,
    )


@app.get("/api/scan/{scan_id}", response_model=ScanResult)
async def get_scan(scan_id: str):
    scan = scan_store.get(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Audit ID not found in scan store")
    return scan


@app.get("/api/scan/{scan_id}/findings", response_model=list[Finding])
async def get_findings(scan_id: str):
    scan = scan_store.get(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Audit ID not found")
    return scan.findings


@app.post("/api/analyze", response_model=list[Finding])
async def analyze_dom(request: AnalyzeRequest):
    try:
        safe_url = validate_url_security(str(request.url))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    findings, _ = analyze_page(
        url=safe_url,
        html=request.dom,
        visible_text=request.visible_text,
    )
    return findings


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
