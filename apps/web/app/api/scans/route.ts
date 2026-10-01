import { NextResponse } from "next/server";

const API_BASE = process.env.DARKSHIELD_API_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/scans`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json([], { status: 200 }); // Return empty array on backend error
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Backend unreachable — return empty list so the homepage still renders
    return NextResponse.json([]);
  }
}
