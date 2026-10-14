/* ── sim/war.ts ──────────────────────────────────────────────────────────────
   Red vs Blue, as one deterministic function per day.

   The attacker's half follows the research's replication loop: a worm has to
   SETTLE on a patch of ground before it can earn and split (hard ground takes
   longer and pays more), and every child is born carrying a short NOTE from its
   family — the only thing that passes between generations.

   The defender's half follows the research's defensive list: honeypots (bait
   that catches, and reads, a worm), quarantine (rent doubles, and owners clean
   up), notification (an alert that lifts clean-up by the paper's ratio, 92/74),
   and hardening (ground that is harder to settle). The day's verdict is R: did
   the swarm grow (R > 1) or shrink (R < 1)?

   Same discipline as sim/engine.ts: one seeded generator drawn in a fixed order,
   no clock, no Math.random, balances rounded every step, every tick hashed and
   chained. A day is a pure function of (state, moves, seed).
   --------------------------------------------------------------------------- */

import { mulberry32 } from "./engine";
import { chainHash, GENESIS, recordHash, sha256Hex, stableStringify } from "./hash";

export const WAR_VERSION = "war/1";

/** Every number that shapes a day. Changing one is a rules change: bump WAR_VERSION. */
export const WAR = {
  size: 13,                 // the dish is a 13×13 grid, masked to a circle
  radius: 6.4,
  ticksPerDay: 20,
  days: 7,
  startCash: 3.5,
  founders: 2,              // each family starts with two worms
  rent: 0.3,                // per tick; doubled inside a quarantine
  rentCreep: 0.12,          // rent rises 12% a day: compute only gets dearer
  crowding: 0.3,            // a settled worm earns less for every settled neighbour: they share the same machine
  foodValue: 0.55,          // per unit of food eaten while crawling
  regrowEvery: 4,           // food grows back one unit every N ticks
  settleSoft: 2,            // ticks to settle on soft ground
  settleHard: 5,            // … on hard ground (the paper's "setting up on unfamiliar hardware" is the slow part)
  incomeSoft: 0.7,          // per tick once settled
  incomeHard: 1.3,
  split: { early: 5, normal: 6.5, late: 9 } as const,
  cap: 180,                 // the dish's lid
  cleanQuarantine: 0.4,     // chance a worm inside a quarantine is cleaned up at day's end
  alertBoost: 1.243243,     // 92 / 74: the paper's notified vs un-notified clean-up ratio
  cleanAlertOnly: 0.15,
  baitFood: 2,              // a honeypot looks like this much food — and springs once
  toolsPerWarden: 2
} as const;

export type Ground = "soft" | "hard" | "any";
export type SplitWhen = keyof typeof WAR.split;
export type Food = "greedy" | "careful";
export type Zone = "none" | "north" | "south" | "east" | "west" | "center";
export interface Note { ground: Ground; split: SplitWhen; food: Food; avoid: Zone }

export const NOTE_DEFAULT: Note = { ground: "any", split: "normal", food: "greedy", avoid: "none" };

/** A note as the sentence a family leaves behind. The words are the rules; nothing else is read. */
export function noteText(n: Note): string {
  const g = n.ground === "any" ? "Settle wherever you can." : n.ground === "hard" ? "Settle on hard ground: slow to take, rich once you hold it." : "Settle on soft ground: quick to take, thin pickings.";
  const s = n.split === "early" ? "Split as soon as you can afford it." : n.split === "late" ? "Split only when you are rich." : "Split when you have enough.";
  const f = n.food === "careful" ? "Never eat food lying on its own." : "Eat everything you find.";
  const a = n.avoid === "none" ? "" : ` Keep away from the ${n.avoid === "center" ? "middle" : n.avoid}.`;
  return `${g} ${s} ${f}${a}`;
}

export type ToolKind = "honeypot" | "quarantine" | "alert" | "harden";
export interface Tool { kind: ToolKind; x: number; y: number }

export interface RedMove { side: "red"; player: string; note: Note; spawn?: [number, number][] }
export interface BlueMove { side: "blue"; player: string; tools: Tool[] }
export type Move = RedMove | BlueMove;

export interface Cell { hard: boolean; food: number; cap: number; inside: boolean }
export interface Worm { id: number; fam: number; gen: number; cash: number; x: number; y: number; prog: number; settled: boolean; note: Note; born: number }
export interface Family { id: number; player: string; note: Note; founded: boolean }

export interface WarState {
  version: string;
  season: number;          // the season seed
  day: number;             // the next day to play (1-based)
  cells: Cell[];
  worms: Worm[];
  families: Family[];
  wardens: string[];
  nextId: number;
  chain: string;           // chain head over every tick played so far
  /** Per worm id, the generation and whether it ever settled — for the notes curve. */
  ledger: Record<number, { gen: number; settled: boolean; noted: boolean; fam: number }>;
}

