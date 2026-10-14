/* POST /api/live/commit — { address, side, commitment, signature, sealed? }.
   `sealed` is the move time-locked to 18:00 UTC (app/lib/live/timelock.ts), so it reveals itself.
   The wallet signs a readable message containing only the hash of its move. */
import { NextResponse } from "next/server";
import { commit, LiveError } from "../../../lib/live/service";
import { body, limited } from "../_guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = limited(req); if (blocked) return blocked;
  const b = await body(req); if (b instanceof NextResponse) return b;
  try { return NextResponse.json(await commit({ address: b.address, side: b.side, commitment: b.commitment, signature: b.signature, sealed: b.sealed })); }
  catch (e) { const err = e as LiveError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 }); }
}
