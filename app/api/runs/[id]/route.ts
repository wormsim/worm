/* GET /api/runs/<run id>?date=YYYY-MM-DD — a board entry's full record and its Merkle proof.
   With the record you can replay the run yourself; with the proof you can check it's under the day's root. */
import { NextResponse } from "next/server";
import { isDate } from "../../../lib/board/board";
import { runWithProof } from "../../../lib/board/service";
import { limited } from "../../live/_guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = limited(req, 60); if (blocked) return blocked;
  const { id } = await ctx.params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isDate(date) || !/^[0-9a-f]{64}$/.test(id)) return NextResponse.json({ error: "need a run id and ?date=" }, { status: 400 });
  const r = runWithProof(date, id);
  return r ? NextResponse.json(r, { headers: { "cache-control": "public, max-age=60" } }) : NextResponse.json({ error: "no such run on that day's board" }, { status: 404 });
}
