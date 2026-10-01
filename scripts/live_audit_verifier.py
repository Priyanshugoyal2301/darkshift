"""
DarkShield — Live Site Audit Harness v3 (Multi-Strategy Acquisition)
Runs live audits against 6 real-world ecommerce product targets:
1. Amazon India product URL
2. Flipkart product URL
3. Myntra product URL
4. Shopify product URL
5. WooCommerce product URL
6. Custom Indian ecommerce product URL

Outputs required schema for every audit:
- P0
- P1
- P2
- product_reached
- cart_reached
- checkout_reached
- price_source
- price_confidence
- platform
- page_type
- failure_stage
- failure_reason
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
    print(f"\n================================================================================")
    print(f"AUDITING LIVE PRODUCT TARGET: {target_name}")
    print(f"URL: {target_url}")
    print(f"================================================================================")

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

        if not scan_result:
            raise TimeoutError(f"Audit timed out after 85s for {target_url}")

        # 3. Extract structured diagnostics & telemetry
        journey = scan_result.get("price_journey") or {}
        coverage = scan_result.get("scan_coverage") or {}
        site_profile = scan_result.get("site_profile") or {}
        crawler_diag = scan_result.get("crawler_diagnostics") or {}
        access_diag = scan_result.get("access_diagnostics") or {}
        findings = scan_result.get("findings") or []
        logs = scan_result.get("audit_logs") or []

        p0 = crawler_diag.get("p0") if crawler_diag.get("p0") is not None else journey.get("initial_price")
        p1 = crawler_diag.get("p1") if crawler_diag.get("p1") is not None else journey.get("cart_price")
        p2 = crawler_diag.get("p2") if crawler_diag.get("p2") is not None else journey.get("final_observed_price")

        product_reached = crawler_diag.get("product_state") == "CAPTURED" or (p0 is not None and p0 > 0)
        cart_reached = crawler_diag.get("cart_state") == "CAPTURED" or "cart" in coverage.get("stages_scanned", [])
        checkout_reached = crawler_diag.get("checkout_state") == "CAPTURED" or bool(journey.get("checkout_reached", False))

        price_source = crawler_diag.get("price_source") or "NONE"
        price_confidence = crawler_diag.get("price_confidence") or 0.0

        platform = crawler_diag.get("platform") or site_profile.get("platform") or "generic"
        page_type = crawler_diag.get("page_type") or site_profile.get("page_type") or "product"

        failure_stage = crawler_diag.get("failure_stage") or "None"
        failure_reason = crawler_diag.get("failure_reason") or "None"

        last_successful_action = crawler_diag.get("last_successful_action")
        if not last_successful_action:
            for entry in logs:
                stage = entry.get("stage", "")
                msg = entry.get("message", "")
                if stage in ("ACTION_CLICK", "ACTION_POLICY_APPROVE", "STAGE_1_CAPTURED", "STAGE_2_CAPTURED", "STAGE_3_CAPTURED"):
                    last_successful_action = f"[{stage}] {msg}"

        output = {
            "target": target_name,
            "url": target_url,
            "scan_id": scan_id,
            "P0": f"₹{p0:,.0f}" if p0 is not None else "UNKNOWN",
            "P1": f"₹{p1:,.0f}" if p1 is not None else "null",
            "P2": f"₹{p2:,.0f}" if p2 is not None else "null",
            "product_reached": product_reached,
            "cart_reached": cart_reached,
            "checkout_reached": checkout_reached,
            "price_source": price_source,
            "price_confidence": f"{price_confidence:.2f}",
            "platform": platform,
            "page_type": page_type,
            "failure_stage": failure_stage,
            "failure_reason": failure_reason,
            "findings_count": len(findings),
            "findings": [f"{f.get('pattern')}: {f.get('title')}" for f in findings],
            "last_successful_action": last_successful_action or "None"
        }

        print("\n--- STRUCTURED AUDIT OUTPUT ---")
        print(f"P0:                 {output['P0']}")
        print(f"P1:                 {output['P1']}")
        print(f"P2:                 {output['P2']}")
        print(f"product_reached:    {output['product_reached']}")
        print(f"cart_reached:       {output['cart_reached']}")
        print(f"checkout_reached:   {output['checkout_reached']}")
        print(f"price_source:       {output['price_source']}")
        print(f"price_confidence:   {output['price_confidence']}")
        print(f"platform:           {output['platform']}")
        print(f"page_type:          {output['page_type']}")
        print(f"failure_stage:      {output['failure_stage']}")
        print(f"failure_reason:     {output['failure_reason']}")
        print(f"last_action:        {output['last_successful_action']}")
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
            "product_reached": False,
            "cart_reached": False,
            "checkout_reached": False,
            "price_source": "NONE",
            "price_confidence": "0.00",
            "platform": "unknown",
            "page_type": "unknown",
            "failure_stage": "exception",
            "failure_reason": str(e)[:120],
            "findings_count": 0,
            "findings": [],
            "last_successful_action": "None"
        }


async def main():
    targets = [
        ("Amazon India (boAt Bassheads)", "https://www.amazon.in/dp/B071Z8M4KX"),
        ("Flipkart (iPhone 15)", "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4"),
        ("Myntra (Cotton T-Shirt)", "https://www.myntra.com/tshirts/roadster/roadster-men-black-pure-cotton-t-shirt/2297985/buy"),
        ("Shopify (The Club Factory)", "https://theclubfactory.in/products/apple-20w-usb-c-power-adapter"),
        ("WooCommerce (ST Waykar)", "https://stwaykar.in/product/trending-party-wear-saree-pw64/"),
        ("Custom Indian Retail (Tata CLiQ)", "https://www.tatacliq.com/titan-np1805nm01-workwear-analog-watch-for-men/p-mp000000010992382"),
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        results = []
        for name, url in targets:
            res = await run_target_audit(client, name, url)
            results.append(res)

    print("\n\n========================================================================================================")
    print("DARKSHIELD CRAWLER V3 — LIVE PRODUCT AUDIT BENCHMARK SUMMARY")
    print("========================================================================================================")
    header = f"{'Target':<28} | {'P0':<10} | {'P1':<8} | {'P2':<8} | {'Cart':<5} | {'Checkout':<8} | {'Platform':<11} | {'Price Source':<13} | {'Conf':<5}"
    print(header)
    print("-" * len(header))
    for r in results:
        print(f"{r['target']:<28} | {r['P0']:<10} | {r['P1']:<8} | {r['P2']:<8} | {str(r['cart_reached']):<5} | {str(r['checkout_reached']):<8} | {r['platform']:<11} | {r['price_source']:<13} | {r['price_confidence']:<5}")

    output_path = os.path.join(os.path.dirname(__file__), "live_audit_results.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved live audit telemetry to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
