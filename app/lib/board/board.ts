/* ── app/lib/board/board.ts ──────────────────────────────────────────────────
   The daily Outbreak leaderboard. Pure: no files, no network.

   A score is never taken on trust. A submission is the run's whole record —
   seed, side, notes, every input that changed, every card picked — and the
   server REPLAYS it with the same engine the player ran. Only the replay's
   score goes on the board. A claimed number is ignored; a forged input gives a
   different game; a run on any seed but the day's is refused.

   Each day's board is committed to by a Merkle root (merkle.ts) that can be
   written on Robinhood Chain; each entry comes with a proof.
   --------------------------------------------------------------------------- */

import { sha256Hex, stableStringify } from "../../../sim/hash";
import { dailySeed, OUTBREAK_VERSION, replay, type RunRecord, type Side } from "../../../sim/outbreak";
import { leafHash, merkleProof, merkleRoot } from "./merkle";

export const BOARD_VERSION = "board/1";
export const BOARD_SIZE = 200;              // per side per day
export const MAX_DAYS = 40;                 // a run longer than this is refused (replay cost)

export interface Entry {
  date: string; side: Side; name: string; address: string | null;
  score: number; days: number; over: string; maxGen: number;
  run: string;          // sha-256 of the canonical record: the run's id
  head: string;         // the replay's final chain head
  at: number;
}

export const runId = (r: RunRecord) => sha256Hex(stableStringify(r));
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const cleanName = (n: unknown) => typeof n === "string" ? n.trim().replace(/\s+/g, " ") : "";
export const validName = (n: string) => /^[A-Za-z0-9 ._-]{2,20}$/.test(n);

/** The message a wallet signs to put its address on an entry. Plain text; moves no funds. */
export function boardMessage(date: string, side: Side, score: number, run: string, name: string) {
  return [`WORM Outbreak · daily board ${date} · ${side}`, `Score: ${score}`, `Run: ${run}`, `Name: ${name}`, "", "This signature puts your address next to this run. It moves no funds and approves nothing."].join("\n");
}

/** Replay a submitted record and say what it really scored — or why it can't go on the board. */
export function judge(rec: unknown, date: string): { ok: true; score: number; days: number; over: string; maxGen: number; head: string; side: Side; run: string } | { ok: false; error: string } {
  const r = rec as RunRecord;
  if (!r || typeof r !== "object" || !Array.isArray(r.days)) return { ok: false, error: "that isn't a run record" };
  if (r.v !== OUTBREAK_VERSION) return { ok: false, error: `runs on this board are ${OUTBREAK_VERSION}` };
  if (r.side !== "worm" && r.side !== "warden") return { ok: false, error: "side must be worm or warden" };
  if (r.seed !== dailySeed(date)) return { ok: false, error: `this run isn't on the daily dish for ${date}` };
  if (r.days.length < 1 || r.days.length > MAX_DAYS) return { ok: false, error: `a run is 1–${MAX_DAYS} days` };
  try {
    const { state } = replay(r);
    if (!state.over) return { ok: false, error: "the run isn't finished" };
    if (state.reports.length !== r.days.length) return { ok: false, error: "the record has days the run never reached" };
    return { ok: true, score: state.score, days: state.day, over: state.over, maxGen: state.maxGen, head: state.head, side: r.side, run: runId(r) };
  } catch (e) { return { ok: false, error: `the run doesn't replay: ${(e as Error).message}` }; }
}

/** Rank: score, then fewer days, then earlier. */
export const ranked = (entries: Entry[]) => [...entries].sort((a, b) => b.score - a.score || a.days - b.days || a.at - b.at || (a.run < b.run ? -1 : 1));

/** What a leaf commits to. Everything a reader would want to dispute, nothing that can drift. */
export const leafOf = (e: Entry) => leafHash({ v: BOARD_VERSION, date: e.date, side: e.side, name: e.name, address: e.address, score: e.score, run: e.run, head: e.head });

/** The day's board in canonical order: worm side ranked, then warden side ranked. */
export function canonical(entries: Entry[]) { return [...ranked(entries.filter((e) => e.side === "worm")), ...ranked(entries.filter((e) => e.side === "warden"))]; }
export function boardRoot(entries: Entry[]) { return merkleRoot(canonical(entries).map(leafOf)); }
export function proofFor(entries: Entry[], run: string) {
  const c = canonical(entries), i = c.findIndex((e) => e.run === run);
  if (i < 0) return null;
  return { leaf: leafOf(c[i]), proof: merkleProof(c.map(leafOf), i), root: merkleRoot(c.map(leafOf)), index: i };
}
