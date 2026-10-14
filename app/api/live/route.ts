/* GET /api/live?address=0x… — today's clock and phase, your status, and every
   published day of the current season in the exact form the browser replays. */
import { NextResponse } from "next/server";
import { clock } from "../../lib/live/protocol";
import { autoReveal, ensureDraws, status } from "../../lib/live/service";
import { drandClient } from "../../lib/live/drand";
import { limited } from "./_guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = limited(req, 60); if (blocked) return blocked;
  const url = new URL(req.url);
  const season = clock(Date.now()).season;
  await ensureDraws(season);
  await autoReveal(season, Date.now(), drandClient());
  return NextResponse.json(status(season, url.searchParams.get("address")), { headers: { "cache-control": "no-store" } });
}
