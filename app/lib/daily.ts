/* ── app/lib/daily.ts ────────────────────────────────────────────────────────
   One dish per UTC day. Day 0 is 2026-10-13; every day after it gets its own
   seed, derived from its date, and runs the same rules for the same number of
   ticks. The pinned golden run (tests/goldens.json) stays as the test vector;
   these are the dishes the daily anchors commit to.

   Honest limit, stated where the code is: a seed derived from the date is known
   in advance. Today an anchor proves that the code which produced a day's head
   was not changed afterwards. Once players' moves enter the dish, the seed will
   come from a block mined after the moves are locked — see docs/STATUS.md.
   --------------------------------------------------------------------------- */

import { RULES, simulate, type Run } from "../../sim/engine";
import { sha256Hex } from "../../sim/hash";

export const DAY_VERSION = "worm-day/1";
export const EPOCH_DATE = "2026-10-13";
export const EPOCH_MS = Date.parse(`${EPOCH_DATE}T00:00:00Z`);
const DAY_MS = 86_400_000;

export const dateOf = (day: number) => new Date(EPOCH_MS + day * DAY_MS).toISOString().slice(0, 10);

/** `--day` style input: a day number (0) or a date (2026-10-13). */
export function dayOf(input: string): number {
  if (/^\d+$/.test(input)) return Number(input);
  const ms = Date.parse(`${input}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`expected a day number or YYYY-MM-DD, got "${input}"`);
  const day = Math.round((ms - EPOCH_MS) / DAY_MS);
  if (day < 0) throw new Error(`${input} is before day 0 (${EPOCH_DATE})`);
  return day;
}

/** The day that is running at `now`. */
export const currentDay = (now: number) => Math.floor((now - EPOCH_MS) / DAY_MS);

/** A day's seed: the first 31 bits of sha256("worm-day/1|YYYY-MM-DD"). */
export function seedFor(day: number): number {
  return parseInt(sha256Hex(`${DAY_VERSION}|${dateOf(day)}`).slice(0, 8), 16) >>> 1;
}

export interface DayRun { day: number; date: string; seed: number; ticks: number; run: Run }

export function runDay(day: number): DayRun {
  const seed = seedFor(day);
  return { day, date: dateOf(day), seed, ticks: RULES.maxTicks, run: simulate(seed, RULES.maxTicks) };
}
