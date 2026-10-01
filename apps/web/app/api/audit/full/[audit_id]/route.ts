import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.DARKSHIELD_API_URL || "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ audit_id: string }> }
) {
  try {
    const { audit_id } = await params;
    const res = await fetch(`${API_BASE}/api/audit/full/${audit_id}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[DarkShield Web Proxy Error]:", err);
    return NextResponse.json(
      { detail: `Scanner service error: ${err?.message || "Connection refused to backend daemon"}` },
      { status: 503 }
    );
  }
}
