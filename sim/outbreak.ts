/* ── sim/outbreak.ts ─────────────────────────────────────────────────────────
   OUTBREAK — the real-time roguelite on WORM's rules.

   Same dish, same economy as the Red vs Blue day (sim/war.ts), played live:
   twenty ticks a second, forty seconds a day, seven days and then endless.

     WORM side    You steer the lead worm. Eat, burrow to settle and earn, dash
                  through the drone's strike. Every worm that saves enough splits;
                  children follow the NOTE they were born with. Keep R ≥ 1.
     WARDEN side  You fly the drone and play tools from an energy bar: honeypot,
                  quarantine, alert, harden. Keep R < 1. Don't let it hit the lid.

   After each day you draft 1 card of 3; the house drafts for the other side.

   Discipline, as everywhere in this repository:
     - No Math.random, no clock. One generator, drawn in a fixed order.
     - No Math.sin/cos/atan2: headings are integers (1024 to a turn) and the trig
       is a fixed polynomial, so every JavaScript engine gets the same bits.
     - Positions and balances rounded to 1e-6 every step.
     - The whole run is a pure function of (seed, side, notes, inputs, picks).
       A run code is that record; replay() re-plays it and gives the same heads.
   --------------------------------------------------------------------------- */

import { chainHash, GENESIS, recordHash } from "./hash";
import { CARDS, cardById, WARDEN_MODS, WORM_MODS, type Card, type WardenMods, type WormMods } from "./outbreak-cards";
import { NOTE_DEFAULT, type Note, type Zone } from "./war";

export const OUTBREAK_VERSION = "outbreak/2";

export const O = {
  tps: 20,
  dayTicks: 800,            // 40 s
  days: 7,
  grid: 16,
  cell: 0.125,              // the dish spans −1…1
  rim: 0.95,
  cap: 240,
  strikes: 3,
  startCash: 3.5,
  rent: 0.12,               // per second, rising 12% of itself each day
  rentCreep: 0.2,
  incomeSoft: 0.22,         // per second once settled
  incomeHard: 0.42,
  crowding: 0.3,
  cellCap: 3,
  settleSoft: 20,           // ticks
  settleHard: 50,
  split: { early: 5, normal: 6.5, late: 9 } as const,
  food: 0.55,
  foodMax: 44,
  regrowEvery: 45,
  eatR: 0.045,
  leadSpeed: 0.36,          // per second
  leadIncome: 1.5,          // the worm you steer earns half again: it's the one that reads the dish
  childSpeed: 0.24,
  turn: 70,                 // heading units per tick
  dash: { ticks: 5, dist: 0.26, cd: 80 },
  drone: {
    ai: { speed: 0.2, perDay: 0.02, cd: 150, cdPerDay: 12, cdMin: 70, tele: 16, dash: 8, len: 0.55, hitR: 0.06 },
    me: { speed: 0.34, cd: 50, tele: 10, dash: 6, len: 0.5, hitR: 0.06 }
  },
  quarantine: { tele: 40, live: 220, clean: 0.4 },
  alert: { tele: 30, live: 220, r: 0.32, boost: 92 / 74 },
  harden: { tele: 20 },
  energy: { max: 10, start: 8, regen: 0.9 },
  cost: { honeypot: 2, quarantine: 4, alert: 3, harden: 2 } as Record<ToolKind, number>,
  /* Past the paper. Each day after the seventh is a year after it (day 8 = 2027).
     These are OUR extrapolations, marked as such everywhere they show:
       setup    — the paper's bottleneck was setting up on new hardware, and it put
                  small models on a capability trend (+13.7 ECI a year). We let setup
                  get 15% faster every year.
       signature— the paper's honeypots capture the payload for analysis; from 2027
                  defenders turn every captured note into a signature.
       gossip   — the paper's notes only went down a lineage; from 2028 worms sharing
                  a machine copy each other's notes.
       targets  — the paper set "finding targets" aside as already shown; from 2029
                  worms sense food twice as far.                                    */
  /* Setting up can fail — the paper's central measurement. A child's chance of a
     working setup starts at 45% in the first generation and climbs as notes are
     inherited, levelling near 75% (the paper: 45% → 61–84% by generation six).
     Each capability year removes 15% of the remaining failures. The lead — the
     worm you steer — always sets up: you are its operator. */
  setup: { base: 0.45, gain: 0.3, failCutPerYear: 0.85 },
  forecast: { firstYear: 2026, setupPerYear: 0.85, signatureFrom: 1, gossipFrom: 2, targetsFrom: 3, signedSweep: 1.5, gossipEvery: 100 }
} as const;

export type Side = "worm" | "warden";
export type ToolKind = "honeypot" | "quarantine" | "alert" | "harden";
export type Cause = "starve" | "honeypot" | "swept" | "drone";

export interface OWorm {
  id: number; gen: number; x: number; y: number; h: number; cash: number;
  st: 0 | 1 | 2;            // crawling · settling · settled
  prog: number; cell: number; note: number; lead: boolean; born: number;
  tx: number; ty: number; aim: number; inv: number; dashT: number;
}
export interface Pellet { id: number; x: number; y: number; bait: number }
export interface OTool { id: number; kind: ToolKind; x: number; y: number; size: number; r: number; at: number; arm: number; end: number; done: boolean; cells: number[] }
export interface Drone { x: number; y: number; h: number; phase: 0 | 1 | 2; t: number; cd: number; lh: number; n: number }

export type OEvent =
  | { k: "born"; id: number; x: number; y: number; lead?: boolean }
  | { k: "died"; id: number; x: number; y: number; cause: Cause; lead: boolean }
  | { k: "eat"; id: number; x: number; y: number; v: number }
  | { k: "settled"; id: number; x: number; y: number }
  | { k: "tool"; kind: ToolKind; x: number; y: number }
  | { k: "armed"; kind: ToolKind; x: number; y: number }
  | { k: "sweep"; kind: ToolKind; x: number; y: number; n: number }
  | { k: "strike"; x: number; y: number; h: number }
  | { k: "lead"; id: number; x: number; y: number }
  | { k: "read"; note: Note }
  | { k: "patch"; n: number }
  | { k: "dash"; x: number; y: number }
  | { k: "setupFailed"; id: number; x: number; y: number; gen: number };

