# 🛡️ DarkShield

**Evidence-first dark pattern detection platform for India's CCPA 2023 framework**

DarkShield detects deceptive UX practices across e-commerce, travel, subscription, and digital service platforms — mapping evidence to the 13 official dark pattern categories in India's Consumer Protection (E-Commerce) Rules.

> **⚠ Important**: DarkShield detects *potential* dark patterns and provides evidence-based warnings. Findings are not legal determinations. The Transparency Score is a product metric, not an official CCPA compliance score.

---

## Architecture: DarkShield Five-Layer Detection

```
┌──────────────────────────────────────────┐
│  LAYER 1 — ACQUISITION                   │
│  Browser Extension / URL Scanner         │
└─────────────────────┬────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  LAYER 2 — WEB PAGE ANALYZER             │
│  DOM + CSS + Text + Prices + Events      │
└─────────────────────┬────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  LAYER 3 — DETECTION ENGINE              │
│  Rules + NLP/ML + State + Visual Signals │
└─────────────────────┬────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  LAYER 4 — CLASSIFICATION & EVIDENCE     │
│  CCPA Mapping + Confidence + Evidence    │
└─────────────────────┬────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  LAYER 5 — DASHBOARD / EXPLANATION       │
│  Warning + Score + Evidence + Report     │
└──────────────────────────────────────────┘
```

## Monorepo Structure

```
darkshield/
├── apps/
│   ├── extension/          # Chrome MV3 browser extension
│   │   ├── src/
│   │   │   ├── analyzer/   # Layer 2: DOM extraction, prices, CSS geometry
│   │   │   ├── detector/   # Layer 3: Rule engine, visual detector, state trackers
│   │   │   ├── classifier/ # Layer 4: CCPA mapping, evidence, transparency score
│   │   │   ├── content/    # Content script (runs on page)
│   │   │   ├── background/ # MV3 service worker
│   │   │   └── popup/      # React popup UI
│   │   └── public/
│   │       ├── manifest.json
│   │       └── icons/
│   └── web/                # Next.js website scanner
│       └── app/
│           ├── page.tsx         # Homepage with URL scanner
│           ├── scan/[id]/       # Results page (live polling)
│           └── api/             # Proxy routes to FastAPI
├── services/
│   └── api/                # FastAPI backend
│       ├── main.py              # FastAPI app + SSRF protection
│       ├── detection_engine.py  # Python detection engine (mirrors TS)
│       ├── schemas.py           # Pydantic models
│       └── Dockerfile
├── packages/
│   ├── schemas/            # Shared TypeScript types (canonical)
│   └── rules/              # Declarative rule definitions (shared)
├── models/
│   └── fixtures/           # HTML test fixtures
│       ├── false-urgency/
│       ├── basket-sneaking/
│       ├── drip-pricing/
│       └── benign/
├── tests/                  # Python unit tests
│   └── test_detection_engine.py
└── docker/
    └── docker-compose.yml
```

## CCPA 2023 Pattern Coverage

| Pattern | MVP Phase | Detection Strategy |
|---|---|---|
| False Urgency | ✅ v1 | Countdown DOM + deadline NLP + state check |
| Scarcity Signal | ✅ v1 | Text pattern (sub-signal of False Urgency) |
| Basket Sneaking | ✅ v1 | Pre-ticked checkbox + cart state diff |
| Drip Pricing | ✅ v1 | Price journey tracking across states |
| Confirm Shaming | ✅ v2 | NLP on button/link decline text |
| Interface Interference | ✅ v2 | CSS geometry + visual prominence ratio |
| Trick Wording | ✅ v2 | Double-negative NLP patterns |
| Forced Action | 🔄 v3 | Interaction graph analysis |
| Subscription Trap | 🔄 v3 | State graph + renewal language |
| Bait & Switch | 🔄 v3 | Offer/entity tracking across states |
| Nagging | 🔄 v3 | Session-level event analysis |
| SaaS Billing | 🔄 v3 | Billing flow NLP + state graph |
| Disguised Advertisement | 🔄 v3 | Sponsored label detection |
| Rogue Malware | 🔄 v4 | Browser security heuristics |

## Quick Start

### Browser Extension (Chrome)

```bash
# Build the extension
npm run build:extension

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select: darkshield/apps/extension/dist/
```

### Web App + API (Development)

```bash
# Terminal 1: FastAPI backend
cd services/api
pip install -r requirements.txt
playwright install chromium
python main.py

# Terminal 2: Next.js web app
cd apps/web
npm run dev
# Open: http://localhost:3000
```

### Docker

```bash
docker-compose -f docker/docker-compose.yml up
# Web: http://localhost:3000
# API: http://localhost:8000/docs
```

### Run Tests

```bash
cd tests
pip install pytest beautifulsoup4 lxml
python -m pytest test_detection_engine.py -v
```

## Evidence Schema

Every finding contains full auditable evidence:

```json
{
  "id": "ds-a1b2c3d4",
  "pattern": "DRIP_PRICING",
  "confidence": 0.94,
  "severity": "high",
  "detection_methods": ["PRICE_JOURNEY", "DOM_RULE"],
  "rule_ids": ["DP_PRICE_INCREASE", "DP_HIDDEN_FEE_CHECKOUT"],
  "text_snippets": [
    "Price journey: ₹999 → ₹1,248",
    "Platform fee: ₹249"
  ],
  "ccpa_category": "DRIP_PRICING",
  "ccpa_regulation": "CCPA_DARK_PATTERNS_2023",
  "explanation": "Mandatory platform fee of ₹249 appeared at checkout that was not disclosed on the product page.",
  "consumer_advice": "Review the price breakdown carefully...",
  "remediation_hint": "Disclose all mandatory fees on the product page."
}
```

## Technology Stack

| Component | Technology |
|---|---|
| Extension | TypeScript + React + Vite + Manifest V3 |
| DOM Analysis | JavaScript/TypeScript + MutationObserver |
| Browser Automation | Playwright + Chromium |
| Frontend | Next.js 15 + React + Tailwind CSS |
| Backend | FastAPI + Python 3.11 |
| Rule Engine | Regex + DOM selectors + heuristics |
| NLP | Pattern matching (scikit-learn classifiers in v2) |
| Queue | Redis + RQ (production) |
| Testing | pytest + Playwright |
| SSRF Protection | IP allowlisting + DNS resolution check |

## Legal Notice

DarkShield operates in the evidence-detection space, not the legal-determination space.

- Findings use language like **"Potential drip pricing detected"**, never **"This website is illegal"**
- All findings include the evidence on which they are based
- The Transparency Score is a product metric; it does not constitute a CCPA compliance certification
- DarkShield never automatically makes purchases, submits forms, or handles payments during scanning

Reference: [CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023](https://consumeraffairs.nic.in)
