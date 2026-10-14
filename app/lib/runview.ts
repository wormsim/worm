/* ── app/lib/runview.ts ──────────────────────────────────────────────────────
   Pure views over a finished run, shared by the server-rendered page and the live
   script in the browser. Nothing here changes a run or feeds back into one: it
   reads `simulate()` output and turns it into strings, paths and short lists.
   --------------------------------------------------------------------------- */

import { RULES, type Run } from "../../sim/engine";
import { chainHash, GENESIS, recordHash } from "../../sim/hash";

/** The chain head after every tick: chains[t-1] is the commitment at tick t. */
export function chainsFor(run: Run): string[] {
  const out: string[] = [];
  let chain = GENESIS;
  for (const r of run.records) {
    chain = chainHash(chain, recordHash(r));
    out.push(chain);
  }
  return out;
}

export const tickLabel = (t: number) => `T${String(t).padStart(3, "0")}`;

/** Chart geometry. One scale for marks and labels. */
export const CHART = { w: 640, h: 210, left: 34, right: 40, top: 14, bottom: 26, rentMax: 1 } as const;

export function chartX(t: number, ticks: number) {
  const span = CHART.w - CHART.left - CHART.right;
  return CHART.left + (Math.max(0, t) / Math.max(1, ticks)) * span;
}
const yAlive = (n: number) => CHART.top + (1 - n / RULES.cap) * (CHART.h - CHART.top - CHART.bottom);
const yRent = (r: number) => CHART.top + (1 - r / CHART.rentMax) * (CHART.h - CHART.top - CHART.bottom);

/** The population as an area path and the rent as a line, over the whole run. */
export function chartPaths(run: Run, ticks: number) {
  const base = CHART.h - CHART.bottom;
  let line = `M${chartX(0, ticks).toFixed(1)},${yAlive(3).toFixed(1)}`;
  for (const r of run.records) line += `L${chartX(r.t, ticks).toFixed(1)},${yAlive(r.alive).toFixed(1)}`;
  const lastX = chartX(run.records.length, ticks).toFixed(1);
  const area = `${line}L${lastX},${base}L${chartX(0, ticks).toFixed(1)},${base}Z`;
  let rent = "";
  for (const r of run.records) rent += `${rent ? "L" : "M"}${chartX(r.t, ticks).toFixed(1)},${yRent(r.rent).toFixed(1)}`;
  const splits: number[] = [], deaths: number[] = [];
  for (const r of run.records) {
    if (r.births) splits.push(r.t);
    if (r.deaths) deaths.push(r.t);
  }
  return { area, line, rent, splits, deaths, yAlive, yRent, base };
}

export interface LineStep { id: number; gen: number; t: number; cash: number }

/** The deepest line still alive at the end, traced back to its founder. */
export function deepestLine(run: Run): LineStep[] {
  const born = new Map<number, LineStep & { parent: number | null }>();
  for (let i = 0; i < 3; i++) born.set(i, { id: i, parent: null, gen: 1, t: 0, cash: RULES.startCash });
  const dead = new Set<number>();
  for (const e of run.events) {
    if (e.kind === "split") born.set(e.id, { id: e.id, parent: e.parent, gen: e.gen, t: e.t, cash: e.cash });
    else if (e.kind === "death") dead.add(e.id);
  }
  let tip: (LineStep & { parent: number | null }) | undefined;
  for (const a of born.values()) if (!dead.has(a.id) && (!tip || a.gen > tip.gen)) tip = a;
  const line: LineStep[] = [];
  while (tip) {
    line.unshift({ id: tip.id, gen: tip.gen, t: tip.t, cash: tip.cash });
    tip = tip.parent === null ? undefined : born.get(tip.parent);
  }
  return line;
}

/** How many of the living agents sit in each generation at the end. */
export function generationCounts(run: Run): { gen: number; alive: number; born: number }[] {
  const gens = new Map<number, { alive: number; born: number }>();
  gens.set(1, { alive: 3, born: 3 });
  for (const e of run.events) {
    const g = gens.get(e.gen) ?? { alive: 0, born: 0 };
    if (e.kind === "split") { g.alive++; g.born++; }
    else if (e.kind === "death") g.alive--;
    gens.set(e.gen, g);
  }
  return [...gens.entries()].sort((a, b) => a[0] - b[0]).map(([gen, v]) => ({ gen, ...v }));
}

/** A readable line for one event, as the ticker and the log print it. */
export function eventLine(e: Run["events"][number]): { k: "split" | "death"; text: string } {
  if (e.kind === "death") return { k: "death", text: `${tickLabel(e.t)} · #${e.id} missed rent · gen ${e.gen}` };
  return { k: "split", text: `${tickLabel(e.t)} · #${e.parent} split → #${e.id} · gen ${e.gen}` };
}

