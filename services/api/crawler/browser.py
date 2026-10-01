"""
DarkShield — Crawler: Level 2 Browser Acquisition
Playwright headless Chromium controller with state-based waiting,
network response capture, and safe element interactions.
"""

from __future__ import annotations
import base64
import time
from typing import Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from schemas import PriceCandidate
from .network_capture import NetworkCapture


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class BrowserSession:
    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.network_capture = NetworkCapture()

    async def start(self) -> Page:
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-infobars",
                "--disable-dev-shm-usage",
            ]
        )
        self.context = await self.browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1366, "height": 768},
            locale="en-IN",
            timezone_id="Asia/Kolkata",
        )
        self.page = await self.context.new_page()
        await self.page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        await self.network_capture.attach_to_page(self.page)
        return self.page

    async def navigate_with_state_wait(self, url: str, timeout: int = 30000) -> tuple[int, str, str]:
        """
        Navigates with state-based settling:
        DOM content loaded -> wait for price or CTA or network settle.
        """
        status = 200
        try:
            resp = await self.page.goto(url, timeout=timeout, wait_until="domcontentloaded")
            status = resp.status if resp else 200
        except Exception:
            pass

        # State-based wait: wait for either a price element, add-to-cart, or 2.5s network settle
        try:
            await self.page.wait_for_selector(
                "button, input[type='submit'], [class*='price'], [id*='price']",
                timeout=4000
            )
        except Exception:
            pass

        # Settle dynamic JS execution
        await self.page.wait_for_timeout(2000)

        html = ""
        text = ""
        try:
            html = await self.page.content()
            text = await self.page.evaluate("() => (document.body ? document.body.innerText : '')")
        except Exception:
            pass

        return status, html, text


    async def capture_screenshot(self) -> Optional[str]:
        try:
            ss_bytes = await self.page.screenshot(type="jpeg", quality=55)
            return "data:image/jpeg;base64," + base64.b64encode(ss_bytes).decode("utf-8")
        except Exception:
            return None

    def get_network_candidates(self) -> list[PriceCandidate]:
        return self.network_capture.get_candidates()

    async def close(self) -> None:
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
        except Exception:
            pass
