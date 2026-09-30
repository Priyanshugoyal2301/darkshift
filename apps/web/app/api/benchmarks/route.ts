import { NextResponse } from "next/server";

const API_BASE = process.env.DARKSHIELD_API_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/benchmarks`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Backend returned status ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      [
        {
          id: "flight-ota",
          url: "https://demo.darkshield.gov.in/flight-booking-audit",
          name: "OTA Flight Booking Portal",
          industry: "Travel & Aviation",
          description: "Drip Pricing (withheld convenience fee), Basket Sneaking (auto-added insurance), and Interface Interference.",
          finding_count: 4,
        },
        {
          id: "ecommerce-flash-sale",
          url: "https://demo.darkshield.gov.in/ecommerce-flash-sale",
          name: "Fast Fashion & Electronics Marketplace",
          industry: "Retail E-Commerce",
          description: "Confirm Shaming ('No, I love paying full price'), False Scarcity countdown, and Trick Wording opt-outs.",
          finding_count: 2,
        },
        {
          id: "saas-subscription-trap",
          url: "https://demo.darkshield.gov.in/saas-subscription-trap",
          name: "Cloud Productivity Suite (Subscription Trap)",
          industry: "B2B / Consumer SaaS",
          description: "Subscription Trap (hidden auto-renewal), Forced Action, and complex cancellation barrier.",
          finding_count: 1,
        },
      ]
    );
  }
}
