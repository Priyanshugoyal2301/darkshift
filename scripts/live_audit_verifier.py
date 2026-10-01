"""
DarkShield — Live Site Audit Harness
Runs live audits against real-world ecommerce targets:
- theclubfactory.in
- Amazon.in
- Flipkart
- Myntra

Outputs the required schema:
P0
P1
P2
cart_reached
checkout_reached
price_assessment
journey_coverage
findings
evidence_text
evidence_selector
last_successful_action
failed_action
"""

import sys
import os
import asyncio
import json
import time
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

API_BASE = "http://127.0.0.1:8000"


async def run_target_audit(client: httpx.AsyncClient, target_name: str, target_url: str):
    print(f"\n=======================================================")
    print(f"AUDITING LIVE TARGET: {target_name} ({target_url})")
    print(f"=======================================================")

    try:
        # 1. Trigger scan via API
        resp = await client.post(f"{API_BASE}/api/scan", json={"url": target_url}, timeout=15.0)
        if resp.status_code != 200:
            raise RuntimeError(f"POST /api/scan returned status {resp.status_code}: {resp.text}")

        data = resp.json()
        scan_id = data.get("scan_id")
        print(f"Scan initiated. Scan ID: {scan_id}")

        # 2. Poll until completed or timeout
        poll_start = time.time()
        scan_result = None
        while time.time() - poll_start < 85:
            await asyncio.sleep(2.5)
            poll_resp = await client.get(f"{API_BASE}/api/scan/{scan_id}", timeout=15.0)
            if poll_resp.status_code == 200:
                poll_data = poll_resp.json()
                status = poll_data.get("status")
                logs_count = len(poll_data.get("audit_logs", []))
                print(f"  ... polling [{time.strftime('%H:%M:%S')}] status: {status}, logs: {logs_count}")
                if status in ("done", "failed"):
                    scan_result = poll_data
                    break
            else:
                print(f"  ... poll warning: {poll_resp.status_code}")

        if not scan_result:
            raise TimeoutError(f"Audit timed out after 85s for {target_url}")

        # 3. Extract and verify fields
        journey = scan_result.get("price_journey") or {}
        coverage = scan_result.get("scan_coverage") or {}
        logs = scan_result.get("audit_logs") or []
        findings = scan_result.get("findings") or []

        p0 = journey.get("initial_price")
        p1 = journey.get("cart_price")
        p2 = journey.get("final_observed_price")

        cart_reached = "cart" in coverage.get("stages_scanned", [])
        checkout_reached = bool(journey.get("checkout_reached", False))

        price_assessment = journey.get("dark_pattern_assessment") or "INCONCLUSIVE"
        journey_coverage = f"{coverage.get('coverage_score', 0)}%"

        findings_summary = [f"{f.get('pattern')}: {f.get('title')} ({f.get('confidence_tier')})" for f in findings]

        evidence_texts = []
        evidence_selectors = []
        for f in findings:
            if f.get("text_snippets"):
                evidence_texts.extend(f.get("text_snippets")[:2])
            if f.get("dom_evidence"):
                for ev in f.get("dom_evidence"):
                    if ev.get("selector"):
                        evidence_selectors.append(ev.get("selector"))
                    if ev.get("text_content"):
                        evidence_texts.append(ev.get("text_content")[:80])

        last_successful_action = None
        failed_action = None

        for entry in logs:
            stage = entry.get("stage", "")
            msg = entry.get("message", "")
            if stage in ("ACTION_CLICK", "ACTION_POLICY_APPROVE", "STAGE_1_CAPTURED", "STAGE_2_CAPTURED", "STAGE_3_CAPTURED"):
                last_successful_action = f"[{stage}] {msg}"
            elif stage in ("STATE_TRANSITION_FAILED", "ACTION_NOTICE", "POLICY_BLOCKED", "CRAWL_BOUNDARY", "POLICY_TERMINATION"):
                failed_action = f"[{stage}] {msg}"

        output = {
            "target": target_name,
            "url": target_url,
            "scan_id": scan_id,
            "P0": f"₹{p0:,.0f}" if p0 is not None else "UNKNOWN",
            "P1": f"₹{p1:,.0f}" if p1 is not None else "null",
            "P2": f"₹{p2:,.0f}" if p2 is not None else "null",
            "cart_reached": cart_reached,
            "checkout_reached": checkout_reached,
            "price_assessment": price_assessment,
            "journey_coverage": journey_coverage,
            "findings_count": len(findings),
            "findings": findings_summary,
            "evidence_text": evidence_texts[:3],
            "evidence_selector": evidence_selectors[:3],
            "last_successful_action": last_successful_action or "None",
            "failed_action": failed_action or "None"
        }

        print("\n--- STRUCTURED AUDIT OUTPUT ---")
        print(f"Target:                 {output['target']}")
        print(f"URL:                    {output['url']}")
        print(f"P0:                     {output['P0']}")
        print(f"P1:                     {output['P1']}")
        print(f"P2:                     {output['P2']}")
        print(f"cart_reached:           {output['cart_reached']}")
        print(f"checkout_reached:       {output['checkout_reached']}")
        print(f"price_assessment:       {output['price_assessment']}")
        print(f"journey_coverage:       {output['journey_coverage']}")
        print(f"findings:               {output['findings']}")
        print(f"evidence_text:          {output['evidence_text']}")
        print(f"evidence_selector:      {output['evidence_selector']}")
        print(f"last_successful_action: {output['last_successful_action']}")
        print(f"failed_action:          {output['failed_action']}")
        print("-------------------------------\n")

        return output

    except Exception as e:
        print(f"ERROR during audit of {target_name}: {e}")
        return {
            "target": target_name,
            "url": target_url,
            "P0": "UNKNOWN",
            "P1": "null",
            "P2": "null",
            "cart_reached": False,
            "checkout_reached": False,
            "price_assessment": "INCONCLUSIVE",
            "journey_coverage": "0%",
            "findings_count": 0,
            "findings": [],
            "evidence_text": [],
            "evidence_selector": [],
            "last_successful_action": "None",
            "failed_action": f"[EXCEPTION] {str(e)[:100]}"
        }


async def main():
    targets = [
        ("The Club Factory", "https://theclubfactory.in/"),
        ("Amazon India", "https://www.amazon.in/dp/B08N5WRWNW"),
        ("Flipkart", "https://www.flipkart.com/"),
        ("Myntra", "https://www.myntra.com/"),
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        results = []
        for name, url in targets:
            res = await run_target_audit(client, name, url)
            results.append(res)

    print("\n\n=======================================================")
    print("ALL LIVE AUDITS SUMMARY")
    print("=======================================================")
    for r in results:
        print(f"{r['target']:<18} | P0: {r['P0']:<10} | P1: {r['P1']:<8} | P2: {r['P2']:<8} | Cart: {str(r['cart_reached']):<5} | Checkout: {str(r['checkout_reached']):<5} | Assessment: {r['price_assessment']}")

    # Save to JSON file for audit record
    output_path = os.path.join(os.path.dirname(__file__), "live_audit_results.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved live audit telemetry to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
