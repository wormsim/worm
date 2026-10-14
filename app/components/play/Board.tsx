"use client";

/* The dish as a game board. Draws the ground, food, today's tools and the worms,
   either at rest (planning) or moving through a day's frames (replay). Nothing
   here decides anything: positions, wiggles and flashes are drawn from the day's
   result, which the engine already sealed. */

import { useEffect, useRef } from "react";
import { idx, insideCell, WAR, type DayResult, type FrameWorm, type Tool, type WarState } from "../../../sim/war";

export interface BoardProps {
  state: WarState;
  myFam: number | null;
  side: "red" | "blue";
  /** Tools to draw: today's plan (planning) or the day's tools (replay). */
  tools: Tool[];
  /** Honeypots are hidden from worms until they spring. */
  showBait: boolean;
  /** Founders being placed on day 1. */
  spawns?: [number, number][];
  replay?: { result: DayResult; tick: number } | null;
  onCell?: (x: number, y: number) => void;
  hoverHint?: (x: number, y: number) => string;
}

const COL = { dapi: "92,225,255", spindle: "255,95,183", amber: "255,181,71", violet: "160,140,255", ink: "238,241,248" };

export default function Board(p: BoardProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0, W = 0, dpr = 1;
    const heading = new Map<number, number>();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(W * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const draw = (now: number) => {
      const P = props.current;
      const N = WAR.size, cs = W / N, cx = W / 2, R = (WAR.radius + 0.5) * cs;
      const at = (x: number) => (x + 0.5) * cs;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);

      // the dish
      const g = ctx.createRadialGradient(cx, cx * 0.85, R * 0.1, cx, cx, R * 1.05);
      g.addColorStop(0, "#0d1729"); g.addColorStop(1, "#05070c");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2c3b58"; ctx.lineWidth = 1.2; ctx.stroke();

      // ground and food
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!insideCell(x, y)) continue;
        const c = P.state.cells[idx(x, y)];
        const px = x * cs, py = y * cs;
        if (c.hard) {
          ctx.fillStyle = "rgba(160,140,255,0.10)"; ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
          ctx.strokeStyle = "rgba(160,140,255,0.16)"; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = -cs; k < cs; k += 6) { ctx.moveTo(px + Math.max(0, k), py + Math.max(0, -k)); ctx.lineTo(px + Math.min(cs, cs + k), py + Math.min(cs, cs - k)); }
          ctx.stroke();
        }
        ctx.strokeStyle = "#141d2e"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
        for (let f = 0; f < c.food; f++) {
          ctx.fillStyle = `rgba(${COL.dapi},0.55)`;
          ctx.beginPath(); ctx.arc(px + cs * (0.3 + f * 0.4), py + cs * 0.78, Math.max(1.5, cs * 0.06), 0, Math.PI * 2); ctx.fill();
        }
      }

      // tools
      const pulse = (Math.sin(now / 380) + 1) / 2;
      const sprung = new Set((P.replay?.result.events ?? []).filter((e) => e.kind === "caught" && e.t <= (P.replay?.tick ?? 0)).map((e) => `${e.x},${e.y}`));
      for (const t of P.tools) {
        if (t.kind === "quarantine" || t.kind === "alert") {
          const x0 = (t.x - 1) * cs, y0 = (t.y - 1) * cs;
          if (t.kind === "quarantine") {
            ctx.fillStyle = `rgba(${COL.amber},0.08)`; ctx.fillRect(x0, y0, cs * 3, cs * 3);
            ctx.strokeStyle = `rgba(${COL.amber},0.75)`; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 1, y0 + 1, cs * 3 - 2, cs * 3 - 2); ctx.setLineDash([]);
          } else {
            ctx.strokeStyle = `rgba(${COL.violet},${0.35 + 0.45 * pulse})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(at(t.x), at(t.y), cs * (1.3 + pulse * 0.25), 0, Math.PI * 2); ctx.stroke();
          }
        } else if (t.kind === "harden") {
          ctx.strokeStyle = `rgba(${COL.violet},0.9)`; ctx.lineWidth = 2; ctx.strokeRect(t.x * cs + 3, t.y * cs + 3, cs - 6, cs - 6);
        } else if (t.kind === "honeypot") {
          const hit = sprung.has(`${t.x},${t.y}`);
          if (!P.showBait && !hit) continue;
          ctx.fillStyle = hit ? `rgba(${COL.spindle},0.9)` : "rgba(255,210,120,0.9)";
          ctx.beginPath(); ctx.arc(at(t.x), at(t.y), cs * 0.16, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = hit ? `rgba(${COL.spindle},0.6)` : `rgba(255,210,120,${0.3 + 0.4 * pulse})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(at(t.x), at(t.y), cs * (0.32 + 0.08 * pulse), 0, Math.PI * 2); ctx.stroke();
        }
      }

      // founders being placed
      for (const [x, y] of P.spawns ?? []) {
        ctx.strokeStyle = `rgba(${COL.dapi},${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(at(x), at(y), cs * 0.38, 0, Math.PI * 2); ctx.stroke();
      }

      // worms: at rest, or interpolated between two frames of the replay
      let pairs: { a: FrameWorm; b: FrameWorm | undefined; u: number }[];
      if (P.replay) {
        const fr = P.replay.result.frames;
        const t = Math.min(fr.length - 1, P.replay.tick), k = Math.floor(t), u = t - k;
        const next = new Map((fr[Math.min(fr.length - 1, k + 1)] ?? []).map((w) => [w[0], w]));
        pairs = (fr[k] ?? []).map((a) => ({ a, b: next.get(a[0]), u }));
      } else pairs = P.state.worms.map((w) => ({ a: [w.id, w.fam, w.x, w.y, w.settled ? 1 : 0, Math.round(w.cash * 100)] as FrameWorm, b: undefined, u: 0 }));

      const stack = new Map<string, number>();
      for (const { a, b, u } of pairs) {
        const [id, fam, ax, ay, settled, cash] = a;
        const bx = b ? b[2] : ax, by = b ? b[3] : ay;
        const ease = u * u * (3 - 2 * u);
        const key = `${ax},${ay}`, n = stack.get(key) ?? 0; stack.set(key, n + 1);
        const off = (n % 4) * cs * 0.12 - cs * 0.18;
        const x = at(ax + (bx - ax) * ease) + off, y = at(ay + (by - ay) * ease) + off * 0.6;
        if (bx !== ax || by !== ay) heading.set(id, Math.atan2(by - ay, bx - ax));
        const h = heading.get(id) ?? ((id * 2.4) % (Math.PI * 2));
        const mine = fam === P.myFam;
        const poor = cash < 60;
        const tone = poor ? COL.amber : mine ? COL.dapi : "130,150,190";
        const len = cs * (settled ? 0.36 : 0.46), wig = settled ? 0.12 : 0.35;
        ctx.lineCap = "round";
        const pts: [number, number][] = [];
        for (let s = 0; s <= 6; s++) {
          const q = s / 6, along = (0.5 - q) * len, side = Math.sin(now / 160 + id + q * 5) * cs * 0.07 * wig * 3 * q;
          pts.push([x + Math.cos(h) * along - Math.sin(h) * side, y + Math.sin(h) * along + Math.cos(h) * side]);
        }
        if (mine) { ctx.strokeStyle = `rgba(${COL.dapi},0.18)`; ctx.lineWidth = cs * 0.34; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); }
        ctx.strokeStyle = `rgba(${tone},${mine ? 0.95 : 0.55})`; ctx.lineWidth = Math.max(2, cs * (mine ? 0.14 : 0.11));
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
        ctx.fillStyle = mine ? "#e6fbff" : `rgba(${tone},0.9)`;
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], Math.max(1.6, cs * (mine ? 0.085 : 0.065)), 0, Math.PI * 2); ctx.fill();
        if (settled) { ctx.strokeStyle = `rgba(${tone},${mine ? 0.5 : 0.25})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, cs * 0.3, 0, Math.PI * 2); ctx.stroke(); }
      }

      // the day's events, as brief flashes
      if (P.replay) {
        const t = P.replay.tick;
        for (const e of P.replay.result.events) {
          const age = t - e.t;
          if (age < 0 || age > 1.6) continue;
          const a = 1 - age / 1.6, ex = at(e.x), ey = at(e.y);
          const c = e.kind === "birth" ? COL.dapi : e.kind === "caught" ? COL.spindle : e.kind === "settle" ? COL.violet : COL.amber;
          if (e.kind === "settle" && e.fam !== P.myFam) continue;
          ctx.strokeStyle = `rgba(${c},${a})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(ex, ey, cs * (0.3 + (1 - a) * 0.7), 0, Math.PI * 2); ctx.stroke();
          if (e.kind === "cleaned" || e.kind === "starve") {
            ctx.beginPath(); ctx.moveTo(ex - cs * 0.15, ey - cs * 0.15); ctx.lineTo(ex + cs * 0.15, ey + cs * 0.15); ctx.moveTo(ex + cs * 0.15, ey - cs * 0.15); ctx.lineTo(ex - cs * 0.15, ey + cs * 0.15); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const cellAt = (ev: PointerEvent): [number, number] | null => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((ev.clientX - r.left) / r.width) * WAR.size), y = Math.floor(((ev.clientY - r.top) / r.height) * WAR.size);
      return insideCell(x, y) ? [x, y] : null;
    };
    const onDown = (ev: PointerEvent) => { const c = cellAt(ev); if (c) props.current.onCell?.(c[0], c[1]); };
    const onMove = (ev: PointerEvent) => {
      const tip = tipRef.current; if (!tip) return;
      const c = cellAt(ev);
      const text = c && props.current.hoverHint ? props.current.hoverHint(c[0], c[1]) : "";
      if (!text) { tip.style.opacity = "0"; return; }
      const r = canvas.getBoundingClientRect();
      tip.textContent = text; tip.style.opacity = "1";
      const x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
      tip.style.transform = `translate(${Math.min(x, r.width - 220)}px, ${Math.min(y, r.height - 60)}px)`;
      canvas.style.cursor = props.current.onCell ? "pointer" : "default";
    };
    const onLeave = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave); };
  }, []);

  return <div className="board">
    <canvas ref={ref} aria-label="The dish, as a 13 by 13 board" />
    <div className="boardTip" ref={tipRef} />
  </div>;
}

