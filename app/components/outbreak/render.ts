/* The Outbreak renderer. It only reads the state; it never changes it.
   Everything that moves smoothly between ticks (interpolation, trails, particles,
   shake, slow motion) lives here, on the screen side of the line. */

import { cosOf, O, settleTicks, sinOf, type OEvent, type OState, type OTool, type ToolKind } from "../../../sim/outbreak";

type RGB = [number, number, number];
const DAPI: RGB = [92, 225, 255], SPINDLE: RGB = [255, 95, 183], AMBER: RGB = [255, 181, 71], WHITE: RGB = [238, 241, 248], VIOLET: RGB = [196, 184, 255], RED: RGB = [255, 99, 99], OK: RGB = [116, 240, 182];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: RGB; r: number; drag: number }
interface Floater { x: number; y: number; text: string; c: RGB; t: number; big?: boolean }
interface Ring { x: number; y: number; t: number; max: number; c: RGB; r0: number; r1: number; w: number }
interface Trail { pts: { x: number; y: number }[] }

export interface View { aimX: number; aimY: number; pointer: boolean; ghost: ToolKind | null; ghostSize: number; side: "worm" | "warden" }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private W = 0; private H = 0; private R = 0; private cx = 0; private cy = 0; private dpr = 1;
  private ground: HTMLCanvasElement | null = null; private groundKey = "";
  private glowSprite: Map<string, HTMLCanvasElement> = new Map();
  private parts: Particle[] = []; private floats: Floater[] = []; private rings: Ring[] = [];
  private trails = new Map<number, Trail>();
  shake = 0; flash = 0; flashC: RGB = WHITE; slow = 0; dangerPulse = 0;
  private strikeTrail: { x: number; y: number; t: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext("2d")!; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.R = Math.min(this.W, this.H) * 0.46; this.cx = this.W / 2; this.cy = this.H / 2;
    this.groundKey = "";
  }
  /** Screen → world, for pointers. */
  toWorld(px: number, py: number) { return { x: (px - this.cx) / this.R, y: (py - this.cy) / this.R }; }
  toScreen(x: number, y: number) { return { x: this.cx + x * this.R, y: this.cy + y * this.R }; }

  private glow(c: RGB, size: number) {
    const key = `${c.join(",")}|${size}`;
    let g = this.glowSprite.get(key);
    if (!g) {
      g = document.createElement("canvas"); g.width = g.height = size * 2;
      const x = g.getContext("2d")!, gr = x.createRadialGradient(size, size, 0, size, size, size);
      gr.addColorStop(0, rgba(c, 0.9)); gr.addColorStop(0.35, rgba(c, 0.25)); gr.addColorStop(1, rgba(c, 0));
      x.fillStyle = gr; x.fillRect(0, 0, size * 2, size * 2);
      this.glowSprite.set(key, g);
    }
    return g;
  }
  private drawGlow(x: number, y: number, r: number, c: RGB, a: number) {
    const g = this.glow(c, 64);
    this.ctx.globalAlpha = Math.max(0, Math.min(1, a));
    this.ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    this.ctx.globalAlpha = 1;
  }

  /* ── events → effects ──────────────────────────────────────────────────── */

  burst(x: number, y: number, c: RGB, n: number, speed: number, life = 0.6, r = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, c, r: r * (0.5 + Math.random()), drag: 2.4 });
    }
  }
  float(x: number, y: number, text: string, c: RGB, big = false) { this.floats.push({ x, y, text, c, t: 0, big }); }
  ring(x: number, y: number, c: RGB, r0: number, r1: number, max = 0.6, w = 2) { this.rings.push({ x, y, t: 0, max, c, r0, r1, w }); }

  onEvent(e: OEvent, s: OState) {
    const p = "x" in e ? this.toScreen(e.x, e.y) : { x: this.cx, y: this.cy };
    const R = this.R;
    switch (e.k) {
      case "born": this.burst(p.x, p.y, SPINDLE, 10, R * 0.25, 0.5, 1.6); this.ring(p.x, p.y, SPINDLE, 2, R * 0.06, 0.45, 1.5); break;
      case "eat": this.burst(p.x, p.y, AMBER, 6, R * 0.12, 0.4, 1.4); if (s.side === "worm" && s.worms.find((w) => w.id === e.id)?.lead) this.float(p.x, p.y - 8, `+${e.v.toFixed(2)}`, AMBER); break;
      case "settled": this.ring(p.x, p.y, DAPI, 3, R * 0.045, 0.5, 1.5); break;
      case "died": {
        const c = e.cause === "starve" ? AMBER : e.cause === "drone" ? RED : e.cause === "honeypot" ? AMBER : VIOLET;
        this.burst(p.x, p.y, c, e.lead ? 40 : 14, R * (e.lead ? 0.5 : 0.22), e.lead ? 1.1 : 0.7, e.lead ? 2.4 : 1.8);
        if (e.lead) { this.shake = Math.max(this.shake, 14); this.flash = 0.5; this.flashC = RED; this.slow = 1; this.float(p.x, p.y - 14, "LEAD DOWN", RED, true); }
        else if (s.side === "warden" && e.cause !== "starve") this.float(p.x, p.y - 10, e.cause === "drone" ? "+1" : e.cause === "honeypot" ? "CAUGHT" : "+1", e.cause === "drone" ? RED : VIOLET);
        this.trails.delete(e.id);
        break;
      }
      case "lead": this.ring(p.x, p.y, DAPI, 4, R * 0.18, 0.9, 2.5); this.float(p.x, p.y - 16, "THE NOTE GOES ON", DAPI, true); break;
      case "tool": this.ring(p.x, p.y, VIOLET, 4, R * 0.1, 0.5, 1.5); break;
      case "armed": if (e.kind === "harden") { this.burst(p.x, p.y, WHITE, 16, R * 0.15, 0.6, 1.6); this.groundKey = ""; } break;
      case "sweep": {
        if (e.n > 0 || e.kind === "quarantine") { this.shake = Math.max(this.shake, e.n > 3 ? 9 : 5); this.flash = Math.max(this.flash, e.n > 0 ? 0.22 : 0.08); this.flashC = VIOLET; }
        this.ring(p.x, p.y, VIOLET, 6, R * (e.kind === "alert" ? 0.4 : 0.3), 0.7, 3);
        if (e.n > 0) this.float(p.x, p.y, s.side === "warden" ? `CLEANED ${e.n}` : `−${e.n}`, VIOLET, true);
        break;
      }
      case "strike": this.ring(p.x, p.y, RED, 4, R * 0.08, 0.4, 2); break;
      case "dash": this.burst(p.x, p.y, DAPI, 14, R * 0.2, 0.35, 1.4); break;
      case "setupFailed": this.burst(p.x, p.y, [138, 146, 168], 8, R * 0.08, 0.5, 1.2); if (Math.random() < 0.35) this.float(p.x, p.y - 8, "SETUP FAILED", [138, 146, 168]); break;
      case "read": this.float(this.cx, this.cy - this.R * 0.8, s.side === "worm" ? "THE WARDENS READ YOUR NOTE" : "YOU READ THEIR NOTE", AMBER, true); break;
      case "patch": this.flash = 0.35; this.flashC = WHITE; this.shake = 10; this.float(this.cx, this.cy, `PATCHED · ${e.n} KNOCKED LOOSE`, WHITE, true); break;
    }
  }

  /* ── one frame ─────────────────────────────────────────────────────────── */

  draw(s: OState, alpha: number, prev: Map<number, { x: number; y: number }>, dt: number, now: number, view: View) {
    const ctx = this.ctx, R = this.R;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#04060a"; ctx.fillRect(0, 0, this.W, this.H);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.shake = Math.max(0, this.shake - dt * 40);
    ctx.save(); ctx.translate(sx, sy);

    this.drawGround(s);
    this.drawRim(s, now);

    ctx.save(); ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2); ctx.clip();
    for (const t of s.tools) this.drawTool(s, t, now);
    this.drawPellets(s, now);

    // worms, interpolated between ticks
    const pos = (id: number, x: number, y: number) => { const p = prev.get(id); return p ? { x: p.x + (x - p.x) * alpha, y: p.y + (y - p.y) * alpha } : { x, y }; };
    const lead = s.worms.find((w) => w.lead);
    for (const w of s.worms) {
      const q = pos(w.id, w.x, w.y);
      // Worms settled in the same cell share it: spread them round its centre so each one reads.
      if (w.st >= 1) { const a = (w.id * 2.399963) % (Math.PI * 2), k = O.cell * 0.28; q.x += Math.cos(a) * k; q.y += Math.sin(a) * k; }
      const p = this.toScreen(q.x, q.y);
      let tr = this.trails.get(w.id);
      if (!tr) { tr = { pts: [p] }; this.trails.set(w.id, tr); }
      // Keep a fine history of where the head has been; the body is cut from it by length, so it
      // looks the same at any frame rate.
      const head = tr.pts[0];
      if (Math.hypot(p.x - head.x, p.y - head.y) >= 0.75) { tr.pts.unshift(p); if (tr.pts.length > 90) tr.pts.length = 90; }
      else tr.pts[0] = p;
      if (w !== lead) this.drawWorm(s, w, tr, now, false);
    }
    if (lead) this.drawWorm(s, lead, this.trails.get(lead.id)!, now, true);

    this.drawDrone(s, alpha, now);
    this.drawFx(dt);
    if (view.ghost && view.pointer) this.drawGhost(view, s);
    ctx.restore();

    // aim line for the lead
    if (view.side === "worm" && lead && view.pointer) {
      const lp = this.toScreen(lead.x, lead.y), ap = this.toScreen(view.aimX, view.aimY);
      ctx.strokeStyle = rgba(DAPI, 0.18); ctx.setLineDash([3, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lp.x, lp.y); ctx.lineTo(ap.x, ap.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rgba(DAPI, 0.45); ctx.beginPath(); ctx.arc(ap.x, ap.y, 6, 0, Math.PI * 2); ctx.stroke();
    }
    if (view.side === "warden" && view.pointer && !view.ghost) {
      const dp = this.toScreen(s.drone.x, s.drone.y), ap = this.toScreen(view.aimX, view.aimY);
      const ready = s.drone.cd === 0 && s.drone.phase === 0;
      ctx.strokeStyle = rgba(RED, ready ? 0.35 : 0.12); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dp.x, dp.y); ctx.lineTo(ap.x, ap.y); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // screen flash, slow-motion tint, danger vignette
    if (this.flash > 0) { ctx.fillStyle = rgba(this.flashC, this.flash * 0.35); ctx.fillRect(0, 0, this.W, this.H); this.flash = Math.max(0, this.flash - dt * 1.6); }
    if (this.slow > 0) this.slow = Math.max(0, this.slow - dt * 1.4);
    if (this.dangerPulse > 0) {
      const g = ctx.createRadialGradient(this.cx, this.cy, R * 0.7, this.cx, this.cy, Math.max(this.W, this.H) * 0.7);
      g.addColorStop(0, "rgba(255,99,99,0)"); g.addColorStop(1, rgba(RED, 0.22 * this.dangerPulse * (0.6 + 0.4 * Math.sin(now / 90))));
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawGround(s: OState) {
    const key = s.hard.map((h) => (h ? 1 : 0)).join("") + `|${this.W}x${this.H}`;
    if (key !== this.groundKey) {
      this.groundKey = key;
      const g = this.ground ?? document.createElement("canvas"); this.ground = g;
      g.width = Math.round(this.W * this.dpr); g.height = Math.round(this.H * this.dpr);
      const x = g.getContext("2d")!; x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const R = this.R, cx = this.cx, cy = this.cy;
      const bg = x.createRadialGradient(cx, cy - R * 0.25, R * 0.05, cx, cy, R * 1.05);
      bg.addColorStop(0, "#0d1729"); bg.addColorStop(0.7, "#070b14"); bg.addColorStop(1, "#04060a");
      x.fillStyle = bg; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
      const cs = O.cell * R;
      for (let c = 0; c < O.grid * O.grid; c++) {
        const px = cx + (-1 + (c % O.grid) * O.cell) * R, py = cy + (-1 + Math.floor(c / O.grid) * O.cell) * R;
        if (s.hard[c]) {
          x.fillStyle = "rgba(92,225,255,0.075)"; x.fillRect(px + 1, py + 1, cs - 2, cs - 2);
          x.strokeStyle = "rgba(92,225,255,0.13)"; x.lineWidth = 1; x.beginPath();
          for (let k = -cs; k < cs; k += 6) { x.moveTo(px + Math.max(0, k), py + Math.max(0, -k)); x.lineTo(px + Math.min(cs, cs + k), py + Math.min(cs, cs - k)); }
          x.stroke();
        } else {
          x.fillStyle = "rgba(120,140,170,0.13)";
          for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(px + cs * (0.25 + (i % 2) * 0.5), py + cs * (0.25 + Math.floor(i / 2) * 0.5), 0.9, 0, Math.PI * 2); x.fill(); }
        }
      }
      x.strokeStyle = "#0f1726"; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= O.grid; i++) { const p = cx + (-1 + i * O.cell) * R; x.moveTo(p, cy - R); x.lineTo(p, cy + R); const q = cy + (-1 + i * O.cell) * R; x.moveTo(cx - R, q); x.lineTo(cx + R, q); }
      x.stroke(); x.restore();
    }
    this.ctx.drawImage(this.ground!, 0, 0, this.W, this.H);
  }

  private drawRim(s: OState, now: number) {
    const ctx = this.ctx, R = this.R, cx = this.cx, cy = this.cy;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, long = i % 10 === 0, r1 = R + 5, r2 = R + (long ? 13 : 8);
      ctx.strokeStyle = long ? "#4a5c80" : "#1a2438"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.strokeStyle = "#2c3b58"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // the day's clock, around the rim
    const p = s.tick / O.dayTicks;
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.strokeStyle = "#141c2c"; ctx.beginPath(); ctx.arc(cx, cy, R + 20, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = p > 0.85 ? rgba(AMBER, 0.6 + 0.4 * Math.sin(now / 120)) : rgba(DAPI, 0.85);
    ctx.beginPath(); ctx.arc(cx, cy, R + 20, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
    // the lid: how close the swarm is to the cap
    const fill = s.worms.length / O.cap;
    ctx.lineWidth = 2; ctx.strokeStyle = "#141c2c"; ctx.beginPath(); ctx.arc(cx, cy, R + 27, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(fill > 0.8 ? SPINDLE : mix(DAPI, SPINDLE, fill), 0.7);
    ctx.beginPath(); ctx.arc(cx, cy, R + 27, -Math.PI / 2, -Math.PI / 2 - fill * Math.PI * 2, true); ctx.stroke();
    ctx.lineCap = "butt";
  }

  private drawPellets(s: OState, now: number) {
    const ctx = this.ctx, R = this.R;
    for (const p of s.pellets) {
      const q = this.toScreen(p.x, p.y);
      const bait = p.bait > 0;
      const pulse = bait ? 0.75 + 0.25 * Math.sin(now / 260) : 0.85 + 0.15 * Math.sin(now / 400 + p.id);
      const c: RGB = bait ? [255, 170, 120] : AMBER;
      this.drawGlow(q.x, q.y, R * 0.04, c, 0.5 * pulse);
      ctx.fillStyle = rgba(mix(c, WHITE, 0.3), 0.95); ctx.beginPath(); ctx.arc(q.x, q.y, R * 0.0085, 0, Math.PI * 2); ctx.fill();
      if (bait && s.side === "worm" && s.worm.baitSense) {
        ctx.strokeStyle = rgba(RED, 0.9); ctx.lineWidth = 1.5; const k = R * 0.018;
        ctx.beginPath(); ctx.moveTo(q.x - k, q.y - k); ctx.lineTo(q.x + k, q.y + k); ctx.moveTo(q.x + k, q.y - k); ctx.lineTo(q.x - k, q.y + k); ctx.stroke();
      }
      if (bait && s.side === "warden") { ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, R * 0.022, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  private drawTool(s: OState, t: OTool, now: number) {
    if (t.done && t.kind !== "harden") return;
    if (t.kind === "honeypot" || (t.kind === "harden" && t.done)) return;
    const ctx = this.ctx, R = this.R, c = this.toScreen(t.x, t.y);
    const armed = s.tick >= t.arm, left = (t.end - s.tick) / Math.max(1, t.end - t.arm), tele = (s.tick - t.at) / Math.max(1, t.arm - t.at);
    const blink = 0.5 + 0.5 * Math.sin(now / 70);
    if (t.kind === "alert") {
      const r = t.r * R;
      if (!armed) { ctx.strokeStyle = rgba(VIOLET, 0.35 + 0.4 * blink); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, r * ease(tele), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); return; }
      ctx.fillStyle = rgba(VIOLET, 0.05); ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 3; k++) { const ph = ((now / 1400 + k / 3) % 1); ctx.strokeStyle = rgba(VIOLET, 0.35 * (1 - ph)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(c.x, c.y, r * ph, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = rgba(VIOLET, 0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
      return;
    }
    const half = (t.size * O.cell * R) / 2;
    if (!armed) {
      const k = t.kind === "harden" ? WHITE : AMBER;
      ctx.strokeStyle = rgba(k, 0.35 + 0.55 * blink); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(c.x - half, c.y - half, half * 2, half * 2); ctx.setLineDash([]);
      ctx.fillStyle = rgba(k, 0.06 + 0.06 * blink); ctx.fillRect(c.x - half, c.y - half, half * 2, half * 2);
      // countdown ticks along the top edge
      ctx.fillStyle = rgba(k, 0.9); ctx.fillRect(c.x - half, c.y - half - 5, half * 2 * (1 - tele), 2);
      ctx.font = "600 10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = rgba(k, 0.9);
      ctx.fillText(t.kind === "harden" ? "HARDEN" : "QUARANTINE", c.x, c.y - half - 9);
      return;
    }
    if (t.kind === "quarantine") {
      ctx.save(); ctx.beginPath(); ctx.rect(c.x - half, c.y - half, half * 2, half * 2); ctx.clip();
      ctx.fillStyle = rgba(VIOLET, 0.09); ctx.fillRect(c.x - half, c.y - half, half * 2, half * 2);
      ctx.strokeStyle = rgba(VIOLET, 0.16); ctx.lineWidth = 2;
      const off = (now / 40) % 14;
      ctx.beginPath(); for (let k = -half * 2 - 14; k < half * 2; k += 14) { ctx.moveTo(c.x - half + k + off, c.y - half); ctx.lineTo(c.x - half + k + off + half * 2, c.y + half); } ctx.stroke();
      if (left < 0.18) { const y = c.y - half + (1 - left / 0.18) * half * 2; ctx.fillStyle = rgba(WHITE, 0.25); ctx.fillRect(c.x - half, y - 2, half * 2, 4); }
      ctx.restore();
      ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 1.5; ctx.strokeRect(c.x - half, c.y - half, half * 2, half * 2);
      ctx.fillStyle = rgba(VIOLET, 0.9); ctx.fillRect(c.x - half, c.y + half + 3, half * 2 * left, 2);
      ctx.font = "600 9px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillText("RENT ×2", c.x, c.y - half - 5);
    }
  }

  /** n points evenly spaced along the first `len` pixels of a path. */
  private cut(path: { x: number; y: number }[], len: number, n: number) {
    const out = [path[0]];
    let need = len / (n - 1), acc = 0, i = 0, px = path[0].x, py = path[0].y;
    while (out.length < n && i < path.length - 1) {
      const q = path[i + 1], d = Math.hypot(q.x - px, q.y - py);
      if (acc + d >= need) { const t = (need - acc) / d; px += (q.x - px) * t; py += (q.y - py) * t; out.push({ x: px, y: py }); acc = 0; need = len / (n - 1); }
      else { acc += d; px = q.x; py = q.y; i++; }
    }
    return out;
  }

  private drawWorm(s: OState, w: OState["worms"][number], tr: Trail, now: number, isLead: boolean) {
    const ctx = this.ctx, R = this.R, pts = this.cut(tr.pts, R * (isLead ? 0.13 : 0.08), isLead ? 12 : 9), n = pts.length;
    const bw = R * (isLead ? 0.02 : 0.0125 + 0.0006 * Math.min(w.gen, 8));
    const poor = w.cash < 1.2, rich = w.cash > 5;
    let tone: RGB = isLead ? DAPI : mix([90, 160, 200], DAPI, Math.min(1, w.gen / 6) * 0.5);
    if (poor) tone = mix(tone, AMBER, 0.7);
    if (rich) tone = mix(tone, SPINDLE, 0.35);
    const h = pts[0];
    if (w.st === 2) {         // settled: curled up in its cell, pulsing as it earns
      const r = bw * 1.7, pul = 0.5 + 0.5 * Math.sin(now / 500 + w.id);
      this.drawGlow(h.x, h.y, r * 3, tone, 0.18 + 0.1 * pul);
      ctx.strokeStyle = rgba(mix([7, 11, 20], tone, 0.75), 1); ctx.lineWidth = bw * 1.3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0.3, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = rgba(mix(tone, WHITE, 0.4), 0.95); ctx.beginPath(); ctx.arc(h.x + Math.cos(0.3) * r, h.y + Math.sin(0.3) * r, bw * 0.85, 0, Math.PI * 2); ctx.fill();
      if (isLead) { ctx.strokeStyle = rgba(WHITE, 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h.x, h.y, r * 2.2, 0, Math.PI * 2); ctx.stroke(); }
      const split = O.split[s.notes[isLead ? s.note : w.note].split] * s.worm.splitMul;
      ctx.strokeStyle = rgba(SPINDLE, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.min(1, w.cash / split) * Math.PI * 2); ctx.stroke();
      ctx.lineCap = "butt";
      return;
    }
    if (n >= 2) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(tone, isLead ? 0.12 : 0.06); ctx.lineWidth = bw * 3.4;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      const body = mix([7, 11, 20], tone, isLead ? 0.75 : 0.55);
      for (let i = 0; i < n - 1; i++) {
        const u = i / (n - 1), taper = u < 0.12 ? 0.8 + u * 1.6 : 1 - Math.max(0, u - 0.5) * 1.3;
        ctx.strokeStyle = rgba(body, 1); ctx.lineWidth = Math.max(1, bw * 2 * taper);
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
      }
      ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    }
    this.drawGlow(h.x, h.y, bw * (isLead ? 4.2 : 2.8), tone, isLead ? 0.55 : 0.32);
    ctx.fillStyle = rgba(mix(tone, WHITE, 0.45), 1); ctx.beginPath(); ctx.arc(h.x, h.y, bw * 1.05, 0, Math.PI * 2); ctx.fill();
    if (w.st === 1) {        // settling: a progress ring
      const need = settleTicks(s, s.hard[w.cell]);
      ctx.strokeStyle = rgba(DAPI, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, bw * 2.6, -Math.PI / 2, -Math.PI / 2 + (w.prog / need) * Math.PI * 2); ctx.stroke();
    }
    if (isLead) {
      ctx.strokeStyle = rgba(WHITE, w.inv > 0 ? 0.4 + 0.4 * Math.sin(now / 50) : 0.75); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(h.x, h.y, bw * 2.4, 0, Math.PI * 2); ctx.stroke();
      const a = Math.atan2(sinOf(w.h), cosOf(w.h)), k = bw * 3.4;
      ctx.fillStyle = rgba(WHITE, 0.85); ctx.beginPath();
      ctx.moveTo(h.x + Math.cos(a) * (k + 5), h.y + Math.sin(a) * (k + 5));
      ctx.lineTo(h.x + Math.cos(a + 0.35) * k, h.y + Math.sin(a + 0.35) * k);
      ctx.lineTo(h.x + Math.cos(a - 0.35) * k, h.y + Math.sin(a - 0.35) * k); ctx.fill();
      if (poor) { const ph = (now / 500) % 1; ctx.strokeStyle = rgba(AMBER, 0.8 * (1 - ph)); ctx.beginPath(); ctx.arc(h.x, h.y, bw * (2.4 + ph * 3), 0, Math.PI * 2); ctx.stroke(); }
    }
    void R;
  }

  private drawDrone(s: OState, alpha: number, now: number) {
    const ctx = this.ctx, R = this.R, d = s.drone, p = this.toScreen(d.x, d.y);
    const P = s.side === "warden" ? O.drone.me : O.drone.ai;
    if (d.phase === 1) {     // the telegraph: where the strike will go
      const len = P.len * R, ex = p.x + Math.cos(Math.atan2(sinOf(d.lh), cosOf(d.lh))) * len, ey = p.y + Math.sin(Math.atan2(sinOf(d.lh), cosOf(d.lh))) * len;
      const k = 1 - d.t / P.tele, w = O.drone.ai.hitR * s.warden.netMul * R * 2;
      ctx.strokeStyle = rgba(RED, 0.08 + 0.12 * k); ctx.lineWidth = w; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = rgba(RED, 0.5 + 0.5 * Math.sin(now / 40)); ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = "butt";
      ctx.fillStyle = rgba(RED, 0.9); ctx.font = "800 14px Archivo, sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", ex, ey + 5);
    }
    if (d.phase === 2) { this.strikeTrail.push({ x: p.x, y: p.y, t: 0.35 }); this.shake = Math.max(this.shake, 3); }
    for (const t of this.strikeTrail) { this.drawGlow(t.x, t.y, R * 0.06, RED, t.t * 1.6); }
    // body: a small craft with spinning rotors
    const ready = d.cd === 0 && d.phase === 0;
    this.drawGlow(p.x, p.y, R * 0.07, d.phase ? RED : VIOLET, 0.45);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(sinOf(d.h), cosOf(d.h)));
    const sz = R * 0.022;
    ctx.fillStyle = d.phase ? rgba(RED, 1) : rgba(VIOLET, 1);
    ctx.beginPath(); ctx.moveTo(sz * 1.4, 0); ctx.lineTo(-sz, sz); ctx.lineTo(-sz * 0.5, 0); ctx.lineTo(-sz, -sz); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(WHITE, 0.5); ctx.lineWidth = 1;
    for (const [rx, ry] of [[-sz * 0.6, sz * 1.1], [-sz * 0.6, -sz * 1.1]]) { ctx.beginPath(); ctx.ellipse(rx, ry, sz * 0.7, sz * 0.18, now / 30, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    if (s.side === "warden") {
      const cdMax = Math.round(O.drone.me.cd * s.warden.lungeCdMul);
      ctx.strokeStyle = rgba(ready ? OK : RED, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, sz * 2.2, -Math.PI / 2, -Math.PI / 2 + (ready ? 1 : 1 - d.cd / cdMax) * Math.PI * 2); ctx.stroke();
    }
    void alpha;
  }

  private drawGhost(view: View, s: OState) {
    const ctx = this.ctx, R = this.R, p = this.toScreen(view.aimX, view.aimY);
    ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    if (view.ghost === "alert") { ctx.beginPath(); ctx.arc(p.x, p.y, O.alert.r * s.warden.alertRMul * R, 0, Math.PI * 2); ctx.stroke(); }
    else if (view.ghost === "honeypot") { ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.03, 0, Math.PI * 2); ctx.stroke(); }
    else {
      const size = view.ghostSize, half = (size * O.cell * R) / 2;
      const c = Math.floor((view.aimX + 1) / O.cell), r = Math.floor((view.aimY + 1) / O.cell);
      const gx = size % 2 ? this.cx + (-1 + (c + 0.5) * O.cell) * R : this.cx + (-1 + Math.round((view.aimX + 1) / O.cell) * O.cell) * R;
      const gy = size % 2 ? this.cy + (-1 + (r + 0.5) * O.cell) * R : this.cy + (-1 + Math.round((view.aimY + 1) / O.cell) * O.cell) * R;
      ctx.strokeRect(gx - half, gy - half, half * 2, half * 2);
    }
    ctx.setLineDash([]);
  }

  private drawFx(dt: number) {
    const ctx = this.ctx;
    for (const t of this.strikeTrail) t.t -= dt;
    this.strikeTrail = this.strikeTrail.filter((t) => t.t > 0);
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      const a = p.life / p.max;
      ctx.fillStyle = rgba(p.c, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const r of this.rings) {
      r.t += dt; const k = ease(r.t / r.max);
      ctx.strokeStyle = rgba(r.c, 1 - r.t / r.max); ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
    }
    this.rings = this.rings.filter((r) => r.t < r.max);
    ctx.textAlign = "center";
    for (const f of this.floats) {
      f.t += dt; const life = f.big ? 1.6 : 0.9, a = 1 - f.t / life, y = f.y - ease(f.t / life) * (f.big ? 26 : 18);
      ctx.font = f.big ? "800 15px Archivo, sans-serif" : "600 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = rgba([4, 6, 10], a * 0.8); ctx.fillText(f.text, f.x + 1, y + 1);
      ctx.fillStyle = rgba(f.c, a); ctx.fillText(f.text, f.x, y);
    }
    this.floats = this.floats.filter((f) => f.t < (f.big ? 1.6 : 0.9));
  }

  forget() { this.trails.clear(); this.parts = []; this.floats = []; this.rings = []; this.strikeTrail = []; }
}
