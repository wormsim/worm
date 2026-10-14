/* POST /api/live/reveal — { address, move, salt }, after the draw.
   Accepted only if sha-256(move, salt) equals the sealed commitment. */
import { NextResponse } from "next/server";
import { LiveError, reveal } from "../../../lib/live/service";
import { body, limited } from "../_guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = limited(req); if (blocked) return blocked;
  const b = await body(req); if (b instanceof NextResponse) return b;
  try { return NextResponse.json(await reveal({ address: b.address, move: b.move, salt: b.salt })); }
  catch (e) { const err = e as LiveError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 }); }
}