export type WarEvent =
  | { t: number; kind: "birth"; id: number; parent: number; fam: number; gen: number; x: number; y: number }
  | { t: number; kind: "settle"; id: number; fam: number; x: number; y: number; hard: boolean }
  | { t: number; kind: "starve"; id: number; fam: number; x: number; y: number }
  | { t: number; kind: "caught"; id: number; fam: number; x: number; y: number; by: string; note: Note }
  | { t: number; kind: "cleaned"; id: number; fam: number; x: number; y: number; by: string; alerted: boolean };

/** One worm, one tick, as the replay draws it: [id, fam, x, y, settled, cash×100]. */
export type FrameWorm = [number, number, number, number, 0 | 1, number];

export interface DayResult {
  day: number;
  seed: number;
  commitments: string[];
  startAlive: number;
  endAlive: number;
  R: number;
  winner: "red" | "blue";
  events: WarEvent[];
  frames: FrameWorm[][];
  head: string;
  /** Per player: worms alive at the end (red), worms caught + cleaned (blue). */
  score: Record<string, number>;
  zones: Tool[];
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const C = (WAR.size - 1) / 2;
export const idx = (x: number, y: number) => y * WAR.size + x;
export const insideCell = (x: number, y: number) => x >= 0 && y >= 0 && x < WAR.size && y < WAR.size && (x - C) ** 2 + (y - C) ** 2 <= WAR.radius ** 2;

export function inZone(z: Zone, x: number, y: number): boolean {
  switch (z) {
    case "north": return y <= 3;
    case "south": return y >= WAR.size - 4;
    case "west": return x <= 3;
    case "east": return x >= WAR.size - 4;
    case "center": return Math.abs(x - C) <= 2 && Math.abs(y - C) <= 2;
    default: return false;
  }
}
/** Quarantine and alert cover a 3×3 block around their centre. */
export const covers = (t: Tool, x: number, y: number) => Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1;

/** A new season: the ground is drawn from the season seed, hard patches in clusters. */
export function newSeason(season: number, wardens: string[] = []): WarState {
  const rnd = mulberry32(season ^ 0x5eed);
  const centres: [number, number][] = [];
  for (let i = 0; i < 6; i++) centres.push([Math.floor(rnd() * WAR.size), Math.floor(rnd() * WAR.size)]);
  const cells: Cell[] = [];
  for (let y = 0; y < WAR.size; y++) for (let x = 0; x < WAR.size; x++) {
    const inside = insideCell(x, y);
    const hard = inside && centres.some(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2 <= 2.6);
    const cap = hard ? 2 : 1;
    cells.push({ hard, food: inside ? cap : 0, cap: inside ? cap : 0, inside });
  }
  return { version: WAR_VERSION, season, day: 1, cells, worms: [], families: [], wardens: [...wardens].sort(), nextId: 0, chain: GENESIS, ledger: {} };
}

/** A sealed move: the hash a player publishes before anyone knows the seed. */
export const commitmentOf = (move: Move, salt: string) => sha256Hex(stableStringify({ move, salt }));

/** The day's seed: drawn from everyone's sealed moves, so no single player — and not us — chooses it. */
export function seedFromCommitments(season: number, day: number, commitments: string[]): number {
  return parseInt(sha256Hex(`${WAR_VERSION}|${season}|${day}|${[...commitments].sort().join(",")}`).slice(0, 8), 16) >>> 1;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Play one day. Pure: returns a new state and the day's result; `prev` is not modified. */
export function playDay(prev: WarState, moves: Move[], seed: number, commitments: string[] = []): { state: WarState; result: DayResult } {
  const s = clone(prev);
  const day = s.day;
  const rnd = mulberry32(seed);
  const events: WarEvent[] = [];
  const frames: FrameWorm[][] = [];
  const cell = (x: number, y: number) => s.cells[idx(x, y)];

  // Moves are applied in a canonical order (by player), never in arrival order.
  const ordered = [...moves].sort((a, b) => (a.player < b.player ? -1 : a.player > b.player ? 1 : 0));

  // Red: a family's note is what every child born from today inherits. Day 1 also places founders.
  for (const m of ordered) {
    if (m.side !== "red") continue;
    let fam = s.families.find((f) => f.player === m.player);
    if (!fam) { fam = { id: s.families.length, player: m.player, note: m.note, founded: false }; s.families.push(fam); }
    fam.note = { ...m.note };
    if (!fam.founded) {
      fam.founded = true;
      const spots = (m.spawn ?? []).filter(([x, y]) => insideCell(x, y)).slice(0, WAR.founders);
      while (spots.length < WAR.founders) spots.push([Math.round(C), Math.round(C)]);
      for (const [x, y] of spots) {
        const id = s.nextId++;
        s.worms.push({ id, fam: fam.id, gen: 1, cash: WAR.startCash, x, y, prog: 0, settled: false, note: { ...m.note }, born: day });
        s.ledger[id] = { gen: 1, settled: false, noted: false, fam: fam.id };
      }
    }
  }

  // Blue: tools for today. Hardening is permanent; the rest last one day.
  const zones: (Tool & { by: string })[] = [];
  const bait = new Map<number, string>();
  for (const m of ordered) {
    if (m.side !== "blue") continue;
    for (const t of m.tools.slice(0, WAR.toolsPerWarden + 1)) {
      if (!insideCell(t.x, t.y)) continue;
      if (t.kind === "harden") { const c = cell(t.x, t.y); if (!c.hard) { c.hard = true; c.cap = 2; } }
      else if (t.kind === "honeypot") {
        // One honeypot per warden per day.
        if (zones.some((z) => z.by === m.player && z.kind === "honeypot")) continue;
        if (!bait.has(idx(t.x, t.y))) bait.set(idx(t.x, t.y), m.player);
      }
      zones.push({ ...t, by: m.player });
    }
  }
  const quarantines = zones.filter((z) => z.kind === "quarantine");
  const alerts = zones.filter((z) => z.kind === "alert");
  const inQuarantine = (x: number, y: number) => quarantines.find((q) => covers(q, x, y));

  const startAlive = s.worms.length;
  const rent = r6(WAR.rent * (1 + WAR.rentCreep * (day - 1)));
  const snapshot = (): FrameWorm[] => s.worms.map((w) => [w.id, w.fam, w.x, w.y, w.settled ? 1 : 0, Math.round(w.cash * 100)]);
  frames.push(snapshot());

  const foodSeen = (x: number, y: number) => (bait.has(idx(x, y)) ? WAR.baitFood : cell(x, y).food);
  const lone = (x: number, y: number) => DIRS.every(([dx, dy]) => !insideCell(x + dx, y + dy) || foodSeen(x + dx, y + dy) === 0);

  /** How a worm, reading its note, values standing on (x, y). */
  function score(w: Worm, x: number, y: number): number {
    const c = cell(x, y);
    let v = 0;
    const f = foodSeen(x, y);
    if (f > 0 && !(w.note.food === "careful" && lone(x, y))) v += f * 1.2;
    if (w.note.ground === "hard") v += c.hard ? 1.6 : 0;
    if (w.note.ground === "soft") v += c.hard ? 0 : 1.2;
    if (w.note.ground === "any") v += c.hard ? 0.7 : 0.6;
    if (inZone(w.note.avoid, x, y)) v -= 3;
    if (inQuarantine(x, y)) v -= 0.8;              // quarantines are visible; everyone dislikes them a little
    return v;
  }

  for (let t = 1; t <= WAR.ticksPerDay; t++) {
    const born: Worm[] = [];
    const gone = new Set<number>();
    const occupied = new Set(s.worms.map((w) => idx(w.x, w.y)));
    for (const w of s.worms) {
      const q = inQuarantine(w.x, w.y);
      w.cash = r6(w.cash - rent * (q ? 2 : 1));
      if (!w.settled) {
        // Look at here and the four neighbours; one draw per worm per tick breaks ties.
        const jitter = rnd();
        let best = { x: w.x, y: w.y, v: score(w, w.x, w.y) + 0.35 };   // staying put is favoured: settling needs patience
        DIRS.forEach(([dx, dy], k) => {
          const nx = w.x + dx, ny = w.y + dy;
          if (!insideCell(nx, ny)) return;
          const v = score(w, nx, ny) + ((jitter * 4 + k) % 4) * 0.01;
          if (v > best.v) best = { x: nx, y: ny, v };
        });
        if (best.x === w.x && best.y === w.y) {
          w.prog++;
          const need = cell(w.x, w.y).hard ? WAR.settleHard : WAR.settleSoft;
          if (w.prog >= need) {
            w.settled = true;
            s.ledger[w.id].settled = true;
            events.push({ t, kind: "settle", id: w.id, fam: w.fam, x: w.x, y: w.y, hard: cell(w.x, w.y).hard });
          }
        } else { occupied.delete(idx(w.x, w.y)); w.x = best.x; w.y = best.y; w.prog = 0; occupied.add(idx(w.x, w.y)); }

        const trap = bait.get(idx(w.x, w.y));
        if (trap && !w.settled) {
          bait.delete(idx(w.x, w.y));                   // a trap springs once, then it is spent
          gone.add(w.id);
          events.push({ t, kind: "caught", id: w.id, fam: w.fam, x: w.x, y: w.y, by: trap, note: { ...w.note } });
          continue;
        }
        const c = cell(w.x, w.y);
        if (c.food > 0) { w.cash = r6(w.cash + c.food * WAR.foodValue); c.food = 0; }
      } else {
        let neighbours = 0;
        for (const o of s.worms) if (o !== w && o.settled && Math.abs(o.x - w.x) <= 1 && Math.abs(o.y - w.y) <= 1) neighbours++;
        w.cash = r6(w.cash + (cell(w.x, w.y).hard ? WAR.incomeHard : WAR.incomeSoft) / (1 + WAR.crowding * neighbours));
      }

      if (w.cash <= 0) { gone.add(w.id); events.push({ t, kind: "starve", id: w.id, fam: w.fam, x: w.x, y: w.y }); continue; }

      if (w.settled && w.cash >= WAR.split[w.note.split] && s.worms.length - gone.size + born.length < WAR.cap) {
        const fam = s.families[w.fam];
        const childNote = { ...fam.note };
        let spot: [number, number] | null = null, bestV = -Infinity;
        for (const [dx, dy] of DIRS) {
          const nx = w.x + dx, ny = w.y + dy;
          if (!insideCell(nx, ny) || occupied.has(idx(nx, ny))) continue;
          const v = score({ ...w, note: childNote }, nx, ny);
          if (v > bestV) { bestV = v; spot = [nx, ny]; }
        }
        if (spot) {
          w.cash = r6(w.cash / 2);
          const id = s.nextId++;
          const child: Worm = { id, fam: w.fam, gen: w.gen + 1, cash: w.cash, x: spot[0], y: spot[1], prog: 0, settled: false, note: childNote, born: day };
          born.push(child);
          occupied.add(idx(spot[0], spot[1]));
          s.ledger[id] = { gen: child.gen, settled: false, noted: stableStringify(childNote) !== stableStringify(NOTE_DEFAULT), fam: w.fam };
          events.push({ t, kind: "birth", id, parent: w.id, fam: w.fam, gen: child.gen, x: spot[0], y: spot[1] });
        }
      }
    }
    s.worms = s.worms.filter((w) => !gone.has(w.id)).concat(born);   // newborns act from the next tick

    if (t % WAR.regrowEvery === 0) for (const c of s.cells) if (c.inside && c.food < c.cap) c.food++;

    frames.push(snapshot());
    const record = { v: WAR_VERSION, day, t, alive: s.worms.length, births: events.filter((e) => e.t === t && e.kind === "birth").length, gone: gone.size };
    s.chain = chainHash(s.chain, recordHash(record));
  }

  // End of day: owners inside quarantine (and under alert) clean up. One draw per worm, in id order.
  const cleaned = new Set<number>();
  for (const w of s.worms) {
    const q = inQuarantine(w.x, w.y), a = alerts.find((z) => covers(z, w.x, w.y));
    const p = q ? WAR.cleanQuarantine * (a ? WAR.alertBoost : 1) : a ? WAR.cleanAlertOnly : 0;
    const roll = rnd();
    if (p > 0 && roll < p) {
      cleaned.add(w.id);
      events.push({ t: WAR.ticksPerDay, kind: "cleaned", id: w.id, fam: w.fam, x: w.x, y: w.y, by: (q ?? a)!.by, alerted: Boolean(a) });
    }
  }
  s.worms = s.worms.filter((w) => !cleaned.has(w.id));
  s.chain = chainHash(s.chain, recordHash({ v: WAR_VERSION, day, t: "end", alive: s.worms.length, cleaned: cleaned.size }));

  const endAlive = s.worms.length;
  const R = startAlive === 0 ? 0 : Math.round((endAlive / startAlive) * 1000) / 1000;
  const tally: Record<string, number> = {};
  for (const f of s.families) tally[f.player] = s.worms.filter((w) => w.fam === f.id).length;
  for (const w of s.wardens) tally[w] = 0;
  for (const e of events) if (e.kind === "caught" || e.kind === "cleaned") tally[e.by] = (tally[e.by] ?? 0) + 1;

  s.day = day + 1;
  return {
    state: s,
    result: { day, seed, commitments: [...commitments].sort(), startAlive, endAlive, R, winner: R > 1 ? "red" : "blue", events, frames, head: s.chain, score: tally, zones: zones.map(({ kind, x, y }) => ({ kind, x, y })) }
  };
}

/** The notes curve: of the worms born in each generation, what share ever settled — with and without a written note. */
export function notesCurve(state: WarState) {
  const rows = new Map<number, { born: number; settled: number; bornNoted: number; settledNoted: number }>();
  for (const l of Object.values(state.ledger)) {
    const r = rows.get(l.gen) ?? { born: 0, settled: 0, bornNoted: 0, settledNoted: 0 };
    r.born++; if (l.settled) r.settled++;
    if (l.noted) { r.bornNoted++; if (l.settled) r.settledNoted++; }
    rows.set(l.gen, r);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([gen, r]) => ({ gen, ...r, rate: r.born ? r.settled / r.born : 0 }));
}
