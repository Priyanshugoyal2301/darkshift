import asyncio
import time
import uuid
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from pydantic import BaseModel
from typing import List, Optional, Any

from crawler.http_client import HttpAcquisitionClient
from crawler.browser import BrowserSession
from detection_engine import analyze_page
from audit_llm import generate_audit_report
from schemas import ScanStatus, Finding

# In-memory store for full audits
full_audit_store = {}

class FullAuditState(BaseModel):
    audit_id: str
    url: str
    status: str
    started_at: float
    completed_at: Optional[float] = None
    pages_discovered: int = 0
    pages_analyzed: int = 0
    findings: List[Finding] = []
    current_url: str = ""
    report: Optional[Any] = None
    error: Optional[str] = None

async def execute_full_audit(audit_id: str, start_url: str):
    state = full_audit_store.get(audit_id)
    if not state:
        return
        
    state.status = ScanStatus.RUNNING
    
    parsed_base = urlparse(start_url)
    domain = parsed_base.netloc
    
    to_visit = [start_url]
    visited = set()
    MAX_PAGES = 8  # Keep it small for timely demo results
    
    client = HttpAcquisitionClient()
    browser = BrowserSession()
    
    try:
        page = await browser.start()
        
        while to_visit and len(visited) < MAX_PAGES:
            current_url = to_visit.pop(0)
            if current_url in visited:
                continue
                
            visited.add(current_url)
            state.current_url = current_url
            state.pages_discovered = len(visited) + len(to_visit)
            
            try:
                # 1. Fetch page using Playwright for JS execution
                browser_status, html, text = await browser.navigate_with_state_wait(current_url, timeout=15000)
                if not html or browser_status != 200:
                    continue
                
                state.pages_analyzed += 1
                
                # 2. Extract links (BFS)
                soup = BeautifulSoup(html, 'lxml')
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    next_url = urljoin(current_url, href)
                    parsed_next = urlparse(next_url)
                    if parsed_next.netloc == domain and next_url not in visited and next_url not in to_visit:
                        to_visit.append(next_url)
                
                state.pages_discovered = len(visited) + len(to_visit)
                
                # 3. Analyze page
                page_findings, _ = analyze_page(current_url, html, text)
                
                # Decorate findings with target_url so we know where they came from
                for f in page_findings:
                    f.url = current_url
                    
                state.findings.extend(page_findings)
                
            except Exception as e:
                print(f"Error crawling {current_url}: {e}")
                continue
                
        await browser.close()
                
        # Audit finished, generate report
        state.status = "REPORT_READY"
        state.completed_at = time.time()
        state.current_url = ""
        
        # Call LLM
        state.report = generate_audit_report(start_url, state.findings, state.pages_discovered, state.pages_analyzed)
        state.status = ScanStatus.DONE
        
    except Exception as e:
        state.status = ScanStatus.ERROR
        state.error = str(e)
        print(f"Full audit failed: {e}")
        try:
            await browser.close()
        except:
            pass
