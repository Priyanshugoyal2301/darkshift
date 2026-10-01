import os
import json
import google.generativeai as genai

genai.configure(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key-for-mock"))

def generate_audit_report(url: str, findings: list, total_pages: int, pages_analyzed: int) -> dict:
    if os.environ.get("GEMINI_API_KEY") is None or os.environ.get("GEMINI_API_KEY") == "dummy-key-for-mock":
        # Return programmatic structured data
        return mock_generate(url, findings, total_pages, pages_analyzed)

    try:
        model = genai.GenerativeModel('gemini-1.5-pro')
        prompt = f"""
        Analyze the following dark pattern findings for a full website compliance audit.
        Website: {url}
        Pages discovered: {total_pages}
        Pages analyzed: {pages_analyzed}
        Findings: {json.dumps([f.model_dump() if hasattr(f, 'model_dump') else f for f in findings], indent=2)}

        Return a JSON object containing:
        - executive_summary
        - total_findings
        - severity_breakdown (critical, high, medium, low)
        - regulatory_mapping (map to CCPA 2023 or general guidelines, or mark "Requires legal review")
        - recommended_remediation
        - pages_requiring_attention
        """
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        return json.loads(response.text)
    except Exception as e:
        print("Gemini API error:", e)
        return mock_generate(url, findings, total_pages, pages_analyzed)

def mock_generate(url, findings, total_pages, pages_analyzed):
    high = sum(1 for f in findings if f.severity.upper() == 'HIGH')
    medium = sum(1 for f in findings if f.severity.upper() in ['MEDIUM', 'ELEVATED'])
    low = sum(1 for f in findings if f.severity.upper() == 'LOW')

    unique_patterns = list(set(f.pattern.value if hasattr(f.pattern, 'value') else f.pattern for f in findings))
    
    mapping = []
    if unique_patterns:
        mapping.append({
            "rule": "CCPA 2023 Guidelines - Section 5 (General Deceptive Patterns)",
            "notes": "Requires legal review. Identifiers mapped programmatically.",
            "affected_patterns": unique_patterns
        })

    return {
        "website_url": url,
        "executive_summary": "This is an automated structured compliance audit. The platform detected potential compliance risks across the crawled journey. Note: This assessment is programmatic and constitutes evidentiary heuristics rather than legal determination.",
        "total_findings": len(findings),
        "pages_crawled": total_pages,
        "pages_analyzed": pages_analyzed,
        "severity_breakdown": {
            "critical": 0,
            "high": high,
            "medium": medium,
            "low": low
        },
        "regulatory_mapping": mapping,
        "recommended_remediation": [
            "Review all high-severity findings and remove pre-selected checkboxes.",
            "Ensure pricing transparency by displaying mandatory fees prominently on the product page.",
            "Conduct a manual audit of the specific URLs flagged."
        ],
        "pages_requiring_attention": list(set(f.url for f in findings if hasattr(f, 'url'))) if len(findings) > 0 else []
    }
