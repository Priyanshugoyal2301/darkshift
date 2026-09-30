import urllib.request
import json
import time

url = "http://127.0.0.1:8000/fixtures/03-drip-pricing-product.html"
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/scan",
    data=json.dumps({"url": url}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
res = urllib.request.urlopen(req)
scan_id = json.loads(res.read())["scan_id"]
print(f"Triggered scan: {scan_id}")

for i in range(15):
    time.sleep(1)
    status_res = urllib.request.urlopen(f"http://127.0.0.1:8000/api/scan/{scan_id}")
    data = json.loads(status_res.read())
    status = data.get("status")
    print(f"Poll {i}: {status}")
    if status in ["done", "error"]:
        print("\n--- RESULTS ---")
        print("Status:", status)
        print("Pages Analyzed:", data.get("pages_analyzed"))
        print("Risk Assessment:", json.dumps(data.get("risk_assessment"), indent=2))
        print("Price Journey:", json.dumps(data.get("price_journey"), indent=2))
        print("Findings Count:", len(data.get("findings", [])))
        for f in data.get("findings", []):
            print(f"  - [{f.get('severity')}] {f.get('title')} ({f.get('confidence_tier')})")
        break
