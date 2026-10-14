/* ── app/lib/live/store.ts ───────────────────────────────────────────────────
   The live season's ledger, as one JSON file per season on the server's disk.
   Commits, reveals and draws are appended and never edited; a day's published
   record is derived from them. Writes are serialised in-process and land with a
   rename, so a crash cannot leave half a file. One server process is assumed.

   On the boundary test's allowlist: reads WORM_DATA_DIR from the environment.
   --------------------------------------------------------------------------- */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Move } from "../../../sim/war";
import type { Block } from "./chain";

export interface Commit { side: "red" | "blue"; commitment: string; signature: string; at: number; sealed?: string }
export interface Reveal { move: Move; salt: string; at: number; auto?: boolean }
export interface DayLedger { commits: Record<string, Commit>; reveals: Record<string, Reveal>; draw?: Block }
export interface SeasonLedger { season: number; sides: Record<string, "red" | "blue">; days: Record<string, DayLedger> }

let override: string | null = null;
/** Tests point the ledger at a temporary directory. */
export const setDataDir = (dir: string | null) => { override = dir; };
const DIR = () => override || process.env.WORM_DATA_DIR || path.join(process.cwd(), "data");
/** The server's data directory (the leaderboard keeps its files here too). */
export const dataDir = DIR;
const file = (season: number) => path.join(DIR(), `season-${season}.json`);

export function load(season: number): SeasonLedger {
  try { return JSON.parse(readFileSync(file(season), "utf8")) as SeasonLedger; }
  catch { return { season, sides: {}, days: {} }; }
}

let queue: Promise<unknown> = Promise.resolve();
/** Read-modify-write under a process-wide lock. */
export function update<T>(season: number, fn: (l: SeasonLedger) => T): Promise<T> {
  const run = queue.then(() => {
    const ledger = load(season);
    const out = fn(ledger);
    mkdirSync(DIR(), { recursive: true });
    const tmp = `${file(season)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger));
    renameSync(tmp, file(season));
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const dayOf = (l: SeasonLedger, day: number): DayLedger => (l.days[String(day)] ??= { commits: {}, reveals: {} });
