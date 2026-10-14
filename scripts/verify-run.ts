#!/usr/bin/env npx tsx
/* ── scripts/verify-run.ts ───────────────────────────────────────────────────
   Replay any Outbreak run from its record and print what it really scored.

     npx tsx scripts/verify-run.ts run.json                 # replay, print every day's head
     npx tsx scripts/verify-run.ts run.json --date 2026-10-14   # …and judge it as the daily board would

   A record is what the game sends to the board and what /api/runs/<id> returns.
   No network, no keys: the whole check is this repository's engine on your machine.
   --------------------------------------------------------------------------- */

import { readFileSync } from "node:fs";
import { replay, type RunRecord } from "../sim/outbreak";
import { judge, runId } from "../app/lib/board/board";

const file = process.argv[2];
if (!file) { console.error("usage: npx tsx scripts/verify-run.ts <run.json> [--date YYYY-MM-DD]"); process.exit(2); }
const raw = JSON.parse(readFileSync(file, "utf8"));
const rec: RunRecord = raw.record ?? raw;
const t0 = Date.now();
const { state, reports } = replay(rec);
console.log(`run      ${runId(rec)}\nrules    ${rec.v} · ${rec.side} · seed ${rec.seed}`);
for (const r of reports) console.log(`day ${String(r.day).padStart(2)}   R ${r.R.toFixed(2).padStart(5)}   ${String(r.points).padStart(6)} pts   head ${r.head}`);
console.log(`result   ${state.over ?? "unfinished"} · score ${state.score} · deepest generation ${state.maxGen} · replayed in ${Date.now() - t0} ms`);
const di = process.argv.indexOf("--date");
if (di > 0) {
  const v = judge(rec, process.argv[di + 1]);
  console.log(v.ok ? `board    ACCEPTED for ${process.argv[di + 1]} at ${v.score}` : `board    REFUSED: ${v.error}`);
  process.exit(v.ok ? 0 : 1);
}
