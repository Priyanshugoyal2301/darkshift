"""
DarkShield — Crawler: Access Classification & Page-Type Profiler
Classifies anti-automation, bot challenges, paywalls, and page lifecycle states.
"""

from __future__ import annotations
import re
from urllib.parse import urlparse
from typing import Optional
from schemas import AccessStatus, PageType


BOT_SIGNALS = [
    "please verify you are a human",
    "checking your browser before accessing",
    "attention required! | cloudflare",
    "security verification",
    "cf-chl-bypass",
    "cf-turnstile-wrapper",
    "unusual traffic from your computer network",
    "press & hold to confirm you are a human",
    "robot check",
    "validate your identity",
]

CAPTCHA_SIGNALS = [
    "g-recaptcha",
    "h-captcha",
    "cf-turnstile",
    "captcha-delivery",
    "captcha_box",
]


class AccessClassifier:
    def classify_access(
        self,
        http_status: Optional[int],
        html: str,
        visible_text: str,
        error_message: Optional[str] = None
    ) -> tuple[AccessStatus, Optional[str]]:
        """
        Determines the access status and exact cause.
        """
        if error_message:
            lower_err = error_message.lower()
            if "timeout" in lower_err:
                return AccessStatus.TIMEOUT, f"Page load timed out: {error_message[:120]}"
            return AccessStatus.NETWORK_ERROR, f"Network connection failed: {error_message[:120]}"

        if (http_status is None or http_status == 0) and not html:
            return AccessStatus.NETWORK_ERROR, "Target host unreachable or connection refused."

        lower_text = (visible_text + " " + html[:3000]).lower()

        if http_status == 404 or any(nf in lower_text for nf in [
            "page not found", "404 not found", "404 error",
            "looking for something? we're sorry",
            "we couldn't find that page", "product not found",
            "item unavailable", "page doesn't exist"
        ]):
            return AccessStatus.PAGE_NOT_FOUND, "HTTP 404 or Page Not Found — the requested resource does not exist."

        if http_status == 401:
            return AccessStatus.LOGIN_REQUIRED, "HTTP 401 Unauthorized — Authentication required to access product."
        if http_status == 429:
            return AccessStatus.RATE_LIMITED, "HTTP 429 Too Many Requests — Target host rate-limited the scanner."
        if http_status == 403:
            if any(b in lower_text for b in BOT_SIGNALS):
                return AccessStatus.BOT_CHALLENGE, "Anti-automation WAF challenge (HTTP 403) detected."
            return AccessStatus.FORBIDDEN, "HTTP 403 Forbidden — Target server denied access."

        if http_status == 503:
            return AccessStatus.RATE_LIMITED, "HTTP 503 Service Unavailable — Target server throttled or unavailable."

        if http_status and http_status >= 500:
            return AccessStatus.NETWORK_ERROR, f"HTTP {http_status} Server Error — Target server rejected or failed request."

        # If 200 OK and has substantial content (>4000 bytes html and >200 visible text), it is NOT a challenge page
        if http_status == 200 and len(html) > 4000 and len(visible_text) > 200:
            return AccessStatus.ACCESS_OK, None

        # Check for CAPTCHA challenge in thin pages
        if any(c in lower_text for c in CAPTCHA_SIGNALS):
            return AccessStatus.CAPTCHA_PRESENT, "Interactive CAPTCHA verification challenge detected."

        # Check for Bot challenge in thin pages
        if any(b in lower_text for b in BOT_SIGNALS):
            return AccessStatus.BOT_CHALLENGE, "Client-side browser verification / bot mitigation challenge."

        # Check for JS Required barrier
        if "enable javascript" in lower_text and len(visible_text) < 150:
            return AccessStatus.JS_REQUIRED, "Target site mandates JavaScript execution."

        return AccessStatus.ACCESS_OK, None

    def classify_page_type(self, url: str, html: str = "") -> PageType:
        """
        Distinguishes HOMEPAGE vs PRODUCT vs CART vs CHECKOUT vs CATEGORY.
        """
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        lower_path = path.lower()

        # Homepage check
        if not path or path in ("index.html", "home", "default.aspx"):
            return PageType.HOMEPAGE

        # Cart check
        if any(c in lower_path for c in ("cart", "bag", "basket")):
            return PageType.CART

        # Checkout check
        if any(c in lower_path for c in ("checkout", "review", "payment")):
            return PageType.CHECKOUT

        # Search / Category check
        if any(s in lower_path for s in ("search", "category", "collections", "browse", "shop/all")):
            # If path is just /collections/all without a single product
            if not re.search(r"/products?/[^/]+$", lower_path):
                return PageType.CATEGORY

        # Product checks
        product_patterns = [
            r"/p/",
            r"/product/",
            r"/products/",
            r"/dp/",
            r"/gp/product/",
            r"/item/",
            r"/buy/",
            r"/pd/",
        ]
        if any(re.search(pat, lower_path) for pat in product_patterns):
            return PageType.PRODUCT

        # Schema.org product in HTML
        if html and ('itemtype="https://schema.org/Product"' in html or '"@type":"Product"' in html or '"@type": "Product"' in html):
            return PageType.PRODUCT

        # Default heuristic based on path length and structure
        if len(path.split("/")) >= 2:
            return PageType.PRODUCT

        return PageType.UNKNOWN
