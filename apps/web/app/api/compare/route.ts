import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.DARKSHIELD_API_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE}/api/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[DarkShield Compare Proxy Error]:", err);
    return NextResponse.json(
      { detail: `Comparison service error: ${err?.message || "Connection refused to backend daemon"}` },
      { status: 503 }
    );
  }
}