export interface TickInput {
  h: number;           // WORM: where the lead heads; WARDEN: where the drone heads. −1: carry on
  burrow: boolean;     // WORM: hold to settle the lead where it is
  rally: boolean;      // WORM: crawling worms come to the lead
  dash: boolean;       // WORM: one-shot dash
  strike: number;      // WARDEN: one-shot strike along this heading, −1: none
  place: { kind: ToolKind; x: number; y: number } | null;   // WARDEN: one-shot
}
export const IDLE: TickInput = { h: -1, burrow: false, rally: false, dash: false, strike: -1, place: null };

export interface DayReport {
  day: number; startAlive: number; endAlive: number; R: number; births: number;
  deaths: Record<Cause, number>; stopped: number; strike: boolean; chips: number; mult: number; points: number;
  maxGen: number; head: string; aiCard: string | null; reachedCap: boolean;
}

export interface OState {
  v: string; seed: number; side: Side; r: number;
  day: number; tick: number; T: number;
  hard: boolean[]; inside: boolean[];
  worms: OWorm[]; pellets: Pellet[]; patches: [number, number][]; tools: OTool[]; drone: Drone;
  notes: Note[]; note: number; nextId: number;
  worm: WormMods; warden: WardenMods; cards: { worm: string[]; warden: string[] };
  energy: number; dashCd: number;
  startAlive: number; births: number; deaths: Record<Cause, number>;
  plan: { t: number; kind: ToolKind }[];
  read: Note | null;         // the note the wardens have read (honeypot, sniffer)
  signed: string[];          // notes turned into signatures (canonical JSON)
  eraBase: number;           // capability years already elapsed at day 1 (0 in play; the forecast study sets it)
  study: boolean;            // forecast study: no strikes, no drafts — the same seven days for every scenario
  setupTries: number[]; setupOk: number[];   // by generation: the paper's measurement, kept as the run goes
  strikes: number; score: number; head: string; reports: DayReport[];
  over: null | "extinct" | "contained" | "outbreak" | "eradicated" | "won";
  endless: boolean; dayOver: boolean; reachedCap: boolean; boss: boolean;
  offers: string[]; events: OEvent[]; maxGen: number;
}

/* ── determinism helpers ─────────────────────────────────────────────────── */

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const r2 = (x: number) => Math.round(x * 100) / 100;
const PI = 3.141592653589793;
export const DIRS = 1024;

function dsin(x: number): number {
  if (x > PI / 2) x = PI - x; else if (x < -PI / 2) x = -PI - x;
  const x2 = x * x; let term = x, sum = x;
  for (let k = 1; k <= 9; k++) { term = (-term * x2) / ((2 * k) * (2 * k + 1)); sum += term; }
  return Math.round(sum * 1e9) / 1e9;
}
const SIN: number[] = [], COS: number[] = [];
for (let i = 0; i < DIRS; i++) SIN[i] = dsin(((i <= DIRS / 2 ? i : i - DIRS) * 2 * PI) / DIRS);
for (let i = 0; i < DIRS; i++) COS[i] = SIN[(i + DIRS / 4) % DIRS];
export const sinOf = (h: number) => SIN[((h % DIRS) + DIRS) % DIRS];
export const cosOf = (h: number) => COS[((h % DIRS) + DIRS) % DIRS];

function datan(z: number): number {
  const z2 = z * z;
  return z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.0117212)))));
}
/** The integer heading from (0,0) towards (dx,dy). y grows downwards. */
export function headingTo(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let a = ax >= ay ? datan(ay / ax) : PI / 2 - datan(ax / ay);
  if (dx < 0) a = PI - a;
  if (dy < 0) a = -a;
  const h = Math.round((a / (2 * PI)) * DIRS);
  return ((h % DIRS) + DIRS) % DIRS;
}
const turnToward = (h: number, target: number, rate: number) => {
  const d = (((target - h) % DIRS) + DIRS + DIRS / 2) % DIRS - DIRS / 2;
  return (((h + Math.max(-rate, Math.min(rate, d))) % DIRS) + DIRS) % DIRS;
};

