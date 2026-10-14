/* Small shared guard for the live endpoints: a per-IP rate limit and a body cap. */
import { NextResponse } from "next/server";

const hits = new Map<string, number[]>();
export function limited(req: Request, perMinute = 20): NextResponse | null {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) return NextResponse.json({ error: "too many requests, slow down" }, { status: 429 });
  list.push(now); hits.set(ip, list);
  return null;
}
export async function body(req: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown> | NextResponse> {
  const raw = await req.text();
  if (raw.length > maxBytes) return NextResponse.json({ error: "body too large" }, { status: 413 });
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
}
