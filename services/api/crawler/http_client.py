"""
DarkShield — Crawler: Level 1 Lightweight HTTP Acquisition
Performs rapid HTTP retrieval, redirect tracing, header inspection,
JSON-LD extraction, and initial access classification.
"""

from __future__ import annotations
import httpx
from typing import Optional
from schemas import AccessStatus, AccessDiagnostics, PriceCandidate
from .access_classifier import AccessClassifier
from extraction.jsonld import extract_jsonld_candidates
from extraction.hydration import HydrationExtractor


DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


from bs4 import BeautifulSoup


class HttpAcquisitionResult:
    def __init__(
        self,
        url: str,
        final_url: str,
        status_code: int,
        html: str,
        text: str,
        redirect_chain: list[str],
        access_status: AccessStatus,
        access_reason: Optional[str],
        jsonld_candidates: list[PriceCandidate],
        hydration_candidates: list[PriceCandidate],
        meta_candidates: list[PriceCandidate],
        product_title: Optional[str]
    ):
        self.url = url
        self.final_url = final_url
        self.status_code = status_code
        self.html = html
        self.text = text
        self.redirect_chain = redirect_chain
        self.access_status = access_status
        self.access_reason = access_reason
        self.jsonld_candidates = jsonld_candidates
        self.hydration_candidates = hydration_candidates
        self.meta_candidates = meta_candidates
        self.product_title = product_title


class HttpAcquisitionClient:
    def __init__(self, timeout: float = 12.0):
        self.timeout = timeout
        self.classifier = AccessClassifier()
        self.hydration = HydrationExtractor()

    async def fetch(self, url: str) -> HttpAcquisitionResult:
        redirect_chain: list[str] = [url]
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout,
                follow_redirects=True,
                headers={"User-Agent": DEFAULT_UA, "Accept-Language": "en-IN,en;q=0.9"}
            ) as client:
                resp = await client.get(url)
                
                for r in resp.history:
                    redirect_chain.append(str(r.url))
                final_url = str(resp.url)
                status_code = resp.status_code
                html = resp.text

        except Exception as e:
            acc_status, reason = self.classifier.classify_access(None, "", "", error_message=str(e))
            return HttpAcquisitionResult(
                url=url,
                final_url=url,
                status_code=0,
                html="",
                text="",
                redirect_chain=redirect_chain,
                access_status=acc_status,
                access_reason=reason,
                jsonld_candidates=[],
                hydration_candidates=[],
                meta_candidates=[],
                product_title=None
            )

        # Extract text via BeautifulSoup
        soup = None
        text = ""
        meta_cands: list[PriceCandidate] = []
        product_title = None

        if html:
            try:
                soup = BeautifulSoup(html, "html.parser")
                text = soup.get_text(separator=" ", strip=True)
                
                # Check OpenGraph / Meta price tags
                meta_tags = [
                    ("og:price:amount", "og:price:currency"),
                    ("product:price:amount", "product:price:currency"),
                    ("itemprop:price", "itemprop:priceCurrency"),
                ]
                for prop_name, cur_name in meta_tags:
                    el = soup.find("meta", property=prop_name) or soup.find("meta", attrs={"name": prop_name}) or soup.find("meta", attrs={"itemprop": "price"})
                    if el and el.get("content"):
                        raw_val = el["content"].replace(",", "").strip()
                        try:
                            amt = float(raw_val)
                            if 5.0 <= amt <= 25_000_000.0:
                                meta_cands.append(PriceCandidate(
                                    amount=amt,
                                    currency="INR",
                                    source="meta_tag",
                                    confidence=0.94,
                                    stage="product",
                                    selector=f'meta[{prop_name}]',
                                    semantic_label=f"Meta {prop_name} Tag",
                                    is_mrp=False
                                ))
                                break
                        except ValueError:
                            pass

                # Fallback title from meta tags if not already determined
                og_t = soup.find("meta", property="og:title") or soup.find("title")
                if og_t:
                    product_title = og_t.get("content") if og_t.name == "meta" else og_t.get_text(strip=True)
            except Exception:
                pass

        # Classify access
        acc_status, reason = self.classifier.classify_access(status_code, html, text)

        # Extract structured data
        jsonld_cands, p_title = extract_jsonld_candidates(html, target_stage="product")
        if p_title:
            product_title = p_title
        hyd_cands = self.hydration.extract(html, target_stage="product")

        return HttpAcquisitionResult(
            url=url,
            final_url=final_url,
            status_code=status_code,
            html=html,
            text=text,
            redirect_chain=redirect_chain,
            access_status=acc_status,
            access_reason=reason,
            jsonld_candidates=jsonld_cands,
            hydration_candidates=hyd_cands,
            meta_candidates=meta_cands,
            product_title=product_title
        )