function rnd(s: OState): number {
  let t = (s.r = (s.r + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickInt = (s: OState, n: number) => Math.floor(rnd(s) * n);

/* ── geometry ────────────────────────────────────────────────────────────── */

export const cellX = (c: number) => r6(-1 + ((c % O.grid) + 0.5) * O.cell);
export const cellY = (c: number) => r6(-1 + (Math.floor(c / O.grid) + 0.5) * O.cell);
export const cellAt = (x: number, y: number) => {
  const cx = Math.max(0, Math.min(O.grid - 1, Math.floor((x + 1) / O.cell)));
  const cy = Math.max(0, Math.min(O.grid - 1, Math.floor((y + 1) / O.cell)));
  return cy * O.grid + cx;
};
const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const inDish = (x: number, y: number) => x * x + y * y <= O.rim * O.rim;
export function inZone(z: Zone, x: number, y: number) {
  if (z === "none") return false;
  if (z === "north") return y < -0.35;
  if (z === "south") return y > 0.35;
  if (z === "west") return x < -0.35;
  if (z === "east") return x > 0.35;
  return x * x + y * y < 0.16;
}
/** Is (x,y) inside a box/circle tool? */
export function covers(t: OTool, x: number, y: number): boolean {
  if (t.kind === "alert") return d2(t.x, t.y, x, y) <= t.r * t.r;
  const half = (t.size * O.cell) / 2;
  return Math.abs(x - t.x) <= half && Math.abs(y - t.y) <= half;
}
const live = (s: OState, t: OTool) => !t.done && s.tick >= t.arm && s.tick < t.end;

/* ── a new run ───────────────────────────────────────────────────────────── */

/** Years past the paper: 0 for the seven-day week, then one a day. */
export const eraOf = (s: OState) => s.eraBase + Math.max(0, s.day - O.days);
export const yearOf = (s: OState) => O.forecast.firstYear + eraOf(s);
/** Which extrapolations are switched on, for the HUD and the forecast page. */
export function forecastOf(s: OState) {
  const e = eraOf(s), F = O.forecast;
  return { era: e, year: yearOf(s), setup: Math.pow(F.setupPerYear, e), signatures: s.warden.signature || e >= F.signatureFrom, gossip: s.worm.gossip || e >= F.gossipFrom, targets: e >= F.targetsFrom };
}
/** The chance a child's setup works: rises with inherited notes (generation) and with capability (years). */
export const setupChance = (s: OState, gen: number) => {
  const S = O.setup, p = S.base + S.gain * (1 - Math.pow(0.5, gen));
  return 1 - (1 - p) * Math.pow(S.failCutPerYear, eraOf(s));
};
export const settleTicks = (s: OState, hard: boolean) => Math.max(4, Math.round((hard ? O.settleHard : O.settleSoft) * s.worm.settleMul * Math.pow(O.forecast.setupPerYear, eraOf(s))));
const noteKey = (n: Note) => `${n.ground}|${n.split}|${n.food}|${n.avoid}`;

export function newRun(seed: number, side: Side, opts: { era?: number; study?: boolean } = {}): OState {
  const s: OState = {
    v: OUTBREAK_VERSION, seed: seed >>> 0, side, r: seed | 0,
    day: 0, tick: 0, T: 0, hard: [], inside: [], worms: [], pellets: [], patches: [], tools: [],
    drone: { x: 0, y: -0.8, h: 256, phase: 0, t: 0, cd: 60, lh: 0, n: 0 },
    notes: [{ ...NOTE_DEFAULT }], note: 0, nextId: 1,
    worm: { ...WORM_MODS }, warden: { ...WARDEN_MODS }, cards: { worm: [], warden: [] },
    energy: 0, dashCd: 0, startAlive: 0, births: 0, deaths: { starve: 0, honeypot: 0, swept: 0, drone: 0 },
    plan: [], read: null, signed: [], eraBase: Math.max(0, Math.floor(opts.era ?? 0)), study: Boolean(opts.study), setupTries: [], setupOk: [], strikes: 0, score: 0, head: GENESIS, reports: [], over: null, endless: false, dayOver: false, reachedCap: false, boss: false,
    offers: [], events: [], maxGen: 0
  };
  for (let c = 0; c < O.grid * O.grid; c++) { s.inside.push(inDish(cellX(c), cellY(c)) && cellX(c) ** 2 + cellY(c) ** 2 <= 0.86); s.hard.push(false); }
  // Hard ground comes in outcrops: a few blobs, about a third of the dish.
  for (let b = 0; b < 6; b++) {
    const cx = 2 + pickInt(s, O.grid - 4), cy = 2 + pickInt(s, O.grid - 4), rad = 1.2 + rnd(s) * 1.6;
    for (let c = 0; c < O.grid * O.grid; c++) if ((c % O.grid - cx) ** 2 + (Math.floor(c / O.grid) - cy) ** 2 <= rad * rad) s.hard[c] = true;
  }
  const founders = side === "worm" ? 2 : 8;
  for (let i = 0; i < founders; i++) {
    const a = pickInt(s, DIRS), d = side === "worm" ? 0.12 * i : 0.35 + rnd(s) * 0.4;
    spawn(s, r6(cosOf(a) * d), r6(sinOf(a) * d), O.startCash, 0, side === "worm" && i === 0);
  }
  if (side === "warden") s.notes[0] = botNote(s);
  return s;
}

function spawn(s: OState, x: number, y: number, cash: number, gen: number, lead = false, note = s.note): OWorm {
  const w: OWorm = { id: s.nextId++, gen, x, y, h: pickInt(s, DIRS), cash: r6(cash), st: 0, prog: 0, cell: -1, note, lead, born: s.T, tx: x, ty: y, aim: -1, inv: 0, dashT: 0 };
  s.worms.push(w);
  s.maxGen = Math.max(s.maxGen, gen);
  s.events.push({ k: "born", id: w.id, x, y, ...(lead ? { lead } : {}) });
  return w;
}

function botNote(s: OState): Note {
  const g = ["soft", "hard", "any"] as const, sp = ["early", "normal", "late"] as const, f = ["greedy", "careful"] as const, z = ["none", "none", "north", "south", "east", "west"] as const;
  return { ground: g[pickInt(s, 3)], split: sp[pickInt(s, 3)], food: f[pickInt(s, 2)], avoid: z[pickInt(s, z.length)] };
}

/* ── a day ───────────────────────────────────────────────────────────────── */

/** Start the next day. On the worm side, `note` is what every child born today will carry. */
export function beginDay(s: OState, note?: Note) {
  if (s.over && !(s.over === "won" && s.endless)) throw new Error("the run is over");
  if (s.over === "won") s.over = null;
  s.day++; s.tick = 0; s.dayOver = false; s.offers = []; s.events = [];
  if (s.side === "worm" && note) { s.notes.push({ ...note }); s.note = s.notes.length - 1; }
  for (const w of s.worms) if (w.lead) w.note = s.note;
  // Warden side: every morning new infections arrive from outside the dish, at the rim.
  if (s.side === "warden" && s.day > 1) for (let i = 0; i < 1 + s.day; i++) {
    const a = pickInt(s, DIRS);
    spawn(s, r6(cosOf(a) * 0.82), r6(sinOf(a) * 0.82), O.startCash, 0);
  }
  s.startAlive = s.worms.length; s.births = 0; s.deaths = { starve: 0, honeypot: 0, swept: 0, drone: 0 }; s.reachedCap = false;
  s.tools = []; s.pellets = []; s.patches = [];
  for (let p = 0; p < 7; p++) {
    const a = pickInt(s, DIRS), d = 0.25 + rnd(s) * 0.6;
    const px = r6(cosOf(a) * d), py = r6(sinOf(a) * d);
    s.patches.push([px, py]);
    const n = 3 + pickInt(s, 3);
    for (let i = 0; i < n; i++) addPellet(s, px, py, 0);
  }
  // Day one is a grace period: the house drone holds fire for the first fifteen seconds.
  s.drone = { x: 0, y: -0.85, h: 256, phase: 0, t: 0, cd: s.side === "worm" ? (s.day === 1 ? 300 : 60) : 0, lh: 0, n: 0 };
  s.dashCd = 0;
  if (s.side === "warden") s.energy = r6(O.energy.start * s.warden.energyMul);
  if (s.side === "warden" && s.warden.sniffer) s.read = { ...s.notes[s.note] };
  // The house wardens' plan for the day: more tools every day, spread over it.
  s.plan = [];
  s.boss = s.day % O.days === 0;
  if (s.side === "worm") {
    const n = Math.round((s.boss ? 1.5 : 1) * Math.min(30, 1 + Math.floor(s.day * 1.6) + s.warden.extraTools + Math.floor(s.worms.length / 6)));
    const cycle: ToolKind[] = ["quarantine", "honeypot", "alert", "quarantine", "harden", "honeypot", "quarantine", "alert", "honeypot", "quarantine", "quarantine", "alert", "honeypot", "quarantine"];
    for (let k = 0; k < n; k++) s.plan.push({ t: 50 + Math.floor((k * 640) / n), kind: cycle[(k + s.day) % cycle.length] });
  }
}

function addPellet(s: OState, x: number, y: number, bait: number) {
  for (let tries = 0; tries < 6; tries++) {
    const a = pickInt(s, DIRS), d = bait ? 0 : rnd(s) * 0.08;
    const px = r6(x + cosOf(a) * d), py = r6(y + sinOf(a) * d);
    if (inDish(px, py)) { s.pellets.push({ id: s.nextId++, x: px, y: py, bait }); return; }
  }
}

const rentNow = (s: OState) => (O.rent * (1 + O.rentCreep * (s.day - 1))) / O.tps;
const splitAt = (s: OState, n: Note) => O.split[n.split] * s.worm.splitMul;

function kill(s: OState, w: OWorm, cause: Cause) {
  const i = s.worms.indexOf(w);
  if (i < 0) return;
  s.worms.splice(i, 1);
  s.deaths[cause]++;
  s.events.push({ k: "died", id: w.id, x: w.x, y: w.y, cause, lead: w.lead });
  if (cause !== "starve" && s.worm.martyr) for (const o of s.worms) if (o.st === 0) o.cash = r6(o.cash + 0.4);
  if (w.lead && s.worms.length) {
    let next = s.worms[0];
    for (const o of s.worms) if (o.cash > next.cash || (o.cash === next.cash && o.id < next.id)) next = o;
    next.lead = true; next.st = 0; next.prog = 0; next.cell = -1; next.inv = 30;
    if (s.worm.secondWind) { next.cash = r6(next.cash + 3); next.inv = 60; }
    s.events.push({ k: "lead", id: next.id, x: next.x, y: next.y });
  }
}

/* ── one tick ────────────────────────────────────────────────────────────── */

export function step(s: OState, input: TickInput = IDLE) {
  if (s.dayOver) return;
  const wm = s.worm, wd = s.warden;
  const lead = s.side === "worm" ? s.worms.find((w) => w.lead) ?? null : null;

  // 1 — the warden's hand: the house plays its plan, or the player plays a card.
  if (s.side === "worm") for (const p of s.plan) if (p.t === s.tick) aiPlace(s, p.kind, lead);
  if (s.side === "warden") {
    s.energy = r6(Math.min(O.energy.max * wd.energyMul, s.energy + (O.energy.regen * wd.energyMul) / O.tps));
    if (input.place) {
      const k = input.place.kind, cost = k === "harden" ? wd.hardenCost : O.cost[k];
      if (s.energy >= cost && inDish(input.place.x, input.place.y)) { s.energy = r6(s.energy - cost); place(s, k, input.place.x, input.place.y); }
    }
  }

  const fc = forecastOf(s);
  // 2 — tools arm, sweep and expire.
  for (const t of s.tools) {
    if (t.done) continue;
    if (s.tick === t.arm) {
      s.events.push({ k: "armed", kind: t.kind, x: t.x, y: t.y });
      if (t.kind === "harden") {
        for (const c of t.cells) if (!s.hard[c]) { s.hard[c] = true; for (const w of s.worms) if (w.cell === c && w.st === 1) w.prog = 0; }
        t.done = true;
      }
    }
    if (s.tick === t.end && (t.kind === "quarantine" || t.kind === "alert")) {
      t.done = true;
      let p = 0;
      if (t.kind === "quarantine") {
        const alerted = s.tools.some((a) => a.kind === "alert" && s.tick >= a.arm && s.tick <= a.end && covers(a, t.x, t.y));
        p = O.quarantine.clean * (alerted ? O.alert.boost : 1) * wd.sweepMul;
      } else if (!s.tools.some((q) => q.kind === "quarantine" && s.tick >= q.arm && s.tick <= q.end && covers(q, t.x, t.y))) p = wd.alertAlone * wd.sweepMul;
      let n = 0;
      if (p > 0) for (const w of [...s.worms].sort((a, b) => a.id - b.id)) {
        if (!covers(t, w.x, w.y) || w.inv > 0) continue;
        let pw = w.st === 2 && wm.deepBurrow ? p / 2 : p;
        if (fc.signatures && s.signed.includes(noteKey(s.notes[w.note]))) pw = Math.min(1, pw * O.forecast.signedSweep);
        if (rnd(s) < pw) { kill(s, w, "swept"); n++; }
      }
      s.events.push({ k: "sweep", kind: t.kind, x: t.x, y: t.y, n });
    }
  }

  // 3 — Patch Tuesday.
  if ((wd.patch || (s.boss && s.side === "worm")) && s.tick === O.dayTicks / 2) {
    let n = 0;
    for (const w of s.worms) if (w.st === 2 && !s.hard[w.cell]) { w.st = 0; w.prog = 0; w.cell = -1; n++; }
    s.events.push({ k: "patch", n });
  }

  // 4 — the drone.
  droneStep(s, input, lead);

  // 5 — worms.
  const settledIn = new Array<number>(O.grid * O.grid).fill(0);
  for (const w of s.worms) if (w.st >= 1 && w.cell >= 0) settledIn[w.cell]++;
  const rent = rentNow(s) * wm.rentMul;
  const active = s.tools.filter((t) => live(s, t) && t.kind === "quarantine");
  const order = [...s.worms].sort((a, b) => a.id - b.id);
  const born: [OWorm, number][] = [];
  for (const w of order) {
    if (!s.worms.includes(w)) continue;
    if (w.inv > 0) w.inv--;
    const note = s.notes[w.note];
    const rallied = input.rally && lead && !w.lead && w.st === 0;
    // rent
    let pay = rent * (active.some((q) => covers(q, w.x, w.y)) ? 2 : 1);
    if (rallied && wm.swarmMind) pay /= 2;
    w.cash = r6(w.cash - pay);
    if (w.cash <= 0) { kill(s, w, "starve"); continue; }
    // income
    if (w.st === 2) {
      const base = s.hard[w.cell] ? O.incomeHard * wm.hardIncomeMul : O.incomeSoft;
      w.cash = r6(w.cash + ((base * wm.incomeMul * (w.lead ? O.leadIncome : 1)) / O.tps) / (1 + O.crowding * Math.max(0, settledIn[w.cell] - 1)));
    }
    // move
    if (w.lead) leadMove(s, w, input);
    else childMove(s, w, note, rallied ? lead : null, settledIn);
    // eat
    if (w.st === 0) for (let i = 0; i < s.pellets.length; i++) {
      const p = s.pellets[i];
      if (d2(p.x, p.y, w.x, w.y) > O.eatR * O.eatR) continue;
      if (p.bait > 0) {
        if (!w.lead && wm.baitSense) continue;
        if (w.inv > 0) continue;
        p.bait--; if (p.bait <= 0) s.pellets.splice(i, 1);
        s.read = { ...note }; s.events.push({ k: "read", note: { ...note } });
        if (fc.signatures && !s.signed.includes(noteKey(note))) s.signed.push(noteKey(note));
        kill(s, w, "honeypot");
      } else {
        s.pellets.splice(i, 1);
        const v = r6(O.food * wm.foodMul);
        w.cash = r6(w.cash + v);
        s.events.push({ k: "eat", id: w.id, x: p.x, y: p.y, v });
      }
      break;
    }
    if (!s.worms.includes(w)) continue;
    // split
    const cost = splitAt(s, s.notes[s.note]);
    const own = splitAt(s, note);
    const at = w.lead ? cost : own;
    if (s.worms.length + born.length < O.cap && w.cash >= at) {
      const three = wm.mitosis && w.cash >= at * 1.6;
      const parts = three ? 3 : 2;
      const share = r6(w.cash / parts);
      w.cash = share;
      for (let k = 1; k < parts; k++) born.push([w, share]);
    }
  }
  for (const [p, cash] of born) {
    if (s.worms.length >= O.cap) { s.reachedCap = true; break; }
    const a = pickInt(s, DIRS), d = 0.05 * s.worm.scatter;
    let x = r6(p.x + cosOf(a) * d), y = r6(p.y + sinOf(a) * d);
    if (!inDish(x, y)) { x = p.x; y = p.y; }
    // Notes are inherited: a child carries its parent's note. Your lead always carries the one you wrote today.
    spawn(s, x, y, cash + s.worm.brood, p.gen + 1, false, p.lead ? s.note : p.note);
    s.births++;
  }
  if (s.worms.length >= O.cap) s.reachedCap = true;

  // 5b — gossip: worms settled in the same cell copy the note of the richest one there.
  if (fc.gossip && s.tick % O.forecast.gossipEvery === 0) {
    const byCell = new Map<number, OWorm[]>();
    for (const w of s.worms) if (w.st === 2 && !w.lead) { const l = byCell.get(w.cell) ?? []; l.push(w); byCell.set(w.cell, l); }
    for (const group of byCell.values()) if (group.length > 1) {
      const rich = group.reduce((a, b) => (b.cash > a.cash || (b.cash === a.cash && b.id < a.id) ? b : a));
      for (const w of group) w.note = rich.note;
    }
  }

  // 6 — food grows back.
  if (s.tick % O.regrowEvery === 0 && s.pellets.filter((p) => !p.bait).length < O.foodMax && s.patches.length) {
    const [px, py] = s.patches[pickInt(s, s.patches.length)];
    addPellet(s, px, py, 0);
  }

  s.tick++; s.T++;
  if (s.dashCd > 0) s.dashCd--;
  const extinct = s.worms.length === 0;
  const lidOff = s.side === "warden" && s.worms.length >= O.cap;
  if (s.tick >= O.dayTicks || extinct || lidOff) s.dayOver = true;
}

function moveForward(w: OWorm, speed: number) {
  let x = r6(w.x + cosOf(w.h) * speed), y = r6(w.y + sinOf(w.h) * speed);
  if (!inDish(x, y)) { w.h = headingTo(-w.x, -w.y); x = w.x; y = w.y; }
  w.x = x; w.y = y;
}

function leadMove(s: OState, w: OWorm, input: TickInput) {
  if (w.dashT > 0) {
    w.dashT--;
    moveForward(w, O.dash.dist / O.dash.ticks);
    return;
  }
  if (input.dash && s.dashCd === 0) {
    w.dashT = O.dash.ticks; w.inv = Math.max(w.inv, O.dash.ticks + 2); w.st = 0; w.prog = 0; w.cell = -1;
    s.dashCd = Math.round(O.dash.cd * s.worm.dashCdMul);
    if (input.h >= 0) w.h = input.h;
    s.events.push({ k: "dash", x: w.x, y: w.y });
    return;
  }
  if (input.burrow) {
    const c = cellAt(w.x, w.y);
    if (w.st === 0) { w.st = 1; w.prog = 0; w.cell = c; }
    if (w.st === 1) {
      w.prog++;
      if (w.prog >= settleTicks(s, s.hard[c])) { w.st = 2; s.events.push({ k: "settled", id: w.id, x: w.x, y: w.y }); }
    }
    return;
  }
  if (w.st !== 0) { w.st = 0; w.prog = 0; w.cell = -1; }
  if (input.h >= 0) w.h = turnToward(w.h, input.h, O.turn);
  if (input.h >= 0) moveForward(w, (O.leadSpeed * s.worm.speedMul) / O.tps);
}

function childMove(s: OState, w: OWorm, note: Note, rally: OWorm | null, settledIn: number[]) {
  if (w.st === 1) {
    w.prog++;
    if (w.prog >= settleTicks(s, s.hard[w.cell])) {
      const g = Math.min(w.gen, 12);
      s.setupTries[g] = (s.setupTries[g] ?? 0) + 1;
      if (rnd(s) < setupChance(s, w.gen)) { w.st = 2; s.setupOk[g] = (s.setupOk[g] ?? 0) + 1; s.events.push({ k: "settled", id: w.id, x: w.x, y: w.y }); }
      else { s.events.push({ k: "setupFailed", id: w.id, x: w.x, y: w.y, gen: w.gen }); w.st = 0; w.prog = 0; w.cell = -1; w.aim = -1; w.h = (w.h + 512) % DIRS; }
    }
    return;
  }
  if (w.st === 2) return;
  const speed = (O.childSpeed * s.worm.speedMul * (rally && s.worm.swarmMind ? 1.4 : 1)) / O.tps;
  if (rally) {
    w.h = turnToward(w.h, headingTo(rally.x - w.x, rally.y - w.y), O.turn);
    if (d2(w.x, w.y, rally.x, rally.y) > 0.01) moveForward(w, speed);
    w.aim = -1;
    return;
  }
  // Pick a target: food in reach if the note allows, else the nearest free ground the note likes.
  if (w.aim < 0 || (s.tick + w.id) % 12 === 0) {
    w.aim = -1;
    let best = forecastOf(s).targets ? 0.36 : 0.09;
    for (const p of s.pellets) {
      if (p.bait > 0 && s.worm.baitSense) continue;
      const dd = d2(p.x, p.y, w.x, w.y);
      if (dd >= best) continue;
      if (note.food === "careful" && !s.pellets.some((q) => q !== p && d2(q.x, q.y, p.x, p.y) < 0.0225)) continue;
      if (inZone(note.avoid, p.x, p.y)) continue;
      best = dd; w.tx = p.x; w.ty = p.y; w.aim = 9999;
    }
    if (w.aim < 0) {
      let bestC = -1, bestD = 99;
      for (let c = 0; c < O.grid * O.grid; c++) {
        if (!s.inside[c] || settledIn[c] >= O.cellCap) continue;
        if (note.ground === "soft" && s.hard[c]) continue;
        if (note.ground === "hard" && !s.hard[c]) continue;
        const x = cellX(c), y = cellY(c);
        if (inZone(note.avoid, x, y)) continue;
        const dd = d2(x, y, w.x, w.y);
        if (dd < bestD) { bestD = dd; bestC = c; }
      }
      if (bestC < 0) for (let c = 0; c < O.grid * O.grid; c++) {   // nothing the note likes: take anything
        if (!s.inside[c] || settledIn[c] >= O.cellCap) continue;
        const dd = d2(cellX(c), cellY(c), w.x, w.y);
        if (dd < bestD) { bestD = dd; bestC = c; }
      }
      if (bestC >= 0) { w.aim = bestC; w.tx = cellX(bestC); w.ty = cellY(bestC); }
    }
  }
  if (w.aim >= 0 && w.aim !== 9999 && d2(w.x, w.y, w.tx, w.ty) < 0.0016) {
    if (settledIn[w.aim] < O.cellCap) { w.st = 1; w.prog = 0; w.cell = w.aim; settledIn[w.aim]++; return; }
    w.aim = -1; return;
  }
  if (w.aim >= 0) w.h = turnToward(w.h, headingTo(w.tx - w.x, w.ty - w.y), O.turn);
  moveForward(w, speed);
}

/* ── the drone ───────────────────────────────────────────────────────────── */

function droneStep(s: OState, input: TickInput, lead: OWorm | null) {
  const d = s.drone, wd = s.warden, mine = s.side === "warden";
  const P = mine ? O.drone.me : O.drone.ai;
  const speed = ((mine ? O.drone.me.speed : O.drone.ai.speed + O.drone.ai.perDay * (s.day - 1)) * wd.droneSpeedMul) / O.tps;
  if (d.cd > 0) d.cd--;
  if (d.phase === 1) {                    // telegraph: the line is drawn, nothing moves
    if (--d.t <= 0) { d.phase = 2; d.t = P.dash; }
    return;
  }
  if (d.phase === 2) {                    // the strike: committed, straight down the line
    const stepLen = (P.len / P.dash);
    d.x = r6(d.x + cosOf(d.lh) * stepLen); d.y = r6(d.y + sinOf(d.lh) * stepLen);
    const hit = O.drone.ai.hitR * wd.netMul;
    let caught = false;
    for (const w of [...s.worms].sort((a, b) => a.id - b.id)) {
      if (w.st === 2 || w.inv > 0 || w.dashT > 0) continue;
      if (d2(w.x, w.y, d.x, d.y) <= hit * hit) { kill(s, w, "drone"); caught = true; }
    }
    if (caught && wd.overwatch) d.cd = 0;
    if (--d.t <= 0 || !inDish(d.x, d.y)) {
      d.phase = 0;
      if (!inDish(d.x, d.y)) { const k = O.rim / Math.sqrt(d.x * d.x + d.y * d.y) * 0.98; d.x = r6(d.x * k); d.y = r6(d.y * k); }
      if (!(caught && wd.overwatch)) d.cd = Math.round((mine ? P.cd : Math.max(O.drone.ai.cdMin, O.drone.ai.cd - O.drone.ai.cdPerDay * (s.day - 1))) * wd.lungeCdMul);
    }
    return;
  }
  // roaming
  if (mine) {
    if (input.h >= 0) { d.h = turnToward(d.h, input.h, 90); const nx = r6(d.x + cosOf(d.h) * speed), ny = r6(d.y + sinOf(d.h) * speed); if (inDish(nx, ny)) { d.x = nx; d.y = ny; } }
    if (input.strike >= 0 && d.cd === 0) { d.phase = 1; d.t = P.tele; d.lh = input.strike; s.events.push({ k: "strike", x: d.x, y: d.y, h: d.lh }); }
    return;
  }
  // The house drone: alternate between the lead and the thickest crowd of crawlers.
  let tx = 0, ty = 0, found = false;
  const signedCrawler = forecastOf(s).signatures && s.signed.length ? s.worms.find((w) => w.st !== 2 && !w.lead && s.signed.includes(noteKey(s.notes[w.note]))) : undefined;
  if (signedCrawler && d.n % 2 === 1) { tx = signedCrawler.x; ty = signedCrawler.y; found = true; }
  else if (lead && d.n % 2 === 0 && lead.st !== 2) { tx = lead.x; ty = lead.y; found = true; }
  else {
    let bestN = 0;
    for (const w of s.worms) {
      if (w.st === 2) continue;
      let n = 0;
      for (const o of s.worms) if (o.st !== 2 && d2(o.x, o.y, w.x, w.y) < 0.04) n++;
      if (n > bestN) { bestN = n; tx = w.x; ty = w.y; found = true; }
    }
  }
  if (!found) return;
  const dd = d2(tx, ty, d.x, d.y);
  d.h = turnToward(d.h, headingTo(tx - d.x, ty - d.y), 40);
  if (dd > 0.16) { d.x = r6(d.x + cosOf(d.h) * speed); d.y = r6(d.y + sinOf(d.h) * speed); }
  else if (d.cd === 0) { d.phase = 1; d.t = P.tele; d.lh = headingTo(tx - d.x, ty - d.y); d.n++; s.events.push({ k: "strike", x: d.x, y: d.y, h: d.lh }); }
  else { d.x = r6(d.x + cosOf(d.h) * speed * 0.4); d.y = r6(d.y + sinOf(d.h) * speed * 0.4); }
}

/* ── tools ───────────────────────────────────────────────────────────────── */

function place(s: OState, kind: ToolKind, x: number, y: number) {
  const wd = s.warden;
  const c = cellAt(x, y);
  if (kind === "honeypot") { s.pellets.push({ id: s.nextId++, x: r6(x), y: r6(y), bait: wd.honeyCharges }); s.events.push({ k: "tool", kind, x, y }); return; }
  const size = kind === "quarantine" ? wd.qSize : kind === "harden" ? (wd.hardenBig ? 3 : 2) : 0;
  // Boxes snap to the grid: centred on a cell for odd sizes, on a corner for even ones.
  const bx = size % 2 === 1 ? cellX(c) : r6(-1 + Math.round((x + 1) / O.cell) * O.cell);
  const by = size % 2 === 1 ? cellY(c) : r6(-1 + Math.round((y + 1) / O.cell) * O.cell);
  const tele = kind === "quarantine" ? O.quarantine.tele : kind === "alert" ? O.alert.tele : O.harden.tele;
  const len = kind === "quarantine" ? Math.round(O.quarantine.live * wd.qDurMul) : kind === "alert" ? O.alert.live : 0;
  const t: OTool = { id: s.nextId++, kind, x: kind === "alert" ? r6(x) : bx, y: kind === "alert" ? r6(y) : by, size, r: r6(O.alert.r * wd.alertRMul), at: s.tick, arm: s.tick + tele, end: s.tick + tele + len, done: false, cells: [] };
  if (size) for (let c2 = 0; c2 < O.grid * O.grid; c2++) if (covers(t, cellX(c2), cellY(c2))) t.cells.push(c2);
  s.tools.push(t);
  s.events.push({ k: "tool", kind, x: t.x, y: t.y });
}

/** The house warden decides where its next tool goes, from what it can see right now. */
function aiPlace(s: OState, kind: ToolKind, lead: OWorm | null) {
  const worms = s.worms;
  if (!worms.length) return;
  const crowd = (onlyHidden: boolean, pref?: (c: number) => boolean) => {
    let best = -1, bestN = -1;
    const n = new Array<number>(O.grid * O.grid).fill(0);
    for (const w of worms) if (!onlyHidden || w.st >= 1) n[cellAt(w.x, w.y)]++;
    for (let c = 0; c < O.grid * O.grid; c++) {
      if (!s.inside[c] || (pref && !pref(c))) continue;
      const cx = c % O.grid, cy = Math.floor(c / O.grid);
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < O.grid && y < O.grid) k += n[y * O.grid + x]; }
      if (k > bestN) { bestN = k; best = c; }
    }
    return best;
  };
  if (kind === "honeypot") {
    const target = lead && lead.st === 0 ? lead : worms.find((w) => w.st === 0) ?? worms[0];
    let x = r6(target.x + cosOf(target.h) * 0.28), y = r6(target.y + sinOf(target.h) * 0.28);
    if (!inDish(x, y)) { x = r6(target.x * 0.5); y = r6(target.y * 0.5); }
    place(s, "honeypot", x, y);
    return;
  }
  if (kind === "alert") {
    const q = s.tools.filter((t) => t.kind === "quarantine" && !t.done).pop();
    if (q) { place(s, "alert", q.x, q.y); return; }
    const c = crowd(false); if (c >= 0) place(s, "alert", cellX(c), cellY(c));
    return;
  }
  if (kind === "harden") {
    const read = s.read;
    if (read && read.ground === "hard") { aiPlace(s, "honeypot", lead); return; }
    const c = crowd(false, (c) => !s.hard[c]);
    if (c >= 0) place(s, "harden", cellX(c), cellY(c));
    return;
  }
  const read = s.read;
  const c = crowd(true, read && read.ground !== "any" ? (c) => s.hard[c] === (read.ground === "hard") : undefined);
  const cc = c >= 0 ? c : crowd(false);
  if (cc >= 0) place(s, "quarantine", cellX(cc), cellY(cc));
}

/* ── the end of a day ────────────────────────────────────────────────────── */

export function endDay(s: OState): DayReport {
  const end = s.worms.length, start = Math.max(1, s.startAlive);
  const R = r2(end / start);
  const stopped = s.deaths.honeypot + s.deaths.swept + s.deaths.drone;
  const strike = s.side === "worm" ? R < 1 : R > 1;
  if (strike) s.strikes++;
  const dayMul = 1 + 0.5 * (s.day - 1);
  const chips = s.side === "worm" ? end + s.births : stopped * 5;
  const mult = s.side === "worm" ? r2(Math.max(0.5, R) * dayMul) : r2(Math.min(2, Math.max(0.25, 2 - R)) * dayMul);
  const points = Math.round(chips * mult);
  s.score += points;
  const snapshot = { v: s.v, day: s.day, T: s.T, score: s.score, worms: s.worms.map((w) => [w.id, w.gen, w.x, w.y, w.cash, w.st]), hard: s.hard.map((h) => (h ? 1 : 0)).join("") };
  s.head = chainHash(s.head, recordHash(snapshot));

  // Who won, if anyone.
  if (s.study) { if (end >= O.cap) s.over = "outbreak"; else if (end === 0) s.over = "eradicated"; else if (s.day === O.days) s.over = "won"; }
  else if (s.side === "worm") {
    if (end === 0) s.over = "extinct";
    else if (s.strikes >= O.strikes) s.over = "contained";
    else if (s.day === O.days && !s.endless) s.over = "won";
  } else {
    if (end >= O.cap) s.over = "outbreak";
    else if (end === 0) { s.over = "eradicated"; s.score += 50 * (O.days - s.day + 1); }
    else if (s.strikes >= O.strikes) s.over = "outbreak";
    else if (s.day === O.days && !s.endless) s.over = "won";
  }

  // The house drafts for the other side; then three offers for you.
  const houseSide = s.side === "worm" ? "warden" : "worm";
  const houseCard = s.study ? null : draw(s, houseSide, 1)[0] ?? null;
  if (houseCard) take(s, houseCard);
  if (s.side === "warden") s.notes[s.note] = learn(s);
  s.offers = s.over || s.study ? [] : draw(s, s.side, 3).map((c) => c.id);

  const rep: DayReport = {
    day: s.day, startAlive: s.startAlive, endAlive: end, R, births: s.births, deaths: { ...s.deaths }, stopped, strike, chips, mult, points,
    maxGen: s.maxGen, head: s.head, aiCard: houseCard?.id ?? null, reachedCap: s.reachedCap
  };
  s.reports.push(rep);
  return rep;
}

/** The swarm the house runs on the warden side rewrites its note after a bad day. */
function learn(s: OState): Note {
  const n = { ...s.notes[s.note] };
  const d = s.deaths;
  if (d.honeypot >= 2) n.food = "careful";
  if (d.swept > d.drone && n.ground !== "hard") n.ground = "hard";
  else if (d.drone > d.swept && n.ground === "hard") n.ground = "any";
  if (rnd(s) < 0.3) n.split = (["early", "normal", "late"] as const)[pickInt(s, 3)];
  if (rnd(s) < 0.25) n.avoid = (["none", "north", "south", "east", "west", "center"] as const)[pickInt(s, 6)];
  return n;
}

function draw(s: OState, side: "worm" | "warden", k: number): Card[] {
  const owned = new Set(s.cards[side]);
  const pool = CARDS.filter((c) => c.side === side && (c.stack || !owned.has(c.id)));
  const out: Card[] = [];
  for (let i = 0; i < k && pool.length; i++) {
    const roll = rnd(s);
    const want = roll < 0.6 ? "common" : roll < 0.9 ? "rare" : "epic";
    const tier = pool.filter((c) => c.rarity === want);
    const from = tier.length ? tier : pool;
    const c = from[pickInt(s, from.length)];
    out.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}

function take(s: OState, c: Card) {
  s.cards[c.side].push(c.id);
  c.apply((c.side === "worm" ? s.worm : s.warden) as WormMods & WardenMods);
}

/** Take one of today's offers. */
export function pick(s: OState, id: string) {
  if (!s.offers.includes(id)) throw new Error(`"${id}" was not offered`);
  take(s, cardById(id)!);
  s.offers = [];
}

/** Keep playing after day 7. */
export function goEndless(s: OState) { if (s.over === "won") { s.endless = true; s.offers = draw(s, s.side, 3).map((c) => c.id); } }

/* ── run codes and replay ────────────────────────────────────────────────── */

/** Inputs are stored only when they change: [tick, h, flags, strike?, kind?, x?, y?]. flags: 1 burrow · 2 rally · 4 dash. */
export type InputRow = number[];
export interface RunRecord { v: string; seed: number; side: Side; days: { note?: Note; inputs: InputRow[]; pick?: string; endless?: boolean }[] }

const KINDS: ToolKind[] = ["honeypot", "quarantine", "alert", "harden"];
export class Recorder {
  private last = IDLE;
  rows: InputRow[] = [];
  push(tick: number, i: TickInput) {
    const flags = (i.burrow ? 1 : 0) | (i.rally ? 2 : 0) | (i.dash ? 4 : 0);
    const lastFlags = (this.last.burrow ? 1 : 0) | (this.last.rally ? 2 : 0);
    if (i.h === this.last.h && flags === lastFlags && i.strike < 0 && !i.place) return;
    const row = [tick, i.h, flags];
    if (i.strike >= 0 || i.place) row.push(i.strike);
    if (i.place) row.push(KINDS.indexOf(i.place.kind), i.place.x, i.place.y);
    this.rows.push(row);
    this.last = { ...i, dash: false, strike: -1, place: null };
  }
}
export function inputsAt(rows: InputRow[]): (tick: number) => TickInput {
  let k = 0, cur: TickInput = IDLE;
  return (tick) => {
    let out: TickInput = { ...cur, dash: false, strike: -1, place: null };
    while (k < rows.length && rows[k][0] === tick) {
      const [, h, f, strike = -1, kind = -1, x = 0, y = 0] = rows[k++];
      cur = { h, burrow: (f & 1) > 0, rally: (f & 2) > 0, dash: false, strike: -1, place: null };
      out = { ...cur, dash: (f & 4) > 0, strike, place: kind >= 0 ? { kind: KINDS[kind], x, y } : null };
    }
    return out;
  };
}

/** Play a whole run from its record. The heads must match the ones the player saw. */
export function replay(rec: RunRecord): { state: OState; reports: DayReport[] } {
  if (rec.v !== OUTBREAK_VERSION) throw new Error(`this run was played under ${rec.v}`);
  const s = newRun(rec.seed, rec.side);
  for (const d of rec.days) {
    beginDay(s, d.note);
    const at = inputsAt(d.inputs);
    while (!s.dayOver) step(s, at(s.tick));
    endDay(s);
    if (d.endless) goEndless(s);
    if (d.pick) pick(s, d.pick);
    if (s.over && s.over !== "won") break;
  }
  return { state: s, reports: s.reports };
}

/** A run code is the record, compacted for a URL. */
export const encodeRun = (r: RunRecord) => JSON.stringify(r);
export const dailySeed = (date: string) => { let h = 2166136261; for (const ch of `outbreak|${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
