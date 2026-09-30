import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.DARKSHIELD_API_URL || "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const res = await fetch(`${API_BASE}/api/scan/${id}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { detail: `Scanner service unreachable: ${err?.message}` },
      { status: 503 }
    );
  }
}
