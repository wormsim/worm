/* ── app/components/live.ts ──────────────────────────────────────────────────
   Everything that moves on the homepage, in plain DOM and canvas code.

   The numbers are the engine's: this file calls the same `simulate()` the server,
   the CLI and the tests run, and only reads what it returns. Positions, the
   crawling worms, the split down the middle, the food they catch and the specks a death leaves are
   decoration drawn on top of those numbers; none of it is ever hashed. The page is
   fully readable before this runs — the server renders the pinned run — and this
   script makes it move.

   No network: nothing here fetches anything (tests/boundary.test.ts holds that).
   --------------------------------------------------------------------------- */

import { RULES, simulate, type AgentSnapshot, type Run } from "../../sim/engine";
import { recordHash, stableStringify } from "../../sim/hash";
import { chainsFor, chartPaths, chartX, CHART, eventLine, familyTree, tickLabel } from "../lib/runview";

interface Golden { seed: number; ticks: number; chain: string }
interface Built {
  seed: number; ticks: number; run: Run; frames: AgentSnapshot[][]; chains: string[];
  born: Map<number, { t: number; parent: number | null }>; activity: number[];
}

function build(seed: number, ticks: number): Built {
  const frames: AgentSnapshot[][] = [];
  const run = simulate(seed, ticks, (t, agents) => { frames[t] = agents; });
  const born = new Map<number, { t: number; parent: number | null }>([[0, { t: 0, parent: null }], [1, { t: 0, parent: null }], [2, { t: 0, parent: null }]]);
  for (const e of run.events) if (e.kind === "split") born.set(e.id, { t: e.t, parent: e.parent });
  // How busy the next few ticks are: playback slows down where the story is.
  const activity = run.records.map((_, i) => {
    let n = 0;
    for (let k = i; k < Math.min(run.records.length, i + 4); k++) n += run.records[k].births + run.records[k].deaths;
    return n;
  });
  return { seed, ticks, run, frames, chains: chainsFor(run), born, activity };
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T | null;
const setText = (el: Element | null, v: string) => { if (el && el.textContent !== v) el.textContent = v; };
const short = (h: string, n = 10) => `${h.slice(0, n)}…${h.slice(-4)}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x: number) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

/** A deterministic wander per id, so the same cell always drifts the same way. */
const hash01 = (id: number, salt: number) => {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
};

type RGB = readonly [number, number, number];
const DAPI: RGB = [92, 225, 255], DEEP: RGB = [150, 140, 255], SPINDLE: RGB = [255, 95, 183], AMBER: RGB = [255, 181, 71], WHITE: RGB = [255, 255, 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1)})`;
const genTone = (gen: number): RGB => mix(DAPI, DEEP, clamp((gen - 1) / 7, 0, 1));

/* ── the dish ─────────────────────────────────────────────────────────────── */

interface P { x: number; y: number }
interface Worm {
  id: number; gen: number; cash: number;
  pts: P[];                 // head first; empty while a child is still inside its parent
  dir: number; phase: number; flash: number;
  target: number;           // segment count it grows back to
  lastGrow: number; blush: number;   // regrowth timer and the time of its last split
}
interface Fission { pid: number; cid: number; start: number; cut: boolean }
interface Death { pts: P[]; at: number; w: number; seeds: number[] }
interface Spark { x0: number; y0: number; id: number; at: number }
interface Burst { x: number; y: number; at: number; id: number }

const FISSION_MS = 1700, CUT_AT = 0.5, DEATH_MS = 1900, SPARK_MS = 900;

export function mount(doc: Document = document): () => void {
  const stage = $(doc, "[data-live=jar]");
  const canvas = $<HTMLCanvasElement>(doc, "#jarCanvas");
  if (!stage || !canvas) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const goldens: Golden[] = JSON.parse($(doc, "#goldens")?.textContent || "[]");
  const pinnedSeed = Number(stage.getAttribute("data-seed")) || 20261013;
  const pinnedTicks = Number(stage.getAttribute("data-ticks")) || RULES.maxTicks;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let cur = build(pinnedSeed, pinnedTicks);
  let tf = 0, shown = -1, playing = !reduce, mult = 1, last = performance.now(), raf = 0;
  let selected: number | null = null, hover: number | null = null;
  const worms = new Map<number, Worm>();
  const fissions: Fission[] = [];
  const deaths: Death[] = [];
  const sparks: Spark[] = [];
  const bursts: Burst[] = [];
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;

  const out = (k: string) => $(stage, `[data-out=${k}]`);
  const log = $(doc, "[data-out=log]");
  const playBtn = $(stage, "[data-act=play]");
  const speedBtn = $(stage, "[data-act=speed]");
  const scrub = $<HTMLInputElement>(stage, "#jarScrub");
  const tip = $(stage, "[data-out=tip]");
  const tree = $<SVGGElement>(doc, "[data-tree=root]");

  function resize() {
    const rect = canvas!.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(260, rect.width); H = Math.max(200, rect.height);
    canvas!.width = Math.round(W * dpr); canvas!.height = Math.round(H * dpr);
    cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.43;
  }
  const seg = () => R * 0.026;
  const segCount = (gen: number) => 10 + Math.min(gen, 7);
  const bodyW = (gen: number) => R * (0.017 + 0.0011 * Math.min(gen, 7));
  const head = (w: Worm): P | undefined => w.pts[0];
  const strengthOf = (w: Worm) => clamp(w.cash / (RULES.birthCost * 2), 0.18, 1);

  function lay(id: number, gen: number, cash: number, x: number, y: number, dir: number): Worm {
    const n = segCount(gen), s = seg(), pts: P[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: x - Math.cos(dir) * s * i, y: y - Math.sin(dir) * s * i + Math.sin(i * 0.8) * s * 0.3 });
    return { id, gen, cash, pts, dir, phase: hash01(id, 4) * 6, flash: 0, target: n, lastGrow: 0, blush: -1e9 };
  }

  /** Lay a population down at once (on load, on seek, on a new seed). */
  function place(at: number) {
    worms.clear(); fissions.length = 0; deaths.length = 0; sparks.length = 0; bursts.length = 0;
    const frame = cur.frames[at] ?? [];
    frame.forEach((a, i) => {
      const golden = (i + 0.5) * 2.39996, d = Math.sqrt((i + 0.5) / Math.max(1, frame.length)) * R * 0.62;
      const x = frame.length <= 3 ? cx + (i - 1) * R * 0.36 : cx + Math.cos(golden) * d;
      const y = frame.length <= 3 ? cy + (i === 1 ? -R * 0.2 : R * 0.16) : cy + Math.sin(golden) * d;
      worms.set(a.id, lay(a.id, a.gen, a.cash, x, y, hash01(a.id, 5) * Math.PI * 2));
    });
  }

  /** Cut a parent in two: the tail half becomes the child and crawls the other way. */
  function cut(f: Fission, now: number) {
    if (f.cut) return;
    f.cut = true;
    const p = worms.get(f.pid), c = worms.get(f.cid);
    if (!p || !c || p.pts.length < 4) return;
    const mid = Math.floor(p.pts.length / 2);
    const tail = p.pts.slice(mid).reverse();
    p.pts = p.pts.slice(0, mid + 1);
    c.pts = tail.map((q) => ({ ...q }));
    const h0 = c.pts[0], h1 = c.pts[1] ?? h0;
    c.dir = Math.atan2(h0.y - h1.y, h0.x - h1.x);
    p.blush = now; c.blush = now; p.lastGrow = now; c.lastGrow = now;
    bursts.push({ x: p.pts[p.pts.length - 1].x, y: p.pts[p.pts.length - 1].y, at: now, id: f.cid });
  }

  /** Move the drawn population from tick `shown` to tick `t`. */
  function advanceTo(t: number, now: number) {
    if (shown < 0 || t < shown || t - shown > 30) { place(t); shown = t; afterTick(); rebuildLog(); return; }
    while (shown < t) {
      shown++;
      const frame = cur.frames[shown] ?? [];
      const live = new Set(frame.map((a) => a.id));
      for (const [id, w] of worms) {
        if (live.has(id)) continue;
        if (w.pts.length) deaths.push({ pts: w.pts.map((q) => ({ ...q })), at: now, w: bodyW(w.gen), seeds: w.pts.map((_, k) => hash01(id, k + 30)) });
        worms.delete(id);
        for (let i = fissions.length - 1; i >= 0; i--) if (fissions[i].pid === id || fissions[i].cid === id) fissions.splice(i, 1);
        if (selected === id) selected = null;
      }
      for (const a of frame) {
        const w = worms.get(a.id);
        if (w) {
          if (a.cash > w.cash + 0.5 && sparks.length < 24 && w.pts.length && hash01(a.id, shown) < 0.22) {
            const ang = hash01(a.id, shown + 7) * Math.PI * 2, h = w.pts[0], d = R * (0.08 + 0.06 * hash01(a.id, shown + 9));
            sparks.push({ x0: h.x + Math.cos(ang) * d, y0: h.y + Math.sin(ang) * d, id: a.id, at: now + hash01(a.id, shown + 3) * 140 });
          }
          w.cash = a.cash; w.gen = a.gen; w.target = segCount(a.gen); continue;
        }
        const p = a.parent === null ? undefined : worms.get(a.parent);
        if (p && p.pts.length >= 6) {
          for (const f of fissions) if (f.pid === p.id || f.cid === p.id) cut(f, now);   // finish any split in progress first
          const child: Worm = { id: a.id, gen: a.gen, cash: a.cash, pts: [], dir: 0, phase: hash01(a.id, 4) * 6, flash: 0, target: segCount(a.gen), lastGrow: now, blush: now };
          worms.set(a.id, child);
          fissions.push({ pid: p.id, cid: a.id, start: now, cut: false });
        } else {
          const h = p?.pts[0];
          worms.set(a.id, lay(a.id, a.gen, a.cash, h ? h.x : cx, h ? h.y : cy, hash01(a.id, 5) * Math.PI * 2));
        }
      }
      for (const e of cur.run.events) if (e.t === shown) pushLog(e);
    }
    afterTick();
  }

  /* ── crawling: follow-the-leader bodies in a round dish ───────────────── */

  const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  function step(dt: number, now: number) {
    const k = Math.min(2.2, dt / 16.7), tt = now / 1000, s = seg();
    for (let i = fissions.length - 1; i >= 0; i--) {
      const f = fissions[i], q = (now - f.start) / FISSION_MS;
      if (q >= CUT_AT && !f.cut) cut(f, now);
      if (q >= 1) fissions.splice(i, 1);
    }
    const splitting = new Set(fissions.filter((f) => !f.cut).map((f) => f.pid));
    const list = [...worms.values()].filter((w) => w.pts.length);
    for (const w of list) {
      const h = w.pts[0], st = strengthOf(w), starving = w.cash < RULES.rent * 2.2;
      // wander, with a pull back from the rim and a nudge away from other heads
      w.dir += (Math.sin(tt * 0.7 + w.id * 1.9) * 0.6 + Math.sin(tt * 0.23 + w.id)) * 0.018 * k;
      const dx = h.x - cx, dy = h.y - cy, dc = Math.hypot(dx, dy);
      if (dc > R * 0.8) w.dir += angDiff(w.dir, Math.atan2(-dy, -dx)) * 0.08 * k * ((dc - R * 0.8) / (R * 0.15));
      // look ahead and turn away from other bodies: worms crowd, but rarely cross
      let push = 0;
      for (const o of list) {
        if (o === w) continue;
        for (let j = 0; j < o.pts.length; j += 3) {
          const op = o.pts[j], ox = op.x - h.x, oy = op.y - h.y, od = Math.hypot(ox, oy);
          if (od < s * 3 && od > 0.01) push -= Math.sign(Math.cos(w.dir) * oy - Math.sin(w.dir) * ox) * (1 - od / (s * 3));
        }
      }
      w.dir += clamp(push, -1.5, 1.5) * 0.05 * k;
      const speed = R * 0.0021 * (starving ? 0.3 : 0.55 + 0.6 * st) * (splitting.has(w.id) ? 0.25 : 1) * k;
      w.phase += k * (0.1 + 0.1 * st);
      const heading = w.dir + Math.sin(w.phase) * 0.5;
      h.x += Math.cos(heading) * speed; h.y += Math.sin(heading) * speed;
      const nd = Math.hypot(h.x - cx, h.y - cy), lim = R - bodyW(w.gen) * 2;
      if (nd > lim) { h.x = cx + ((h.x - cx) / nd) * lim; h.y = cy + ((h.y - cy) / nd) * lim; w.dir += Math.PI * 0.5; }
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], bx = b.x - a.x, by = b.y - a.y, d = Math.hypot(bx, by) || 0.01;
        b.x = a.x + (bx / d) * s; b.y = a.y + (by / d) * s;
      }
      // regrow the missing half after a split, one segment at a time
      if (w.pts.length < w.target && now - w.lastGrow > 110) {
        const a = w.pts[w.pts.length - 1], b = w.pts[w.pts.length - 2] ?? { x: a.x - Math.cos(w.dir) * s, y: a.y - Math.sin(w.dir) * s };
        const ux = a.x - b.x, uy = a.y - b.y, d = Math.hypot(ux, uy) || 1;
        w.pts.push({ x: a.x + (ux / d) * s, y: a.y + (uy / d) * s });
        w.lastGrow = now;
      }
      w.flash = Math.max(0, w.flash - dt / 600);
    }
  }

  /* ── drawing ──────────────────────────────────────────────────────────── */

  function drawField(now: number) {
    const g = ctx!.createRadialGradient(cx, cy - R * 0.2, R * 0.05, cx, cy, R * 1.05);
    g.addColorStop(0, "#0d1729"); g.addColorStop(0.7, "#070b14"); g.addColorStop(1, "#04060a");
    ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(cx, cy, R, 0, Math.PI * 2); ctx!.fill();
    ctx!.lineWidth = 1;
    ctx!.save(); ctx!.beginPath(); ctx!.arc(cx, cy, R, 0, Math.PI * 2); ctx!.clip();
    ctx!.strokeStyle = "#111a2a";
    ctx!.beginPath();
    for (let x = cx % 32; x < W; x += 32) { ctx!.moveTo(x, 0); ctx!.lineTo(x, H); }
    for (let y = cy % 32; y < H; y += 32) { ctx!.moveTo(0, y); ctx!.lineTo(W, y); }
    ctx!.stroke();
    if (playing && "createConicGradient" in ctx!) {      // a slow sweep: the clock is running
      const sw = ((now / 2600) % 1) * Math.PI * 2 - Math.PI / 2;
      const sg = ctx!.createConicGradient(sw - 0.6, cx, cy);
      sg.addColorStop(0, "rgba(92,225,255,0)"); sg.addColorStop(0.095, "rgba(92,225,255,0.06)"); sg.addColorStop(0.1, "rgba(92,225,255,0)"); sg.addColorStop(1, "rgba(92,225,255,0)");
      ctx!.fillStyle = sg; ctx!.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    ctx!.restore();
    ctx!.strokeStyle = "#1e2a40";
    ctx!.beginPath(); ctx!.moveTo(cx - R, cy); ctx!.lineTo(cx + R, cy); ctx!.moveTo(cx, cy - R); ctx!.lineTo(cx, cy + R); ctx!.stroke();
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2, long = i % 15 === 0, mid = i % 5 === 0, r1 = R + 5, r2 = R + (long ? 14 : mid ? 9 : 7);
      ctx!.strokeStyle = long ? "#4a5c80" : mid ? "#2a3852" : "#1a2438";
      ctx!.beginPath(); ctx!.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx!.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx!.stroke();
    }
    ctx!.strokeStyle = "#2c3b58"; ctx!.lineWidth = 1.3;
    ctx!.beginPath(); ctx!.arc(cx, cy, R, 0, Math.PI * 2); ctx!.stroke();
    const alive = worms.size, full = alive >= RULES.cap;
    ctx!.lineWidth = 2.5; ctx!.lineCap = "round";
    ctx!.strokeStyle = "#141c2c"; ctx!.beginPath(); ctx!.arc(cx, cy, R + 21, 0, Math.PI * 2); ctx!.stroke();
    ctx!.strokeStyle = full ? rgba(SPINDLE, 0.95) : rgba(DAPI, 0.85);
    ctx!.beginPath(); ctx!.arc(cx, cy, R + 21, -Math.PI / 2, -Math.PI / 2 + (alive / RULES.cap) * Math.PI * 2); ctx!.stroke();
    ctx!.lineCap = "butt";
  }

  function glow(x: number, y: number, r: number, tone: RGB, a: number) {
    const h = ctx!.createRadialGradient(x, y, 0, x, y, r);
    h.addColorStop(0, rgba(tone, a)); h.addColorStop(1, rgba(tone, 0));
    ctx!.fillStyle = h; ctx!.beginPath(); ctx!.arc(x, y, r, 0, Math.PI * 2); ctx!.fill();
  }

  function wormTone(w: Worm, now: number): RGB {
    let t: RGB = w.cash < RULES.rent * 2.2 ? AMBER : genTone(w.gen);
    if (w.cash >= RULES.birthCost * 2) t = mix(t, SPINDLE, 0.3);
    const b = 1 - (now - w.blush) / 1600;
    return b > 0 ? mix(t, SPINDLE, b * 0.8) : t;
  }

  const BG: RGB = [7, 11, 20];
  function polyline(pts: P[], from: number, to: number) {
    ctx!.beginPath(); ctx!.moveTo(pts[from].x, pts[from].y);
    for (let i = from + 1; i <= to; i++) ctx!.lineTo(pts[i].x, pts[i].y);
  }

  function drawWorm(w: Worm, now: number, dim: boolean, pinch: number) {
    const pts = w.pts, n = pts.length;
    if (n < 2) return;
    const tone = wormTone(w, now), st = strengthOf(w), fade = dim ? 0.25 : 1, bw = bodyW(w.gen);
    const mid = (n - 1) / 2;
    const widthAt = (i: number) => {
      const u = i / (n - 1), taper = u < 0.12 ? 0.75 + u * 2 : 1 - Math.max(0, u - 0.55) * 1.4;
      return bw * taper * (1 - pinch * Math.exp(-((i - mid) ** 2) / 2.2));
    };
    // halo
    ctx!.globalCompositeOperation = "lighter";
    ctx!.lineCap = "round"; ctx!.lineJoin = "round";
    ctx!.strokeStyle = rgba(tone, (0.035 + 0.05 * st + w.flash * 0.15) * fade); ctx!.lineWidth = bw * 3.6;
    polyline(pts, 0, n - 1); ctx!.stroke();
    ctx!.globalCompositeOperation = "source-over";
    // body: opaque, tapered, drawn segment by segment
    const body = mix(BG, tone, (0.3 + 0.28 * st) * fade + 0.05);
    ctx!.strokeStyle = rgba(body, 1);
    for (let i = 0; i < n - 1; i++) {
      ctx!.lineWidth = Math.max(1, (widthAt(i) + widthAt(i + 1)));
      ctx!.beginPath(); ctx!.moveTo(pts[i].x, pts[i].y); ctx!.lineTo(pts[i + 1].x, pts[i + 1].y); ctx!.stroke();
    }
    // rings along the body
    ctx!.strokeStyle = rgba(tone, 0.32 * fade); ctx!.lineWidth = 0.8;
    ctx!.beginPath();
    for (let i = 2; i < n - 1; i += 2) {
      const a = pts[i - 1], b = pts[i + 1], ux = b.x - a.x, uy = b.y - a.y, d = Math.hypot(ux, uy) || 1, nx = -uy / d, ny = ux / d, hw = widthAt(i) * 0.9;
      ctx!.moveTo(pts[i].x + nx * hw, pts[i].y + ny * hw); ctx!.lineTo(pts[i].x - nx * hw, pts[i].y - ny * hw);
    }
    ctx!.stroke();
    // the gut: a bright core whose length and brightness are the balance
    ctx!.globalCompositeOperation = "lighter";
    const gut = Math.max(1, Math.round((n - 2) * (0.35 + 0.6 * st)));
    ctx!.strokeStyle = rgba(mix(tone, WHITE, 0.25), (0.35 + 0.55 * st + w.flash * 0.3) * fade); ctx!.lineWidth = Math.max(1, bw * 0.55);
    polyline(pts, 1, Math.min(n - 1, gut)); ctx!.stroke();
    // head
    const h = pts[0];
    glow(h.x, h.y, bw * 2.8, tone, (0.35 + w.flash * 0.5) * fade);
    ctx!.globalCompositeOperation = "source-over";
    ctx!.fillStyle = rgba(mix(tone, WHITE, 0.45), (0.85 + 0.15 * st) * fade);
    ctx!.beginPath(); ctx!.arc(h.x, h.y, bw * 1.05, 0, Math.PI * 2); ctx!.fill();
    if (w.cash < RULES.rent * 2.2) {           // one rent from the end: a stuttering warning ring at the head
      const p = (now / 600 + w.id * 0.13) % 1;
      ctx!.strokeStyle = rgba(AMBER, 0.65 * (1 - p) * fade); ctx!.lineWidth = 1;
      ctx!.beginPath(); ctx!.arc(h.x, h.y, bw * (1.6 + p * 2.4), 0, Math.PI * 2); ctx!.stroke();
    }
    if (w.cash >= RULES.birthCost * 2 && pinch === 0) {   // could split, but the jar is full: a faint waist mark
      const m = pts[Math.floor(mid)];
      ctx!.strokeStyle = rgba(SPINDLE, (0.35 + 0.25 * Math.sin(now / 300 + w.id)) * fade); ctx!.lineWidth = 1; ctx!.setLineDash([2, 3]);
      ctx!.beginPath(); ctx!.arc(m.x, m.y, bw * 2.2, 0, Math.PI * 2); ctx!.stroke(); ctx!.setLineDash([]);
    }
    ctx!.lineCap = "butt"; ctx!.lineJoin = "miter";
  }

  /** The split itself: the middle narrows, glows, and snaps. */
  function drawFissionGlow(f: Fission, now: number, dim: boolean) {
    const p = worms.get(f.pid);
    if (!p || p.pts.length < 3 || f.cut) return;
    const q = clamp((now - f.start) / FISSION_MS / CUT_AT, 0, 1), m = p.pts[Math.floor((p.pts.length - 1) / 2)], bw = bodyW(p.gen);
    ctx!.globalCompositeOperation = "lighter";
    glow(m.x, m.y, bw * (3 + q * 4), SPINDLE, (0.25 + 0.55 * q) * (dim ? 0.3 : 1));
    for (let i = 0; i < 3; i++) {
      const r = bw * (1.5 + ((now / 260 + i / 3) % 1) * 3);
      ctx!.strokeStyle = rgba(SPINDLE, 0.5 * q * (1 - ((now / 260 + i / 3) % 1))); ctx!.lineWidth = 1;
      ctx!.beginPath(); ctx!.arc(m.x, m.y, r, 0, Math.PI * 2); ctx!.stroke();
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  function drawBursts(now: number) {
    ctx!.globalCompositeOperation = "lighter";
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], q = (now - b.at) / 700;
      if (q >= 1) { bursts.splice(i, 1); continue; }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + hash01(b.id, k) * 0.6, d = R * 0.06 * ease(q);
        glow(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 3.5, SPINDLE, 0.9 * (1 - q));
      }
      ctx!.strokeStyle = rgba(SPINDLE, 0.6 * (1 - q)); ctx!.lineWidth = 1.2;
      ctx!.beginPath(); ctx!.arc(b.x, b.y, R * 0.02 + R * 0.07 * ease(q), 0, Math.PI * 2); ctx!.stroke();
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  /** A death: the worm stops, curls up, darkens, and breaks into specks that drift away. */
  function drawDeath(d: Death, now: number) {
    const q = (now - d.at) / DEATH_MS, n = d.pts.length;
    let gx = 0, gy = 0; for (const p of d.pts) { gx += p.x; gy += p.y; } gx /= n; gy /= n;
    ctx!.lineCap = "round";
    if (q < 0.55) {
      const k = ease(q / 0.55), a = 1 - q * 0.6;
      const curled = d.pts.map((p, i) => {
        const ang = (i / n) * 2.6 * k, sc = 1 - 0.45 * k, x = (p.x - gx) * sc, y = (p.y - gy) * sc;
        return { x: gx + x * Math.cos(ang) - y * Math.sin(ang), y: gy + x * Math.sin(ang) + y * Math.cos(ang) };
      });
      ctx!.strokeStyle = rgba(mix(BG, AMBER, 0.45), a); ctx!.lineWidth = d.w * 1.7 * (1 - 0.3 * k);
      polyline(curled, 0, n - 1); ctx!.stroke();
      ctx!.globalCompositeOperation = "lighter";
      ctx!.strokeStyle = rgba(AMBER, 0.5 * a); ctx!.lineWidth = 1;
      polyline(curled, 0, n - 1); ctx!.stroke();
      ctx!.globalCompositeOperation = "source-over";
    } else {
      const k = (q - 0.55) / 0.45, a = 1 - k;
      ctx!.globalCompositeOperation = "lighter";
      d.pts.forEach((p, i) => {
        if (i % 2) return;
        const ang = d.seeds[i] * Math.PI * 2, dist = R * 0.05 * ease(k) * (0.5 + d.seeds[i]);
        const x = gx + (p.x - gx) * 0.55 + Math.cos(ang) * dist, y = gy + (p.y - gy) * 0.55 + Math.sin(ang) * dist + k * R * 0.02;
        ctx!.fillStyle = rgba(AMBER, 0.7 * a); ctx!.beginPath(); ctx!.arc(x, y, d.w * 0.5 * (1 - k * 0.5), 0, Math.PI * 2); ctx!.fill();
      });
      ctx!.globalCompositeOperation = "source-over";
    }
    ctx!.lineCap = "butt";
  }

  function drawSparks(now: number) {
    ctx!.globalCompositeOperation = "lighter";
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i], q = (now - s.at) / SPARK_MS;
      if (q < 0) continue;
      const w = worms.get(s.id), h = w ? head(w) : undefined;
      if (q >= 1 || !w || !h) { if (w) w.flash = 1; sparks.splice(i, 1); continue; }
      // a food pellet appears beside the worm, then is pulled into its head
      const e = q < 0.45 ? 0 : ease((q - 0.45) / 0.55), x = s.x0 + (h.x - s.x0) * e, y = s.y0 + (h.y - s.y0) * e;
      const appear = Math.min(1, q / 0.2);
      glow(x, y, 7, DAPI, 0.8 * appear);
      ctx!.fillStyle = rgba(WHITE, 0.9 * appear); ctx!.beginPath(); ctx!.arc(x, y, 1.6, 0, Math.PI * 2); ctx!.fill();
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  function lineageOf(id: number): Set<number> {
    const set = new Set<number>([id]);
    let p = cur.born.get(id)?.parent ?? null;
    while (p !== null) { set.add(p); p = cur.born.get(p)?.parent ?? null; }
    for (const k of cur.born.keys()) {                 // and every descendant
      let q: number | null = cur.born.get(k)?.parent ?? null;
      while (q !== null) { if (q === id) { set.add(k); break; } q = cur.born.get(q)?.parent ?? null; }
    }
    return set;
  }

  function draw(now: number) {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    drawField(now);
    const family = selected !== null ? lineageOf(selected) : null;
    for (let i = deaths.length - 1; i >= 0; i--) if (now - deaths[i].at > DEATH_MS) deaths.splice(i, 1);
    for (const d of deaths) drawDeath(d, now);
    const pinchOf = new Map<number, number>();
    for (const f of fissions) if (!f.cut) pinchOf.set(f.pid, 0.85 * ease((now - f.start) / FISSION_MS / CUT_AT));
    // dim worms first, so a traced family sits on top
    const order = [...worms.values()].sort((a, b) => Number(!!family && family.has(a.id)) - Number(!!family && family.has(b.id)));
    for (const w of order) drawWorm(w, now, !!family && !family.has(w.id), pinchOf.get(w.id) ?? 0);
    for (const f of fissions) drawFissionGlow(f, now, !!family && !family.has(f.pid));
    drawBursts(now);
    drawSparks(now);

    if (family) {                                       // the traced family, parent to child
      ctx!.strokeStyle = rgba(SPINDLE, 0.7); ctx!.lineWidth = 1; ctx!.setLineDash([3, 4]);
      ctx!.beginPath();
      for (const id of family) {
        const c = worms.get(id), par = cur.born.get(id)?.parent;
        const p = par === null || par === undefined ? undefined : worms.get(par);
        const ch = c && head(c), ph = p && head(p);
        if (ch && ph) { ctx!.moveTo(ph.x, ph.y); ctx!.lineTo(ch.x, ch.y); }
      }
      ctx!.stroke(); ctx!.setLineDash([]);
      const s = selected === null ? undefined : worms.get(selected), sh = s && head(s);
      if (s && sh) { ctx!.strokeStyle = rgba(SPINDLE, 1); ctx!.lineWidth = 1.5; ctx!.beginPath(); ctx!.arc(sh.x, sh.y, bodyW(s.gen) * 4, 0, Math.PI * 2); ctx!.stroke(); }
    }
    if (hover !== null && hover !== selected) {
      const w = worms.get(hover), h = w && head(w);
      if (w && h) { ctx!.strokeStyle = "rgba(238,241,248,.7)"; ctx!.lineWidth = 1; ctx!.beginPath(); ctx!.arc(h.x, h.y, bodyW(w.gen) * 3.6, 0, Math.PI * 2); ctx!.stroke(); }
    }

    ctx!.font = `500 ${W < 420 ? 9 : 10}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx!.fillStyle = "#6c7590"; ctx!.textAlign = "left";
    ctx!.fillText(`${tickLabel(Math.max(0, shown))} / ${cur.run.records.length}`, 12, 20);
    ctx!.fillText(selected !== null ? `TRACING #${selected} · TAP AGAIN TO CLEAR` : "TAP A WORM TO TRACE ITS FAMILY", 12, H - 14);
    ctx!.textAlign = "right";
    ctx!.fillText(`LID ${worms.size}/${RULES.cap}`, W - 12, 20);
    if (W > 460) ctx!.fillText("1 WORM = 1 AGENT", W - 12, H - 14);
  }

  function frame(now: number) {
    const dt = Math.min(64, now - last); last = now;
    const end = cur.run.records.length;
    if (playing) {
      const act = cur.activity[Math.min(end - 1, Math.max(0, Math.floor(tf)))] ?? 0;
      const speed = (16 / (1 + act * 0.22)) * mult;               // slower where the jar is busy
      tf = Math.min(end, tf + (dt / 1000) * Math.max(3 * mult, speed));
      if (tf >= end) { playing = false; setPlayLabel(); }
    }
    const t = Math.floor(tf);
    if (t !== shown) advanceTo(t, now);
    step(dt, now);
    draw(now);
    if (hover !== null) placeTip();
    raf = requestAnimationFrame(frame);
  }

  /* ── readouts ─────────────────────────────────────────────────────────── */

  const chartPlay = $(doc, "[data-chart=playhead]");
  const chartDot = $(doc, "[data-chart=dot]");
  const chartReveal = $(doc, "[data-chart=reveal]");
  let lastPaths = chartPaths(cur.run, cur.ticks);

  function afterTick() {
    const t = Math.max(0, shown);
    const rec = t > 0 ? cur.run.records[t - 1] : undefined;
    const alive = rec ? rec.alive : 3;
    setText(out("alive"), String(alive));
    setText(out("gen"), String(rec ? rec.maxGen : 1));
    setText(out("rent"), (rec ? rec.rent : RULES.rent).toFixed(3));
    setText(out("treasury"), (rec ? rec.treasury : 0).toFixed(1));
    setText(out("chainT"), t > 0 ? `CHAIN @ ${tickLabel(t)}` : "CHAIN @ GENESIS");
    setText(out("chain"), t > 0 ? cur.chains[t - 1] : "0".repeat(64));
    const fill = out("fill"); if (fill) fill.style.width = `${(alive / RULES.cap) * 100}%`;
    setText(out("seed"), String(cur.seed));
    setText(out("tick"), tickLabel(t));
    if (scrub) {
      if (doc.activeElement !== scrub) { scrub.max = String(cur.run.records.length); scrub.value = String(t); }
      scrub.style.setProperty("--p", `${(t / Math.max(1, cur.run.records.length)) * 100}%`);
    }
    const done = t >= cur.run.records.length;
    setText(out("sealing"), done ? "RUN SEALED" : playing ? `HASHING ${tickLabel(t)}` : "PAUSED");
    stage!.classList.toggle("sealed", done);
    const v = out("verdict");
    if (v) {
      const golden = goldens.find((g) => g.seed === cur.seed && g.ticks === cur.ticks);
      let cls = "wait", txt = "REPLAYING IN YOUR BROWSER";
      if (done && golden) { const same = golden.chain === cur.run.chain; cls = same ? "ok stamp" : "bad stamp"; txt = same ? "✓ IDENTICAL TO THE PINNED GOLDEN" : "✕ DIVERGED — FILE A BUG"; }
      else if (done) { cls = "neutral stamp"; txt = "NOT PINNED · HEAD " + short(cur.run.chain, 8); }
      else if (!playing) txt = "PAUSED";
      if (v.className !== `verdict ${cls}`) v.className = `verdict ${cls}`;
      setText(v, txt);
    }
    if (chartPlay && chartDot) {
      const x = chartX(t, cur.ticks).toFixed(1);
      chartPlay.setAttribute("x1", x); chartPlay.setAttribute("x2", x);
      chartDot.setAttribute("cx", x); chartDot.setAttribute("cy", lastPaths.yAlive(alive).toFixed(1));
    }
    chartReveal?.setAttribute("width", (chartX(t, cur.ticks) + 1).toFixed(1));
    paintTree(t);
  }

  /* ── the family tree grows with the run ───────────────────────────────── */

  function paintTree(t: number) {
    if (!tree) return;
    tree.querySelectorAll<SVGElement>("[data-born]").forEach((el) => {
      const born = Number(el.getAttribute("data-born")), died = Number(el.getAttribute("data-died") ?? -1);
      const state = t < born ? "u" : died >= 0 && t >= died ? "d" : "a";
      if (el.getAttribute("data-s") !== state) el.setAttribute("data-s", state);
    });
    setText($(doc, "[data-out=treeTick]"), tickLabel(t));
  }
  function rebuildTree() {
    if (!tree) return;
    tree.innerHTML = familyTree(cur.run).svg;
    setText($(doc, "[data-out=treeSeed]"), `SEED ${cur.seed}`);
    markTree(); paintTree(Math.max(0, shown));
  }
  function markTree() {
    if (!tree) return;
    const fam = selected !== null ? lineageOf(selected) : null;
    tree.classList.toggle("tracing", !!fam);
    tree.querySelectorAll<SVGElement>("[data-id]").forEach((el) => el.classList.toggle("lin", !!fam && fam.has(Number(el.getAttribute("data-id")))));
    const tr = $(doc, "[data-out=tracing]");
    if (tr) tr.innerHTML = fam && cur.seed === pinnedSeed
      ? `TRACING #${selected} · ${fam.size} RELATIVES · <a href="/worm/${selected}">OPEN ITS PAGE ↗</a>`
      : fam ? `TRACING #${selected} · ${fam.size} RELATIVES` : "TAP A NODE OR A WORM TO TRACE A FAMILY";
  }

  function setPlayLabel() {
    const end = shown >= cur.run.records.length;
    setText(playBtn, playing ? "❙❙" : end ? "↺" : "▶");
    playBtn?.setAttribute("aria-label", playing ? "Pause" : end ? "Replay from the start" : "Play");
  }

  /* ── the event log ────────────────────────────────────────────────────── */

  function pushLog(e: Run["events"][number]) {
    if (!log) return;
    const { k, text } = eventLine(e);
    const li = doc.createElement("li"); li.className = `ev ${k}`; li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild?.remove();
  }
  function rebuildLog() {
    if (!log) return;
    log.textContent = "";
    const t = Math.max(0, shown);
    const evs = cur.run.events.filter((e) => e.t <= t).slice(-8);
    for (const e of evs) pushLog(e);
    if (!evs.length) { const li = doc.createElement("li"); li.className = "ev"; li.textContent = `${tickLabel(0)} · three founders, ${RULES.startCash} each`; log.append(li); }
  }

  /* ── the chart follows the run ────────────────────────────────────────── */

  function redrawChart() {
    lastPaths = chartPaths(cur.run, cur.ticks);
    $(doc, "[data-chart=area]")?.setAttribute("d", lastPaths.area);
    $(doc, "[data-chart=line]")?.setAttribute("d", lastPaths.line);
    $(doc, "[data-chart=rent]")?.setAttribute("d", lastPaths.rent);
    const marks = $(doc, "[data-chart=marks]");
    if (marks) {
      let html = "";
      for (const t of lastPaths.splits) html += `<line class="mk split" x1="${chartX(t, cur.ticks).toFixed(1)}" x2="${chartX(t, cur.ticks).toFixed(1)}" y1="${lastPaths.base + 4}" y2="${lastPaths.base + 9}"/>`;
      for (const t of lastPaths.deaths) html += `<line class="mk death" x1="${chartX(t, cur.ticks).toFixed(1)}" x2="${chartX(t, cur.ticks).toFixed(1)}" y1="${lastPaths.base + 10}" y2="${lastPaths.base + 15}"/>`;
      marks.innerHTML = html;
    }
    setText($(doc, "[data-out=chartSeed]"), `SEED ${cur.seed}`);
  }

  /* ── controls ─────────────────────────────────────────────────────────── */

  function seek(t: number) {
    tf = clamp(t, 0, cur.run.records.length);
    playing = false;
    advanceTo(Math.floor(tf), performance.now());
    setPlayLabel(); afterTick();
  }
  function load(seedValue: number) {
    cur = build(seedValue, pinnedTicks);
    tf = 0; shown = -1; playing = true; selected = null; hover = null; hideTip();
    advanceTo(0, performance.now());
    redrawChart(); rebuildTree(); setPlayLabel();
  }
  const onClick = (ev: Event) => {
    const btn = (ev.target as HTMLElement).closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "play") {
      if (shown >= cur.run.records.length) { tf = 0; shown = -1; playing = true; }
      else playing = !playing;
      setPlayLabel(); afterTick();
    } else if (act === "replay") load(pinnedSeed);
    else if (act === "seed") load(Math.floor(Math.random() * 99_999_999) + 1);
    else if (act === "speed") { mult = mult === 1 ? 3 : mult === 3 ? 0.4 : 1; setText(speedBtn, mult === 1 ? "1×" : mult === 3 ? "3×" : "½×"); }
  };
  stage.addEventListener("click", onClick);
  const onScrub = () => { if (scrub) seek(Number(scrub.value)); };
  scrub?.addEventListener("input", onScrub);

  const chartSvg = $<SVGSVGElement>(doc, "svg.chart");
  const onChart = (ev: MouseEvent) => {
    if (!chartSvg) return;
    const box = chartSvg.getBoundingClientRect();
    const x = ((ev.clientX - box.left) / box.width) * CHART.w;
    seek(Math.round(((x - CHART.left) / (CHART.w - CHART.left - CHART.right)) * cur.ticks));
  };
  chartSvg?.addEventListener("click", onChart);

  /* ── hover and tap on worms ───────────────────────────────────────────── */

  function wormAt(x: number, y: number): number | null {
    let best: number | null = null, bd = Infinity;
    for (const w of worms.values()) {
      const reach = bodyW(w.gen) * 1.6 + 7;
      for (let i = 0; i < w.pts.length; i++) { const d = Math.hypot(w.pts[i].x - x, w.pts[i].y - y); if (d < reach && d < bd) { bd = d; best = w.id; } }
    }
    return best;
  }
  function placeTip() {
    if (!tip || hover === null) return;
    const w = worms.get(hover), h = w && head(w);
    if (!w || !h) { hideTip(); return; }
    const b = cur.born.get(w.id);
    const chain: number[] = []; let p: number | null = w.id;
    while (p !== null && chain.length < 9) { chain.unshift(p); p = cur.born.get(p)?.parent ?? null; }
    const rec = cur.run.records[Math.max(0, shown - 1)];
    const state = w.cash < RULES.rent * 2.2 ? "one rent from the end" : w.cash >= RULES.birthCost * 2 ? "ready to split · the jar is full" : `${(RULES.birthCost * 2 - w.cash).toFixed(2)} short of splitting`;
    const html = `<b>#${w.id}</b><span>GEN ${w.gen} · ${b && b.parent !== null ? `BORN ${tickLabel(b.t)} FROM #${b.parent}` : "FOUNDER"}</span>`
      + `<dl><dt>balance</dt><dd>${w.cash.toFixed(3)}</dd><dt>rent due</dt><dd>${(rec?.rent ?? RULES.rent).toFixed(3)}</dd></dl>`
      + `<em class="${w.cash < RULES.rent * 2.2 ? "warn" : ""}">${state}</em><i>${chain.map((id) => `#${id}`).join(" → ")}</i>`;
    if (tip.innerHTML !== html) tip.innerHTML = html;
    const box = canvas!.getBoundingClientRect(), sb = stage!.getBoundingClientRect();
    const tw = tip.offsetWidth || 230, th = tip.offsetHeight || 120;
    let x = box.left - sb.left + h.x + 24, y = box.top - sb.top + h.y - th / 2;
    if (x + tw > sb.width - 8) x = box.left - sb.left + h.x - tw - 24;
    y = clamp(y, 8, sb.height - th - 8);
    tip.style.transform = `translate(${Math.max(8, x).toFixed(0)}px, ${y.toFixed(0)}px)`;
    tip.classList.add("on");
  }
  function hideTip() { tip?.classList.remove("on"); }
  const local = (ev: PointerEvent) => { const b = canvas!.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top }; };
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    const { x, y } = local(ev);
    hover = wormAt(x, y);
    canvas!.style.cursor = hover !== null ? "pointer" : "default";
    if (hover === null) hideTip(); else placeTip();
  };
  const onLeave = () => { hover = null; hideTip(); };
  const onTap = (ev: PointerEvent) => {
    const { x, y } = local(ev);
    const id = wormAt(x, y);
    selected = id === null || id === selected ? null : id;
    hover = id; if (id !== null) placeTip(); else hideTip();
    markTree();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onTap);

  const onTree = (ev: Event) => {
    const el = (ev.target as Element).closest("[data-id]");
    if (!el) { selected = null; markTree(); return; }
    const id = Number(el.getAttribute("data-id"));
    selected = selected === id ? null : id;
    markTree();
  };
  tree?.addEventListener("click", onTree);

  /* ── verify widget: the chain, streamed tick by tick ──────────────────── */

  const form = $<HTMLFormElement>(doc, "#verifyForm");
  let verifyRaf = 0;
  function verify(animate: boolean) {
    if (!form) return;
    const s = Number($<HTMLInputElement>(form, "#vSeed")?.value), n = Number($<HTMLInputElement>(form, "#vTicks")?.value);
    const status = $(doc, "[data-v=status]"), mine = $(doc, "[data-v=mine]"), bar = $(doc, "[data-v=bar]"), tickOut = $(doc, "[data-v=tick]");
    if (!Number.isInteger(s) || s < 0 || s > 2 ** 31 - 1 || !Number.isInteger(n) || n < 1 || n > 5000) {
      if (status) { status.className = "verdict big bad"; status.textContent = "Use a whole-number seed up to 2147483647 and between 1 and 5000 ticks."; }
      return;
    }
    cancelAnimationFrame(verifyRaf);
    const t0 = performance.now();
    const run = simulate(s, n);
    const ms = performance.now() - t0;
    const chains = chainsFor(run);
    const golden = goldens.find((g) => g.seed === s && g.ticks === n);
    setText($(doc, "[data-v=pinned]"), golden ? golden.chain : "No golden is pinned for this seed and length.");
    form.classList.toggle("noGolden", !golden);
    form.classList.remove("done");
    const finish = () => {
      setText(mine, run.chain); if (bar) bar.style.width = "100%"; setText(tickOut, tickLabel(run.ticks));
      form.classList.add("done");
      setText($(doc, "[data-v=meta]"), `${run.ticks} ticks · ${run.stats.alive} alive · gen ${run.stats.maxGen} · computed in ${ms.toFixed(0)} ms on this device`);
      if (status) {
        if (golden) { const same = golden.chain === run.chain; status.className = `verdict big ${same ? "ok" : "bad"} stamp`; status.textContent = same ? "✓ IDENTICAL — your browser agrees with the repository" : "✕ DIVERGED — this is a bug report, not a score"; }
        else { status.className = "verdict big neutral stamp"; status.textContent = "COMPUTED — compare it with the CLI from a checkout"; }
      }
      const links = $(doc, "[data-v=links]");
      if (links) {
        links.textContent = "";
        for (const r of run.records.slice(-3)) {
          const li = doc.createElement("li");
          const tl = doc.createElement("em"); tl.textContent = tickLabel(r.t);
          const rec = doc.createElement("code"); rec.textContent = stableStringify(r);
          const h = doc.createElement("span"); h.innerHTML = `record <b>${short(recordHash(r), 8)}</b> → chain <b>${short(chains[r.t - 1], 8)}</b>`;
          li.append(tl, rec, h); links.append(li);
        }
      }
    };
    if (!animate || reduce) { finish(); return; }
    if (status) { status.className = "verdict big wait"; status.textContent = `Replaying ${n} ticks in your browser…`; }
    const start = performance.now(), dur = Math.min(2200, 700 + n * 4), hex = "0123456789abcdef";
    const tickAnim = (now: number) => {
      const q = clamp((now - start) / dur, 0, 1), i = Math.max(1, Math.round(ease(q) * run.ticks));
      // the settled digits are the real chain at this tick; the tail is still churning
      const real = chains[i - 1], settled = Math.floor(64 * ease(q));
      let txt = real.slice(0, settled);
      for (let k = settled; k < 64; k++) txt += hex[(Math.random() * 16) | 0];
      setText(mine, txt); setText(tickOut, tickLabel(i));
      if (bar) bar.style.width = `${(ease(q) * 100).toFixed(1)}%`;
      if (q < 1) verifyRaf = requestAnimationFrame(tickAnim); else finish();
    };
    verifyRaf = requestAnimationFrame(tickAnim);
  }
  const onSubmit = (ev: Event) => { ev.preventDefault(); verify(true); };
  form?.addEventListener("submit", onSubmit);
  let verifiedOnce = false;
  const io = form && "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !verifiedOnce) { verifiedOnce = true; verify(true); }
  }, { threshold: 0.3 }) : null;
  if (form && io) io.observe(form); else verify(false);

  /* ── go ───────────────────────────────────────────────────────────────── */

  resize();
  const ro = new ResizeObserver(() => { const ow = W, oh = H; resize(); if (Math.abs(ow - W) > 2 || Math.abs(oh - H) > 2) place(Math.max(0, shown)); });
  ro.observe(canvas);
  if (reduce) tf = cur.run.records.length;
  advanceTo(Math.floor(tf), performance.now());
  redrawChart(); setPlayLabel(); markTree();
  // Arriving from a worm's page (/#trace-30): jump to just after its birth and trace its family.
  const trace = /^#trace-(\d+)$/.exec(location.hash);
  if (trace && cur.born.has(Number(trace[1]))) {
    const id = Number(trace[1]);
    seek(Math.min(cur.run.records.length, (cur.born.get(id)?.t ?? 0) + 2));
    selected = id; playing = !reduce; setPlayLabel(); markTree();
    stage.scrollIntoView({ block: "center" });
  }
  stage.classList.add("isLive");
  doc.documentElement.classList.add("live");
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf); cancelAnimationFrame(verifyRaf); ro.disconnect(); io?.disconnect();
    stage.removeEventListener("click", onClick);
    scrub?.removeEventListener("input", onScrub);
    chartSvg?.removeEventListener("click", onChart);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("pointerdown", onTap);
    tree?.removeEventListener("click", onTree);
    form?.removeEventListener("submit", onSubmit);
  };
}
