/* GET  /api/runs?date=YYYY-MM-DD&side=worm|warden — the day's board (ranked by the server's own replays)
   POST /api/runs { date, record, name, address?, signature? } — submit a finished daily run.
   The server replays the record; the score on the board is the replay's, never a claimed one. */
import { NextResponse } from "next/server";
import { board, BoardError, submitRun } from "../../lib/board/service";
import { isDate, utcDate } from "../../lib/board/board";
import { body, limited } from "../live/_guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = limited(req, 60); if (blocked) return blocked;
  const u = new URL(req.url);
  const date = u.searchParams.get("date") ?? utcDate(Date.now());
  const side = u.searchParams.get("side") === "warden" ? "warden" : "worm";
  if (!isDate(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  return NextResponse.json(board(date, side), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const blocked = limited(req, 6); if (blocked) return blocked;
  const b = await body(req, 400 * 1024); if (b instanceof NextResponse) return b;
  try { return NextResponse.json(await submitRun({ date: b.date, record: b.record, name: b.name, address: b.address, signature: b.signature })); }
  catch (e) { const err = e as BoardError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 }); }
}
