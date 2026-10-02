"""
Test DarkShield Extension Integration & Cascaded Analysis Pipeline
"""

import sys
import os
import pytest
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "api"))

from main import app, analyze_extension_page
from schemas import (
    AnalyzeRequest,
    CCPAPattern,
    ExtensionScanResult,
    ScanStatus,
)
from detection_engine import analyze_page, compute_risk_assessment, compute_transparency_score

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "fixtures")


def load_fixture(rel_path: str) -> str:
    path = os.path.join(FIXTURES_DIR, rel_path)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def test_extension_analyze_urgency_fixture():
    async def _run():
        html = load_fixture("false-urgency/urgency_scarcity_01.html")
        soup = BeautifulSoup(html, "lxml")
        visible_text = soup.get_text(separator=" ", strip=True)

        req = AnalyzeRequest(
            url="https://example-shop.com/product/123",
            dom=html,
            visible_text=visible_text,
            title="Urgent Headphones Sale",
        )

        res = await analyze_extension_page(req)
        assert isinstance(res, ExtensionScanResult)
        assert res.status == ScanStatus.DONE
        assert len(res.findings) >= 1
        urgency_findings = [f for f in res.findings if f.pattern == CCPAPattern.FALSE_URGENCY]
        assert len(urgency_findings) >= 1
        assert res.risk_assessment.risk_score > 0
        assert res.scan_id.startswith("ext-")

    import asyncio
    asyncio.run(_run())


def test_extension_analyze_basket_sneaking_fixture():
    async def _run():
        html = load_fixture("basket-sneaking/basket_sneaking_01.html")
        soup = BeautifulSoup(html, "lxml")
        visible_text = soup.get_text(separator=" ", strip=True)

        req = AnalyzeRequest(
            url="https://flight-booking.com/checkout",
            dom=html,
            visible_text=visible_text,
            title="Flight Checkout Review",
        )

        res = await analyze_extension_page(req)
        assert isinstance(res, ExtensionScanResult)
        sneaking_findings = [f for f in res.findings if f.pattern == CCPAPattern.BASKET_SNEAKING]
        assert len(sneaking_findings) >= 1
        assert res.risk_assessment.risk_level in ("HIGH", "MODERATE", "ELEVATED")

    import asyncio
    asyncio.run(_run())


def test_extension_analyze_clean_benign_fixture():
    async def _run():
        path = os.path.join(os.path.dirname(__file__), "..", "services", "api", "fixtures", "09-benign-clean.html")
        with open(path, "r", encoding="utf-8") as f:
            html = f.read()
        soup = BeautifulSoup(html, "lxml")
        visible_text = soup.get_text(separator=" ", strip=True)

        req = AnalyzeRequest(
            url="https://compliant-store.in/products/shirt",
            dom=html,
            visible_text=visible_text,
            title="Compliant Organic Cotton Store",
        )

        res = await analyze_extension_page(req)
        assert isinstance(res, ExtensionScanResult)
        assert res.risk_assessment.risk_level == "LOW"
        assert res.transparency_score.total >= 80

    import asyncio
    asyncio.run(_run())


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_extension_analyze_urgency_fixture())
    asyncio.run(test_extension_analyze_basket_sneaking_fixture())
    asyncio.run(test_extension_analyze_clean_benign_fixture())
    print("All extension integration test cases passed!")
