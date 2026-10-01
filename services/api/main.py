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
import sys
import base64
import time
import uuid
import re
import ipaddress
import socket
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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
    PatternCoverageItem, PriceComponent, PriceStage, ActionPolicyTier,
    ScanSummary,
)
from detection_engine import (
    analyze_page, compute_transparency_score, extract_prices_from_text,
    classify_page_state, PATTERN_META,
    compute_risk_assessment, compute_scan_coverage, extract_price_components,
    assess_price_journey, classify_action_element, score_checkout_action,
    NAVIGATION_NOISE_REGEX,
)
from price_extractor import extract_price_and_components


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


from crawler.orchestrator import AcquisitionOrchestrator


async def execute_live_scan(scan_id: str, url: str) -> None:
    """
    Executes Crawler v3 Multi-Strategy Acquisition Ladder:
    HTTP -> Playwright -> Network Response Capture -> JSON-LD / Hydration -> Platform Adapters -> State Machine
    """
    scan = scan_store.get(scan_id)
    if not scan:
        return

    scan_store[scan_id] = scan.model_copy(update={
        "status": ScanStatus.RUNNING,
        "audit_logs": [
            AuditLogEntry(timestamp=format_ts(), stage="INITIALIZE", message=f"Starting Crawler v3 Multi-Strategy audit for: {url}")
        ]
    })

    orchestrator = AcquisitionOrchestrator()
    try:
        result = await orchestrator.execute_audit(scan_id, url)
        scan_store[scan_id] = result
    except Exception as e:
        print(f"[DarkShield Crawler Error]: {e}")
        scan_store[scan_id] = ScanResult(
            scan_id=scan_id,
            url=url,
            mode=ScanMode.URL_AUDIT,
            status=ScanStatus.DONE,
            started_at=scan.started_at,
            completed_at=time.time(),
            pages_analyzed=0,
            findings=[],
            risk_assessment=RiskAssessment(
                risk_level="UNDETERMINED",
                summary=f"Audit stopped due to unexpected crawler exception: {str(e)[:120]}"
            ),
            scan_coverage=ScanCoverage(stages_scanned=[], coverage_score=0),
            audit_logs=[
                AuditLogEntry(timestamp=format_ts(), stage="ERROR", message=f"Fatal exception: {str(e)[:120]}")
            ],
            error=str(e)
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


@app.get("/api/scans", response_model=list[ScanSummary])
async def list_recent_scans():
    results = []
    for s in sorted(scan_store.values(), key=lambda x: x.started_at, reverse=True):
        hostname = "example.com"
        try:
            hostname = urlparse(s.url).hostname or s.url
        except Exception:
            hostname = s.url
        display_name = s.target_metadata.title if (s.target_metadata and s.target_metadata.title) else hostname
        results.append(ScanSummary(
            scan_id=s.scan_id,
            url=s.url,
            status=s.status,
            started_at=s.started_at,
            completed_at=s.completed_at,
            risk_level=s.risk_assessment.risk_level if s.risk_assessment else "UNDETERMINED",
            findings_count=len(s.findings),
            checkout_reached=s.scan_coverage.checkout_reached if s.scan_coverage else False,
            summary=s.risk_assessment.summary if s.risk_assessment else "Scan queued",
            display_name=display_name,
        ))
    return results



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
