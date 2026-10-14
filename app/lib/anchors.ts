/* ── app/lib/anchors.ts ──────────────────────────────────────────────────────
   The daily anchor: one chain head per closed UTC day, written on chain as a memo.

   The shared half — memo format, manifest, recomputation — used by the page at
   /anchors, by scripts/anchor.ts (which writes an entry) and by
   scripts/verify-anchor.ts (which checks one). No network in this file.

   The rule it enforces: an entry exists only after the transaction confirmed, and
   the head it claims must equal the head this repository's code produces for that
   day. A manifest that disagrees with the code is a bug, not an edit.
   --------------------------------------------------------------------------- */

import manifest from "../../anchors/anchors.json";
import { dateOf, runDay } from "./daily";
import { CHAIN } from "./live/protocol";

export interface Anchor {
  day: number;
  date: string;
  seed: number;
  ticks: number;
  chainHash: string;
  worldVersion: string;
  /** The memo transaction, as confirmed on chain. */
  tx: string;
  /** "robinhood" (chain ID 4663). */
  chain: string;
  anchoredAt: string;
}

export const ANCHORS: Anchor[] = manifest.anchors as Anchor[];
export const MEMO_VERSION: number = manifest.memoVersion;

/** The exact string that goes on chain. */
export function memoFor(day: number, seed: number, ticks: number, chainHash: string): string {
  return `worm:${MEMO_VERSION}|${day}|${dateOf(day)}|${seed}|${ticks}|${chainHash}`;
}

export interface ParsedMemo { version: number; day: number; date: string; seed: number; ticks: number; chainHash: string }

/** Parse a memo back. Returns null for anything that is not one of ours. */
export function parseMemo(text: string): ParsedMemo | null {
  const m = /^worm:(\d+)\|(\d+)\|(\d{4}-\d{2}-\d{2})\|(\d+)\|(\d+)\|([0-9a-f]{64})$/.exec(text.trim());
  if (!m) return null;
  return { version: Number(m[1]), day: Number(m[2]), date: m[3], seed: Number(m[4]), ticks: Number(m[5]), chainHash: m[6] };
}

/** Recompute a day from this repository's code — the only honest way to check an anchor. */
export function recomputeDay(day: number) {
  const d = runDay(day);
  return { day, date: d.date, seed: d.seed, ticks: d.ticks, chainHash: d.run.chain, worldVersion: d.run.version };
}

export interface AnchorCheck extends Anchor { ok: boolean; recomputed: string; problem?: string }

export function checkManifest(anchors: Anchor[] = ANCHORS): AnchorCheck[] {
  return anchors.map((a) => {
    const r = recomputeDay(a.day);
    const problems: string[] = [];
    if (r.chainHash !== a.chainHash) problems.push("hash differs from a local replay");
    if (r.date !== a.date) problems.push(`date is ${r.date}`);
    if (r.seed !== a.seed) problems.push(`seed is ${r.seed}`);
    if (r.ticks !== a.ticks) problems.push(`ticks is ${r.ticks}`);
    if (r.worldVersion !== a.worldVersion) problems.push(`format is ${r.worldVersion}`);
    return { ...a, ok: problems.length === 0, recomputed: r.chainHash, problem: problems.join("; ") || undefined };
  });
}

export function explorerUrl(_chain: string, tx: string): string {
  return `${CHAIN.explorer}/tx/${tx}`;
}