/** The milestones of a run, in order: first split, first death, each new generation, the lid. */
export function milestones(run: Run, limit = 18) {
  const out: { k: "split" | "death" | "lid"; text: string }[] = [];
  let firstDeath = false, deepest = 1, lid = false;
  for (const e of run.events) {
    if (e.kind === "death" && !firstDeath) { firstDeath = true; out.push(eventLine(e)); }
    if (e.kind === "split" && e.gen > deepest) { deepest = e.gen; out.push(eventLine(e)); }
  }
  for (const r of run.records) {
    if (!lid && r.alive >= RULES.cap) { lid = true; out.push({ k: "lid", text: `${tickLabel(r.t)} · the jar reaches its lid · ${RULES.cap} alive` }); }
  }
  const deaths = run.events.filter((e) => e.kind === "death");
  for (const e of deaths.slice(1, 6)) out.push(eventLine(e));
  return out.sort((a, b) => a.text.localeCompare(b.text)).slice(0, limit);
}

/* ── the family tree ──────────────────────────────────────────────────────── */

export interface TreeNode { id: number; parent: number | null; gen: number; born: number; died: number; x: number; y: number }

/** Every agent of a run as a radial phylogeny: founders near the middle, one ring per generation. */
export function familyTree(run: Run, size = 360) {
  const c = size / 2, inner = 26, outer = size / 2 - 16;
  const nodes = new Map<number, TreeNode & { kids: number[]; leaves: number; a: number }>();
  const add = (id: number, parent: number | null, gen: number, born: number) =>
    nodes.set(id, { id, parent, gen, born, died: -1, x: c, y: c, kids: [], leaves: 0, a: 0 });
  for (let i = 0; i < 3; i++) add(i, null, 1, 0);
  for (const e of run.events) {
    if (e.kind === "split") { add(e.id, e.parent, e.gen, e.t); nodes.get(e.parent!)?.kids.push(e.id); }
    else { const n = nodes.get(e.id); if (n) n.died = e.t; }
  }
  const maxGen = Math.max(...[...nodes.values()].map((n) => n.gen));
  const step = maxGen > 1 ? (outer - inner) / (maxGen - 1) : 0;
  const leaves = (id: number): number => {
    const n = nodes.get(id)!;
    n.leaves = n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1;
    return n.leaves;
  };
  const total = [0, 1, 2].reduce((s, f) => s + leaves(f), 0);
  const place = (id: number, a0: number, a1: number) => {
    const n = nodes.get(id)!;
    n.a = (a0 + a1) / 2;
    const r = inner + (n.gen - 1) * step;
    n.x = c + Math.cos(n.a) * r; n.y = c + Math.sin(n.a) * r;
    let a = a0;
    for (const k of n.kids) { const span = ((a1 - a0) * nodes.get(k)!.leaves) / n.leaves; place(k, a, a + span); a += span; }
  };
  let a = -Math.PI / 2;
  for (const f of [0, 1, 2]) { const span = (Math.PI * 2 * nodes.get(f)!.leaves) / total; place(f, a, a + span); a += span; }

  const deep = new Set(deepestLine(run).map((s) => s.id));
  const f1 = (n: number) => n.toFixed(1);
  let edges = "", dots = "";
  for (const n of nodes.values()) {
    if (n.parent === null) continue;
    const p = nodes.get(n.parent)!;
    const rp = inner + (p.gen - 1) * step, rc = inner + (n.gen - 1) * step, rm = (rp + rc) / 2;
    const mx1 = c + Math.cos(p.a) * rm, my1 = c + Math.sin(p.a) * rm, mx2 = c + Math.cos(n.a) * rm, my2 = c + Math.sin(n.a) * rm;
    const sweep = n.a > p.a ? 1 : 0;
    edges += `<path class="e${deep.has(n.id) ? " deep" : ""}" data-id="${n.id}" data-born="${n.born}" d="M${f1(p.x)},${f1(p.y)}L${f1(mx1)},${f1(my1)}A${f1(rm)},${f1(rm)} 0 0 ${sweep} ${f1(mx2)},${f1(my2)}L${f1(n.x)},${f1(n.y)}"/>`;
  }
  for (const n of nodes.values()) {
    const label = `#${n.id} · gen ${n.gen} · ${n.parent === null ? "founder" : `born ${tickLabel(n.born)} from #${n.parent}`}${n.died >= 0 ? ` · died ${tickLabel(n.died)}` : ""}`;
    dots += `<circle class="n${deep.has(n.id) ? " deep" : ""}" data-id="${n.id}" data-born="${n.born}" data-died="${n.died}" cx="${f1(n.x)}" cy="${f1(n.y)}" r="${n.parent === null ? 4.5 : 3.2}"><title>${label}</title></circle>`;
  }
  let rings = "";
  for (let g = 1; g <= maxGen; g++) rings += `<circle class="ring" cx="${c}" cy="${c}" r="${f1(inner + (g - 1) * step)}"/>`;
  return { svg: `<g class="rings">${rings}</g><g class="edges">${edges}</g><g class="nodes">${dots}</g>`, maxGen, count: nodes.size };
}
