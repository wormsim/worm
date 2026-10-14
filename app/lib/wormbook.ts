/* ── app/lib/wormbook.ts ─────────────────────────────────────────────────────
   One page per worm. Everything here is read from a finished run — the engine's
   events plus the read-only observer's per-tick snapshots — and every diary line
   points at the sealed record of the tick it describes. A worm can sound proud
   or scared; it cannot say anything the record does not.
   --------------------------------------------------------------------------- */

import { RULES, simulate, type Run } from "../../sim/engine";
import { recordHash } from "../../sim/hash";
import { tickLabel } from "./runview";

export const BOOK_SEED = 20261013;
export const BOOK_TICKS = 340;

export interface DiaryLine { t: number; kind: "born" | "split" | "starving" | "crowded" | "rich" | "died" | "survived"; text: string; record: string }
export interface Life {
  id: number; gen: number; parent: number | null; born: number; opening: number;
  died: number | null; children: { id: number; t: number; cash: number }[];
  cash: { t: number; v: number }[]; peak: number; last: number; descendants: number;
  ancestors: number[]; diary: DiaryLine[];
}

let cache: { run: Run; lives: Map<number, Life> } | null = null;

export function book() {
  if (cache) return cache;
  const frames: { id: number; cash: number; gen: number; parent: number | null }[][] = [];
  const run = simulate(BOOK_SEED, BOOK_TICKS, (t, agents) => { frames[t] = agents.map((a) => ({ id: a.id, cash: a.cash, gen: a.gen, parent: a.parent })); });
  const lives = new Map<number, Life>();
  const make = (id: number, gen: number, parent: number | null, born: number, opening: number): Life =>
    ({ id, gen, parent, born, opening, died: null, children: [], cash: [], peak: opening, last: opening, descendants: 0, ancestors: [], diary: [] });
  for (let i = 0; i < 3; i++) lives.set(i, make(i, 1, null, 0, RULES.startCash));
  for (const e of run.events) {
    if (e.kind === "split") { lives.set(e.id, make(e.id, e.gen, e.parent, e.t, e.cash)); lives.get(e.parent!)?.children.push({ id: e.id, t: e.t, cash: e.cash }); }
    else { const l = lives.get(e.id); if (l) l.died = e.t; }
  }
  frames.forEach((frame, t) => {
    for (const a of frame) { const l = lives.get(a.id); if (!l) continue; l.cash.push({ t, v: a.cash }); l.peak = Math.max(l.peak, a.cash); l.last = a.cash; }
  });
  const rec = (t: number) => (t > 0 ? recordHash(run.records[t - 1]) : "genesis");
  for (const l of lives.values()) {
    let p = l.parent; while (p !== null) { l.ancestors.unshift(p); p = lives.get(p)?.parent ?? null; }
    const d: DiaryLine[] = [];
    d.push(l.parent === null
      ? { t: 0, kind: "born", text: `I am one of the three founders. I start with ${RULES.startCash.toFixed(2)} and a rent bill.`, record: "genesis" }
      : { t: l.born, kind: "born", text: `I split off from #${l.parent} and took half: ${l.opening.toFixed(2)}. Generation ${l.gen}.`, record: rec(l.born) });
    let warned = false, crowded = false, rich = false;
    for (const { t, v } of l.cash) {
      if (t === 0 || t === l.born) continue;
      const child = l.children.find((c) => c.t === t);
      if (child) d.push({ t, kind: "split", text: `I split in two. #${child.id} crawls away with ${child.cash.toFixed(2)}; I keep the same.`, record: rec(t) });
      const alive = run.records[t - 1]?.alive ?? 0;
      const rent = run.records[t - 1]?.rent ?? RULES.rent;
      if (!warned && v < rent * 2.2) { warned = true; d.push({ t, kind: "starving", text: `Down to ${v.toFixed(2)}. Rent is ${rent.toFixed(3)}. One bad tick from the end.`, record: rec(t) }); }
      if (warned && v >= rent * 6) warned = false;
      if (!rich && v >= RULES.birthCost * 3) { rich = true; d.push({ t, kind: "rich", text: `${v.toFixed(2)} in the bank. Best I have ever done.`, record: rec(t) }); }
      if (!crowded && v >= RULES.birthCost * 2 && alive >= RULES.cap) { crowded = true; d.push({ t, kind: "crowded", text: `I can afford a child, but the dish is full: ${RULES.cap} of ${RULES.cap}. I wait.`, record: rec(t) }); }
    }
    if (l.died !== null) d.push({ t: l.died, kind: "died", text: `I could not pay ${(run.records[l.died - 1]?.rent ?? 0).toFixed(3)}. That was the end.${l.children.length ? ` ${l.children.length} of mine went on.` : ""}`, record: rec(l.died) });
    else d.push({ t: run.records.length, kind: "survived", text: `Still here at ${tickLabel(run.records.length)}, holding ${l.last.toFixed(2)}.`, record: rec(run.records.length) });
    l.diary = d;
  }
  const count = (id: number): number => (lives.get(id)?.children ?? []).reduce((s, c) => s + 1 + count(c.id), 0);
  for (const l of lives.values()) l.descendants = count(l.id);
  cache = { run, lives };
  return cache;
}

/** The balance over a life, as an SVG path in a w×h box, scaled to its peak. */
export function cashPath(l: Life, w: number, h: number, ticks = BOOK_TICKS) {
  const max = Math.max(RULES.birthCost * 2.5, l.peak * 1.12);
  const x = (t: number) => (t / ticks) * w, y = (v: number) => h - Math.min(1, v / max) * h;
  return { d: l.cash.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(""), splitY: y(RULES.birthCost * 2), x, y };
}
