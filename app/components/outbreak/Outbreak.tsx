"use client";

/* OUTBREAK — the real-time roguelite. The game loop runs the engine at a fixed
   20 ticks a second and records every input that changes; the renderer draws
   between ticks. At the end of a run, RE-RUN replays the record from scratch. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginDay, dailySeed, endDay, forecastOf, goEndless, headingTo, IDLE, inputsAt, newRun, O, pick, Recorder, replay, step,
  type DayReport, type OState, type RunRecord, type Side, type TickInput, type ToolKind
} from "../../../sim/outbreak";
import { cardById, type Card } from "../../../sim/outbreak-cards";
import { NOTE_DEFAULT, noteText, type Note } from "../../../sim/war";
import { isMuted, setMuted, sfx, unlock } from "./audio";
import { Renderer } from "./render";
import { BADGES, load, store, type Save } from "./save";
import { boardMessage, runId, type Entry } from "../../lib/board/board";
import { checkEntry, fetchBoard, submit, type BoardView } from "./boardClient";

type Screen = "menu" | "note" | "play" | "tally" | "draft" | "over";
interface Hud { day: number; t: number; alive: number; start: number; strikes: number; score: number; cash: number; split: number; rent: number; energy: number; energyMax: number; dash: number; droneReady: boolean; boss: boolean; leadSt: number; read: Note | null }

const TICK_MS = 1000 / O.tps;
const TOOLS: { kind: ToolKind; name: string; key: string; tip: string }[] = [
  { kind: "honeypot", name: "Honeypot", key: "1", tip: "Bait. The first worm to eat it is caught — and you read its note." },
  { kind: "quarantine", name: "Quarantine", key: "2", tip: "Box. Rent ×2 inside; when it ends, 40% inside are cleaned." },
  { kind: "alert", name: "Alert", key: "3", tip: "Over a quarantine: clean-up ×92/74. Alone: cleans 15%." },
  { kind: "harden", name: "Harden", key: "4", tip: "Soft ground turns hard for good. Slower to settle." }
];
const OVER_TEXT: Record<string, { title: string; line: string; good: boolean }> = {
  won: { title: "You made it through the week.", line: "Seven days, and the swarm is still standing.", good: true },
  extinct: { title: "Extinct.", line: "The last worm is gone. Nothing was left to carry the note.", good: false },
  contained: { title: "Contained.", line: "Three days below one. The wardens kept R under control.", good: false },
  outbreak: { title: "Outbreak.", line: "The swarm got away from you.", good: false },
  eradicated: { title: "Eradicated.", line: "Zero worms. The dish is clean.", good: true }
};
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("en-US");

export default function Outbreak() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<Renderer | null>(null);
  const sRef = useRef<OState | null>(null);
  const recRef = useRef<RunRecord | null>(null);
  const dayRec = useRef<Recorder>(new Recorder());
  const prevPos = useRef(new Map<number, { x: number; y: number }>());
  const ctl = useRef({ px: 0, py: 0, pointer: false, down: false, keys: new Set<string>(), burrow: false, rally: false, dash: false, strike: false, place: false, tool: null as ToolKind | null, touch: false });
  const [screen, setScreen] = useState<Screen>("menu");
  const [side, setSide] = useState<Side>("worm");
  const [daily, setDaily] = useState(true);
  const [note, setNote] = useState<Note>({ ...NOTE_DEFAULT });
  const [hud, setHud] = useState<Hud | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolKind | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [verify, setVerify] = useState<null | "running" | { ok: boolean; head: string; score: number }>(null);
  const [tallyStep, setTallyStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [offerIds, setOfferIds] = useState<string[]>([]);
  const pausedRef = useRef(false);
  const watchRef = useRef<{ rec: RunRecord; name: string } | null>(null);
  const atRef = useRef<((t: number) => TickInput) | null>(null);
  const runDate = useRef<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const milestones = useRef(new Set<number>());
  pausedRef.current = paused;

  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => { setSave(load()); setMutedState(isMuted()); setDateLabel(today()); }, []);

  /* ── the loop ──────────────────────────────────────────────────────────── */

  const input = useCallback((): TickInput => {
    const s = sRef.current!, c = ctl.current, rend = rendRef.current!;
    const aim = rend.toWorld(c.px, c.py);
    const i: TickInput = { ...IDLE };
    if (s.side === "worm") {
      const lead = s.worms.find((w) => w.lead);
      let kx = 0, ky = 0;
      if (c.keys.has("a") || c.keys.has("arrowleft")) kx--; if (c.keys.has("d") || c.keys.has("arrowright")) kx++;
      if (c.keys.has("w") || c.keys.has("arrowup")) ky--; if (c.keys.has("s") || c.keys.has("arrowdown")) ky++;
      if (kx || ky) i.h = headingTo(kx, ky);
      else if (lead && c.pointer && (!c.touch || c.down) && (aim.x - lead.x) ** 2 + (aim.y - lead.y) ** 2 > 0.0012) i.h = headingTo(Math.round((aim.x - lead.x) * 1000) / 1000, Math.round((aim.y - lead.y) * 1000) / 1000);
      i.burrow = c.burrow || c.keys.has(" ");
      i.rally = c.rally || c.keys.has("e");
      if (c.dash) { i.dash = true; c.dash = false; }
    } else {
      const d = s.drone;
      if (c.pointer && (aim.x - d.x) ** 2 + (aim.y - d.y) ** 2 > 0.002) i.h = headingTo(Math.round((aim.x - d.x) * 1000) / 1000, Math.round((aim.y - d.y) * 1000) / 1000);
      if (c.strike) { i.strike = headingTo(Math.round((aim.x - d.x) * 1000) / 1000, Math.round((aim.y - d.y) * 1000) / 1000); c.strike = false; }
      if (c.place && c.tool) { i.place = { kind: c.tool, x: Math.round(aim.x * 1000) / 1000, y: Math.round(aim.y * 1000) / 1000 }; c.place = false; }
    }
    return i;
  }, []);

  const finishDay = useCallback(() => {
    const s = sRef.current!, rec = recRef.current!;
    const rep = endDay(s);
    setReport(rep); setTallyStep(0); setPicked(null);
    if (watchRef.current) { setScreen("tally"); return; }
    rec.days[rec.days.length - 1].inputs = dayRec.current.rows;
    // badges
    const sv = load(); const fresh: string[] = [];
    for (const b of BADGES) if (!sv.badges.includes(b.id) && b.test(s, rep)) { sv.badges.push(b.id); fresh.push(b.id); }
    if (s.over) {
      sv.runs++;
      if (s.score > sv.best[s.side]) sv.best[s.side] = s.score;
      sv.bestDay[s.side] = Math.max(sv.bestDay[s.side], s.day);
      if (s.over === "won" || s.over === "eradicated") sv.wins[s.side]++;
      if (daily) sv.daily[`${today()}:${s.side}`] = Math.max(sv.daily[`${today()}:${s.side}`] ?? 0, s.score);
    }
    store(sv); setSave(sv); setNewBadges((b) => [...b, ...fresh]);
    setScreen("tally");
    if (s.over === "won" || s.over === "eradicated") sfx.win(); else if (s.over) sfx.lose();
  }, [daily]);

  useEffect(() => {
    if (screen !== "play") return;
    const rend = rendRef.current!;
    let raf = 0, last = performance.now(), acc = 0, hudT = 0;
    // ?speed=N plays faster (for testing and impatient people). It only changes how often ticks run, never what they do.
    const speedUp = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1));
    if (speedUp > 1) (window as unknown as { __outbreak?: unknown }).__outbreak = sRef;
    const frame = (now: number) => {
      const s = sRef.current!;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      // Slow motion when the drone has drawn its line through your lead, and for a beat after a big moment.
      const lead = s.worms.find((w) => w.lead);
      let danger = false;
      if (s.side === "worm" && lead && s.drone.phase === 1) {
        const P = O.drone.ai, ux = Math.cos((s.drone.lh / 1024) * Math.PI * 2), uy = Math.sin((s.drone.lh / 1024) * Math.PI * 2);
        const vx = lead.x - s.drone.x, vy = lead.y - s.drone.y, along = vx * ux + vy * uy, perp = Math.abs(vx * uy - vy * ux);
        danger = along > -0.05 && along < P.len + 0.05 && perp < 0.11;
      }
      rend.dangerPulse = danger ? 1 : Math.max(0, rend.dangerPulse - dt * 3);
      if (danger) sfx.warn();
      const scale = pausedRef.current ? 0 : rend.slow > 0 ? 0.3 : danger ? 0.5 : 1;
      acc += dt * 1000 * scale * speedUp;
      let ended = false;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        prevPos.current = new Map(s.worms.map((w) => [w.id, { x: w.x, y: w.y }]));
        const i = watchRef.current ? atRef.current!(s.tick) : input();
        if (!watchRef.current) dayRec.current.push(s.tick, i);
        step(s, i);
        for (const e of s.events) {
          rend.onEvent(e, s);
          if (e.k === "eat") sfx.eat(); else if (e.k === "born") sfx.split(); else if (e.k === "settled") sfx.settle();
          else if (e.k === "died") { if (e.lead) sfx.leadDown(); else sfx.die(); }
          else if (e.k === "lead") sfx.newLead(); else if (e.k === "strike") sfx.telegraph(); else if (e.k === "sweep") sfx.sweep();
          else if (e.k === "tool") sfx.tool(); else if (e.k === "read") sfx.bait(); else if (e.k === "dash") sfx.dash();
        }
        if (s.side === "worm") for (const m of [10, 25, 50, 100, 200]) if (s.worms.length >= m && !milestones.current.has(m)) {
          milestones.current.add(m); const c = rend.toScreen(0, 0);
          rend.ring(c.x, c.y, [255, 95, 183], 10, 400, 1.1, 3); rend.float(c.x, c.y - 40, `${m} WORMS`, [255, 95, 183], true); sfx.newLead();
        }
        if (s.drone.phase === 2 && s.drone.t === (s.side === "warden" ? O.drone.me.dash : O.drone.ai.dash) - 1) sfx.strike();
        s.events = [];
        if (s.dayOver) { ended = true; break; }
      }
      rend.draw(s, Math.min(1, acc / TICK_MS), prevPos.current, dt, now, { aimX: rend.toWorld(ctl.current.px, ctl.current.py).x, aimY: rend.toWorld(ctl.current.px, ctl.current.py).y, pointer: ctl.current.pointer, ghost: s.side === "warden" ? ctl.current.tool : null, ghostSize: ctl.current.tool === "quarantine" ? s.warden.qSize : ctl.current.tool === "harden" ? (s.warden.hardenBig ? 3 : 2) : 0, side: s.side });
      hudT += dt;
      if (hudT > 0.08) {
        hudT = 0;
        const l = s.worms.find((w) => w.lead);
        setHud({
          day: s.day, t: s.tick, alive: s.worms.length, start: s.startAlive, strikes: s.strikes, score: s.score, cash: l?.cash ?? 0,
          split: O.split[s.notes[s.note].split] * s.worm.splitMul, rent: (O.rent * (1 + O.rentCreep * (s.day - 1))) * s.worm.rentMul,
          energy: s.energy, energyMax: O.energy.max * s.warden.energyMul, dash: s.dashCd, droneReady: s.drone.cd === 0 && s.drone.phase === 0, boss: s.boss, leadSt: l?.st ?? 0, read: s.read
        });
      }
      if (ended) { setTimeout(finishDay, 450); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [screen, input, finishDay]);

  /* ── sizing and controls ───────────────────────────────────────────────── */

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (!rendRef.current) rendRef.current = new Renderer(c);
    const ro = new ResizeObserver(() => rendRef.current!.resize());
    ro.observe(c); rendRef.current.resize();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (screen !== "play") return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "escape" || k === "p") { if (ctl.current.tool) { ctl.current.tool = null; setTool(null); } else setPaused((p) => !p); return; }
      ctl.current.keys.add(k);
      const s = sRef.current;
      if (s?.side === "worm" && (k === "shift" || k === "f")) ctl.current.dash = true;
      if (s?.side === "warden") {
        const t = TOOLS.find((x) => x.key === k);
        if (t) { ctl.current.tool = ctl.current.tool === t.kind ? null : t.kind; setTool(ctl.current.tool); sfx.click(); }
        if (k === " " || k === "f") ctl.current.strike = true;
      }
    };
    const up = (e: KeyboardEvent) => ctl.current.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [screen]);

  const pointer = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    ctl.current.px = e.clientX - r.left; ctl.current.py = e.clientY - r.top; ctl.current.pointer = true; ctl.current.touch = e.pointerType === "touch";
  };
  const onDown = (e: React.PointerEvent) => {
    unlock(); pointer(e); ctl.current.down = true;
    const s = sRef.current;
    if (!s || screen !== "play") return;
    if (s.side === "worm" && e.button === 2) { ctl.current.dash = true; return; }
    if (s.side === "warden") {
      if (ctl.current.tool && e.button !== 2) { ctl.current.place = true; if (!e.shiftKey) setTimeout(() => { ctl.current.tool = null; setTool(null); }, 0); }
      else ctl.current.strike = true;
    }
  };

  /* ── run flow ──────────────────────────────────────────────────────────── */

  function startRun(sd: Side) {
    unlock(); sfx.click();
    watchRef.current = null; setWatching(null);
    runDate.current = daily ? today() : null;
    const seed = daily ? dailySeed(today()) : (Math.random() * 2 ** 32) >>> 0;
    const s = newRun(seed, sd);
    sRef.current = s; recRef.current = { v: s.v, seed, side: sd, days: [] };
    rendRef.current?.forget(); milestones.current = new Set(); setSide(sd); setNewBadges([]); setVerify(null); setNote({ ...NOTE_DEFAULT });
    if (sd === "worm") setScreen("note"); else begin();
  }
  function begin(n?: Note) {
    const s = sRef.current!;
    const w = watchRef.current;
    if (w) {
      const d = w.rec.days[s.day];
      if (!d) { setScreen("over"); return; }
      beginDay(s, d.note);
      atRef.current = inputsAt(d.inputs);
    } else {
      beginDay(s, s.side === "worm" ? n ?? note : undefined);
      recRef.current!.days.push({ ...(s.side === "worm" ? { note: { ...(n ?? note) } } : {}), inputs: [] });
    }
    dayRec.current = new Recorder();
    ctl.current.tool = null; setTool(null); setPaused(false);
    rendRef.current?.forget();
    sfx.dayStart();
    setScreen("play");
  }
  /** Watch someone's run: the same engine, fed their recorded inputs instead of yours. */
  function watch(rec: RunRecord, name: string) {
    unlock(); sfx.click();
    const s = newRun(rec.seed, rec.side);
    sRef.current = s; recRef.current = rec; watchRef.current = { rec, name }; setWatching(name);
    rendRef.current?.forget(); milestones.current = new Set(); setSide(rec.side); setNewBadges([]); setVerify(null);
    begin();
  }
  function stopWatching() { watchRef.current = null; setWatching(null); setScreen("menu"); }
  function takeCard(id: string) {
    const s = sRef.current!;
    pick(s, id);
    if (!watchRef.current) recRef.current!.days[recRef.current!.days.length - 1].pick = id;
    setPicked(id); sfx.card(cardById(id)!.rarity);
  }
  function endless() {
    const s = sRef.current!;
    goEndless(s);
    recRef.current!.days[recRef.current!.days.length - 1].endless = true;
    setOfferIds([...s.offers]); setPicked(null);
    setScreen("draft");
  }
  function runVerify() {
    setVerify("running");
    setTimeout(() => {
      try { const r = replay(JSON.parse(JSON.stringify(recRef.current))); setVerify({ ok: r.state.head === sRef.current!.head && r.state.score === sRef.current!.score, head: r.state.head, score: r.state.score }); }
      catch { setVerify({ ok: false, head: "", score: 0 }); }
    }, 60);
  }

  // The tally counts up, a beat at a time.
  useEffect(() => {
    if (screen !== "tally" || !report) return;
    if (tallyStep >= 4) return;
    const id = setTimeout(() => { setTallyStep((v) => v + 1); sfx.tally(tallyStep * 3); }, tallyStep === 0 ? 350 : 520);
    return () => clearTimeout(id);
  }, [screen, tallyStep, report]);

  // Watching: the tally and the draft play themselves, with the picks the player made.
  useEffect(() => {
    const w = watchRef.current, st = sRef.current;
    if (!w || !st) return;
    if (screen === "tally" && tallyStep >= 4) {
      const id = setTimeout(() => {
        const d = w.rec.days[st.day - 1];
        if (st.over === "won" && d?.endless) { goEndless(st); setOfferIds([...st.offers]); setPicked(null); setScreen("draft"); return; }
        if (st.over) { setScreen("over"); return; }
        setOfferIds([...st.offers]); setScreen("draft");
      }, 1300);
      return () => clearTimeout(id);
    }
    if (screen === "draft" && !picked) {
      const id = setTimeout(() => { const d = w.rec.days[st.day - 1]; if (d?.pick) takeCard(d.pick); else begin(); }, 1100);
      return () => clearTimeout(id);
    }
    if (screen === "draft" && picked) { const id = setTimeout(() => begin(), 1300); return () => clearTimeout(id); }
  }, [screen, tallyStep, picked]);  // eslint-disable-line react-hooks/exhaustive-deps

  const s = sRef.current;
  const offers: Card[] = offerIds.map((id) => cardById(id)!).filter(Boolean);
  const houseCard = report?.aiCard ? cardById(report.aiCard) : null;
  const Rlive = hud ? hud.alive / Math.max(1, hud.start) : 1;
  const goodR = side === "worm" ? Rlive >= 1 : Rlive <= 1;

  return <div className={`ob ob-${screen}`}>
    <div className="obStage" ref={stageRef} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="obCanvas" onPointerMove={pointer} onPointerDown={onDown}
        onPointerUp={() => { ctl.current.down = false; }} onPointerLeave={() => { ctl.current.pointer = false; ctl.current.down = false; }} />

      {screen === "play" && hud && s && <>
        <div className="obHud tl">
          <span className="mono">DAY {hud.day}{s.endless ? "" : ` / ${O.days}`}{hud.boss ? " · PATCH DAY" : ""}</span>
          <b className={`obR ${goodR ? "good" : "bad"}`}>R {Rlive.toFixed(2)}</b>
          <span className="mono dim">{hud.alive} / {hud.start} WORMS · GOAL {side === "worm" ? "R ≥ 1" : "R ≤ 1"}</span>
        </div>
        <div className="obHud tr">
          <span className="mono">SCORE</span><b>{fmt(hud.score)}</b>
          <span className="obStrikes" title="Three strikes and the run ends">{Array.from({ length: O.strikes }, (_, i) => <i key={i} className={i < hud.strikes ? "on" : ""} />)}</span>
          <span className="mono dim">{Math.ceil((O.dayTicks - hud.t) / O.tps)}s LEFT</span>
        </div>
        {side === "worm" && <div className="obHud bl">
          <span className="mono">LEAD · {hud.leadSt === 2 ? "SETTLED, EARNING" : hud.leadSt === 1 ? "SETTLING…" : "CRAWLING"}</span>
          <div className="obBar"><i style={{ width: `${Math.min(100, (hud.cash / hud.split) * 100)}%` }} className={hud.cash < 1.2 ? "poor" : ""} /><s style={{ left: "100%" }} /></div>
          <span className="mono dim">{hud.cash.toFixed(2)} / SPLIT {hud.split.toFixed(1)} · RENT {hud.rent.toFixed(2)}/s</span>
        </div>}
        {side === "warden" && <div className="obHud bl">
          <span className="mono">ENERGY</span>
          <div className="obBar energy"><i style={{ width: `${(hud.energy / hud.energyMax) * 100}%` }} /></div>
          <span className="mono dim">{hud.energy.toFixed(1)} / {hud.energyMax.toFixed(0)} · DRONE {hud.droneReady ? "READY" : "CHARGING"}</span>
          {hud.read && <span className="mono obRead">THEIR NOTE: {noteText(hud.read)}</span>}
        </div>}
        {side === "worm" && !watching && <div className="obPad">
          <button className={`obBtn${hud.dash > 0 ? " cd" : ""}`} onPointerDown={(e) => { e.preventDefault(); unlock(); ctl.current.dash = true; }}>DASH<small>SHIFT</small></button>
          <button className="obBtn" onPointerDown={(e) => { e.preventDefault(); ctl.current.rally = true; }} onPointerUp={() => { ctl.current.rally = false; }} onPointerLeave={() => { ctl.current.rally = false; }}>RALLY<small>HOLD E</small></button>
          <button className="obBtn main" onPointerDown={(e) => { e.preventDefault(); ctl.current.burrow = true; }} onPointerUp={() => { ctl.current.burrow = false; }} onPointerLeave={() => { ctl.current.burrow = false; }}>BURROW<small>HOLD SPACE</small></button>
        </div>}
        {side === "warden" && !watching && <div className="obHand">
          {TOOLS.map((t) => {
            const cost = t.kind === "harden" ? s.warden.hardenCost : O.cost[t.kind];
            return <button key={t.kind} className={`obTool${tool === t.kind ? " on" : ""}${hud.energy < cost ? " poor" : ""}`} title={t.tip}
              onClick={() => { const v = ctl.current.tool === t.kind ? null : t.kind; ctl.current.tool = v; setTool(v); sfx.click(); }}>
              <span className="mono">{t.key}</span><b>{t.name}</b><i>{cost}</i></button>;
          })}
          <button className={`obTool strike${hud.droneReady ? "" : " poor"}`} onClick={() => { ctl.current.strike = true; }}><span className="mono">SPACE</span><b>Strike</b><i>⚡</i></button>
        </div>}
        <button className="obPause mono" onClick={() => setPaused((p) => !p)}>{paused ? "▶" : "II"}</button>
        {watching && <div className="obWatch"><span className="mono">● WATCHING</span><b>{watching}</b><span className="mono dim">every input is theirs · replayed by this engine</span><button className="linkish mono" onClick={stopWatching}>STOP ✕</button></div>}
        {!watching && hud.day === 1 && (save?.runs ?? 0) < 3 && hud.t > 30 && <Coach side={side} t={hud.t / O.tps} />}
        {hud.t < 34 && <div className="obIntro" key={`intro${hud.day}`}>
          <span className="mono">{hud.boss ? "THE LAST DAY" : s.endless ? `FORECAST · ${forecastOf(s).year} · A MODEL, NOT A PROPHECY` : `DAY ${hud.day} OF ${O.days}`}</span>
          <b>{hud.boss ? "Patch day." : s.endless ? `${forecastOf(s).year}.` : `Day ${hud.day}.`}</b>
          {s.endless && <em className="mono">setup {Math.round((1 - forecastOf(s).setup) * 100)}% faster than 2026{forecastOf(s).signatures ? " · wardens use signatures" : ""}{forecastOf(s).gossip ? " · notes spread sideways" : ""}{forecastOf(s).targets ? " · worms find targets" : ""}</em>}
          <em className="mono">{side === "worm" ? (hud.boss ? "Wardens bring everything. At midday, soft ground gets patched." : `${s.plan.length} warden tools today · rent ${hud.rent.toFixed(2)}/s`) : `${hud.alive} worms in the dish${hud.day > 1 ? ` · ${1 + hud.day} just arrived` : ""}`}</em>
        </div>}
      </>}

      {screen === "play" && paused && <div className="obVeil"><div className="obCard">
        <span className="mono step">PAUSED</span>
        <h2>{side === "worm" ? "You are the lead worm." : "You fly the drone."}</h2>
        {side === "worm" ? <ul className="obKeys">
          <li><b>Mouse / WASD / drag</b> steer the lead</li><li><b>Space · hold</b> burrow: settle and earn. You can&apos;t be struck underground — but sweeps still find you.</li>
          <li><b>Shift · right-click</b> dash through a strike line</li><li><b>E · hold</b> rally: crawling worms come to you</li>
          <li>A <b>lone</b> pellet is usually a honeypot. Real food grows in patches.</li></ul>
          : <ul className="obKeys"><li><b>Mouse</b> fly the drone</li><li><b>Click / Space</b> strike: a committed dash down a line</li><li><b>1–4</b> pick a tool, then click to place it</li><li>Underground worms are safe from strikes. Use boxes on them.</li></ul>}
        <div className="obRow"><button className="primary" onClick={() => setPaused(false)}>RESUME <span>→</span></button>
          <button className="secondary" onClick={() => { const m = !muted; setMuted(m); setMutedState(m); }}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
          <button className="secondary" onClick={() => { setPaused(false); setScreen("menu"); }}>QUIT RUN</button></div>
      </div></div>}

      {screen === "menu" && <div className="obVeil menu"><div className="obMenu">
        <span className="mono step">OUTBREAK · A ROGUELITE ON THE AI WORM PAPER</span>
        <h1>Pick a side.<br /><em>Seven days.</em> One number.</h1>
        <div className="obSides">
          <button className="obSide worm" onClick={() => startRun("worm")} onMouseEnter={() => sfx.hover()}>
            <span className="mono">PLAY THE</span><b>Worm</b>
            <p>Steer the lead worm. Eat, burrow, split. Your children follow the note you write. Dash through the drone&apos;s strike. Keep <strong>R ≥ 1</strong>.</p>
            <small className="mono">BEST {fmt(save?.best.worm ?? 0)} · WINS {save?.wins.worm ?? 0}</small>
          </button>
          <button className="obSide warden" onClick={() => startRun("warden")} onMouseEnter={() => sfx.hover()}>
            <span className="mono">PLAY THE</span><b>Warden</b>
            <p>Fly the drone and play honeypots, quarantines, alerts and hardening from an energy bar. The swarm learns. Keep <strong>R ≤ 1</strong>.</p>
            <small className="mono">BEST {fmt(save?.best.warden ?? 0)} · WINS {save?.wins.warden ?? 0}</small>
          </button>
        </div>
        <div className="obRow small">
          <label className="obToggle"><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> <span className="mono">DAILY DISH · SAME SEED FOR EVERYONE TODAY{dateLabel ? ` (${dateLabel})` : ""}</span></label>
          <button className="linkish mono" onClick={() => { const m = !muted; setMuted(m); setMutedState(m); }}>{muted ? "♪ SOUND OFF" : "♪ SOUND ON"}</button>
          <span className="mono dim">BADGES {save?.badges.length ?? 0} / {BADGES.length}</span>
        </div>
        <BoardPanel date={dateLabel} onWatch={watch} />
      </div></div>}

      {screen === "note" && s && <div className="obVeil"><div className="obCard wide">
        <span className="mono step">DAY {s.day + 1} · WRITE THE NOTE</span>
        <h2>{s.day === 0 ? "What should your children know?" : "Rewrite the note for tomorrow."}</h2>
        <p className="muted">Every worm your lead gives birth to carries this note, and passes it on. Older worms keep the note they were born with. In the research, notes passed down took setup success from 45% to 61–84%.</p>
        <NoteEditor note={note} setNote={setNote} />
        <div className="obPaper">{noteText(note)}</div>
        <div className="obRow"><button className="primary" onClick={() => { sfx.click(); begin(note); }}>BEGIN DAY {s.day + 1} <span>→</span></button></div>
      </div></div>}

      {screen === "tally" && report && s && <div className="obVeil"><div className="obCard tally">
        <span className="mono step">DAY {report.day} · {s.over ? "FINAL" : "OVER"}</span>
        <div className={`obStamp ${report.strike ? "bad" : "good"}`}>
          <span className="mono">R = {report.endAlive} / {report.startAlive}</span>
          <b>{report.R.toFixed(2)}</b>
          <em>{report.strike ? "STRIKE" : side === "worm" ? "THE SWARM HOLDS" : "CONTAINED"}</em>
        </div>
        <div className="obMath">
          <div className={tallyStep >= 1 ? "in" : ""}><span className="mono">{side === "worm" ? "ALIVE + BORN" : "STOPPED × 5"}</span><b>{report.chips}</b></div>
          <i className={tallyStep >= 2 ? "in" : ""}>×</i>
          <div className={`mult ${tallyStep >= 2 ? "in" : ""}`}><span className="mono">{side === "worm" ? "R × DAY" : "(2 − R) × DAY"}</span><b>{report.mult}</b></div>
          <i className={tallyStep >= 3 ? "in" : ""}>=</i>
          <div className={`pts ${tallyStep >= 3 ? "in" : ""}`}><span className="mono">POINTS</span><b>{fmt(report.points)}</b></div>
        </div>
        <ul className="obDeaths mono">
          <li>BORN <b>{report.births}</b></li><li>STARVED <b>{report.deaths.starve}</b></li><li>HONEYPOT <b>{report.deaths.honeypot}</b></li><li>SWEPT <b>{report.deaths.swept}</b></li><li>STRUCK <b>{report.deaths.drone}</b></li><li>DEEPEST GEN <b>{report.maxGen}</b></li>
        </ul>
        {tallyStep >= 4 && houseCard && <div className="obHouse"><span className="mono">{side === "worm" ? "THE WARDENS DRAFTED" : "THE SWARM DRAFTED"}</span><CardView c={houseCard} small /></div>}
        {tallyStep >= 4 && newBadges.length > 0 && <div className="obBadges">{newBadges.map((id) => { const b = BADGES.find((x) => x.id === id)!; return <span key={id} className="obBadge"><b>★ {b.name}</b> {b.text}</span>; })}</div>}
        <div className="obRow">
          <span className="mono dim">SCORE {fmt(s.score)} · STRIKES {s.strikes}/{O.strikes}</span>
          <button className="primary" disabled={tallyStep < 4} onClick={() => { sfx.click(); setNewBadges([]); setOfferIds([...s.offers]); setScreen(s.over ? "over" : "draft"); }}>{s.over ? "SEE THE RUN" : "DRAFT A CARD"} <span>→</span></button>
        </div>
      </div></div>}

      {screen === "draft" && s && <div className="obVeil"><div className="obCard wide">
        <span className="mono step">AFTER DAY {s.day} · PICK ONE</span>
        <h2>{side === "worm" ? "Mutate." : "Upgrade."}</h2>
        <div className="obCards">{offers.map((c, i) => <button key={c.id + i} className={`obPick ${c.rarity}${picked === c.id ? " taken" : picked ? " gone" : ""}`} style={{ animationDelay: `${i * 90}ms` }}
          disabled={Boolean(picked)} onClick={() => takeCard(c.id)} onMouseEnter={() => sfx.hover()}><CardView c={c} /></button>)}</div>
        {(s.cards[side].length > 0) && <p className="mono dim obOwned">YOUR BUILD · {s.cards[side].map((id) => cardById(id)!.name).join(" · ")}</p>}
        {picked && side === "worm" && <><p className="muted">Tomorrow&apos;s note — only children born from now on carry it.</p><NoteEditor note={note} setNote={setNote} compact /></>}
        <div className="obRow"><span className="mono dim">{side === "worm" ? `RENT TOMORROW ${(O.rent * (1 + O.rentCreep * s.day) * s.worm.rentMul).toFixed(2)}/s` : `THE SWARM IS ${s.worms.length} STRONG`}</span>
          <button className="primary" disabled={!picked && offers.length > 0} onClick={() => begin(note)}>BEGIN DAY {s.day + 1} <span>→</span></button></div>
      </div></div>}

      {screen === "over" && s && <div className="obVeil"><div className="obCard wide over">
        <span className="mono step">{watching ? `${watching.toUpperCase()}'S RUN · ` : "RUN OVER · "}DAY {s.day} · {side.toUpperCase()}</span>
        <h2 className={OVER_TEXT[s.over ?? "won"].good ? "good" : "bad"}>{OVER_TEXT[s.over ?? "won"].title}</h2>
        <p className="muted">{OVER_TEXT[s.over ?? "won"].line}</p>
        <div className="obFinal"><div><span className="mono">SCORE</span><b>{fmt(s.score)}</b></div><div><span className="mono">BEST</span><b>{fmt(save?.best[side] ?? 0)}</b></div><div><span className="mono">DAYS</span><b>{s.day}</b></div><div><span className="mono">DEEPEST GEN</span><b>{s.maxGen}</b></div></div>
        <div className="obSpark">{s.reports.map((r) => <i key={r.day} title={`Day ${r.day}: R ${r.R}`} className={r.strike ? "bad" : "good"} style={{ height: `${Math.min(100, r.R * 40)}%` }}><span>{r.R.toFixed(1)}</span></i>)}</div>
        <div className="obVerify">
          <button className="secondary" onClick={runVerify} disabled={verify === "running"}>{verify === "running" ? "REPLAYING…" : "↺ RE-RUN THE WHOLE RUN"}</button>
          {verify && verify !== "running" && <span className={`verdict ${verify.ok ? "ok" : "bad"}`}>{verify.ok ? `✓ IDENTICAL · ${verify.head.slice(0, 16)}… · ${fmt(verify.score)}` : "✕ DIVERGED"}</span>}
          <p className="mono dim">Your browser replays every tick of this run from the seed and the recorded inputs ({recRef.current?.days.reduce((a, d) => a + d.inputs.length, 0) ?? 0} input changes). Same head, same score — that&apos;s what makes a score checkable.</p>
        </div>
        {!watching && runDate.current && recRef.current && <Submit date={runDate.current} rec={recRef.current} score={s.score} side={side} />}
        {!watching && !runDate.current && <p className="mono dim">Random-seed runs don&apos;t go on the board. Tick DAILY DISH in the menu to compete on today&apos;s seed.</p>}
        <div className="obRow">
          {!watching && s.over === "won" && <button className="secondary" onClick={endless}>KEEP GOING · DAY 8 →</button>}
          <button className="secondary" onClick={async () => {
            const txt = `${side === "worm" ? "🪱" : "🛡️"} OUTBREAK · ${side === "worm" ? "Worm" : "Warden"} · ${OVER_TEXT[s.over ?? "won"].title}\nScore ${fmt(s.score)} · ${s.day} days · gen ${s.maxGen}\nR by day: ${s.reports.map((r) => r.R.toFixed(2)).join(" ")}\n${daily ? `Daily dish ${today()} — same seed for everyone.` : `Seed ${s.seed}.`} Every tick re-runs in your browser.`;
            try { await navigator.clipboard.writeText(txt + `\n${location.origin}/play`); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
          }}>{copied ? "COPIED" : "COPY RESULT"}</button>
          <button className="primary" onClick={() => { if (watching) stopWatching(); else setScreen("menu"); }}>{watching ? "BACK TO THE BOARD" : "PLAY AGAIN"} <span>→</span></button>
        </div>
      </div></div>}
    </div>
  </div>;
}

/* ── the daily board ─────────────────────────────────────────────────────── */

function BoardPanel({ date, onWatch }: { date: string; onWatch: (rec: RunRecord, name: string) => void }) {
  const [side, setSide] = useState<Side>("worm");
  const [view, setView] = useState<BoardView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, "…" | { proofOk: boolean; replayOk: boolean; steps: number }>>({});
  useEffect(() => { if (!date) return; setView(null); fetchBoard(date, side).then((v) => { setView(v); setErr(null); }).catch((e) => setErr(e.message)); }, [date, side]);
  const check = async (e: Entry) => {
    setChecks((c) => ({ ...c, [e.run]: "…" }));
    try { const r = await checkEntry(date, e.run, view!.root); setChecks((c) => ({ ...c, [e.run]: r })); } catch { setChecks((c) => ({ ...c, [e.run]: { proofOk: false, replayOk: false, steps: 0 } })); }
  };
  const open = async (e: Entry) => { try { const r = await checkEntry(date, e.run, view!.root); onWatch(r.record, e.name); } catch { /* unreachable */ } };
  return <div className="obBoard">
    <div className="obBoardHead">
      <span className="mono">TODAY&apos;S BOARD · {date || "…"} · EVERY SCORE REPLAYED BY THE SERVER</span>
      <div className="obBoardTabs">{(["worm", "warden"] as Side[]).map((x) => <button key={x} className={side === x ? "on" : ""} onClick={() => setSide(x)}>{x === "worm" ? "Worms" : "Wardens"}</button>)}</div>
    </div>
    {err && <p className="mono dim">The board needs the site&apos;s server ({err}). Play now; submit when you&apos;re on the live site.</p>}
    {!err && !view && <p className="mono dim">Loading…</p>}
    {view && !view.entries.length && <p className="mono dim">No runs yet today. Be the first: play on the daily dish and submit at the end.</p>}
    {view && view.entries.length > 0 && <>
      <ol className="obBoardList">{view.entries.slice(0, 8).map((e, i) => {
        const c = checks[e.run];
        return <li key={e.run}>
          <span className="mono rk">{i + 1}</span>
          <b>{e.name}{e.address && <small className="mono"> {e.address.slice(0, 6)}…{e.address.slice(-4)}</small>}</b>
          <span className="mono sc">{fmt(e.score)}</span>
          <span className="mono dim">D{e.days} · {e.over}</span>
          <button className="linkish mono" onClick={() => open(e)}>▶ WATCH</button>
          <button className="linkish mono" onClick={() => check(e)}>{!c ? "VERIFY" : c === "…" ? "…" : c.proofOk && c.replayOk ? `✓ PROOF (${c.steps}) + REPLAY` : "✕ FAILED"}</button>
        </li>;
      })}</ol>
      <p className="mono dim obRoot">ROOT {view.root.slice(0, 18)}… · {view.count} ON THIS SIDE · VERIFY checks the entry&apos;s Merkle proof against the root and replays the whole run in your browser.</p>
    </>}
  </div>;
}

function Submit({ date, rec, score, side }: { date: string; rec: RunRecord; score: number; side: Side }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem("worm:outbreak:name") ?? ""; } catch { return ""; } });
  const [sign, setSign] = useState(false);
  const [state, setState] = useState<null | "sending" | { error: string } | { rank: number | null; score: number; head: string; root?: string; proofLen?: number }>(null);
  const hasWallet = typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: unknown }).ethereum);
  const go = async () => {
    setState("sending");
    try {
      try { localStorage.setItem("worm:outbreak:name", name); } catch { /* storage off */ }
      let address: string | undefined, signature: string | undefined;
      if (sign && hasWallet) {
        const eth = (window as unknown as { ethereum: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
        const [a] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        const msg = boardMessage(date, side, score, runId(rec), name.trim().replace(/\s+/g, " "));
        const hex = "0x" + Array.from(new TextEncoder().encode(msg)).map((b) => b.toString(16).padStart(2, "0")).join("");
        signature = (await eth.request({ method: "personal_sign", params: [hex, a] })) as string; address = a;
      }
      const r = await submit({ date, record: rec, name, ...(address ? { address, signature } : {}) });
      setState({ rank: r.rank, score: r.replayed.score, head: r.replayed.head, root: r.proof?.root, proofLen: r.proof?.proof.length });
      sfx.win();
    } catch (e) { setState({ error: (e as Error).message }); }
  };
  if (state && state !== "sending" && "rank" in state) return <div className="obSubmit done">
    <span className="mono">ON THE BOARD · {date}</span>
    <b>{state.rank ? `#${state.rank}` : "Not in the top 200"}</b>
    <p className="mono">The server replayed your run: {fmt(state.score)} {state.score === score ? "✓ matches your screen" : "✕ differs"} · head {state.head.slice(0, 12)}…{state.root ? ` · Merkle proof ${state.proofLen} hashes to root ${state.root.slice(0, 10)}…` : ""}</p>
  </div>;
  return <div className="obSubmit">
    <span className="mono">SUBMIT TO TODAY&apos;S BOARD · THE SERVER REPLAYS YOUR WHOLE RUN</span>
    <div className="obRow">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (2–20 letters)" maxLength={20} />
      {hasWallet && <label className="obToggle"><input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} /> <span className="mono">SIGN WITH WALLET</span></label>}
      <button className="primary" disabled={state === "sending" || name.trim().length < 2} onClick={go}>{state === "sending" ? "REPLAYING ON THE SERVER…" : "SUBMIT"} <span>→</span></button>
    </div>
    {state && state !== "sending" && "error" in state && <p className="verdict bad">{state.error}</p>}
  </div>;
}

const COACH: Record<Side, [number, string][]> = {
  worm: [[0, "Move the mouse — your lead worm follows it. Eat the amber food."], [7, "A pellet sitting on its own is usually bait. Real food grows in clusters."], [14, "Hold SPACE to burrow: you stop, settle and earn. Hatched ground is hard — slower to settle, pays double."], [22, "A red line is the drone's strike. Get off it, or DASH with Shift. Underground, you're safe from it."], [30, "Save enough and you split. Your children follow the note you wrote. Keep R ≥ 1."]],
  warden: [[0, "Move the mouse — the drone follows it. Click to strike down the line."], [7, "Press 1–4 to pick a tool, then click the dish to place it. Tools cost energy."], [15, "Settled worms are underground: the drone can't hit them. Box them in a quarantine."], [24, "An alert over a quarantine makes its sweep clean 92/74 as much."], [32, "End the day with fewer worms than you started: R ≤ 1."]]
};
function Coach({ side, t }: { side: Side; t: number }) {
  const line = [...COACH[side]].reverse().find(([at]) => t >= at);
  if (!line) return null;
  return <div className="obCoach" key={line[0]}><span className="mono">TIP</span>{line[1]}</div>;
}

function CardView({ c, small }: { c: Card; small?: boolean }) {
  return <div className={`obCardFace ${c.rarity}${small ? " small" : ""}`}>
    <span className="mono">{c.rarity.toUpperCase()}{c.stack ? " · STACKS" : ""}</span>
    <Glyph id={c.id} /><b>{c.name}</b><p>{c.text}</p>{c.paper && !small && <small>{c.paper}</small>}
  </div>;
}

/* A small drawn mark for every card: shapes only, so the deck has a look of its own. */
function Glyph({ id }: { id: string }) {
  const g: Record<string, React.ReactNode> = {
    "thick-skin": <><circle cx="20" cy="20" r="12" /><circle cx="20" cy="20" r="7" /></>,
    "quick-dig": <><path d="M20 6v22M12 20l8 8 8-8" /><path d="M8 34h24" /></>,
    "long-legs": <><path d="M8 14l8 6-8 6M18 14l8 6-8 6M28 14l6 6-6 6" /></>,
    forager: <><circle cx="13" cy="15" r="3" /><circle cx="24" cy="12" r="3" /><circle cx="20" cy="24" r="3" /><circle cx="29" cy="25" r="3" /></>,
    "lean-split": <><circle cx="14" cy="20" r="7" /><circle cx="27" cy="20" r="5" /></>,
    brood: <><ellipse cx="20" cy="21" rx="9" ry="12" /><path d="M14 22h12" /></>,
    "bait-sense": <><path d="M5 20q15-14 30 0q-15 14-30 0z" /><circle cx="20" cy="20" r="4" /></>,
    "deep-burrow": <><path d="M6 12h28M10 19h20M14 26h12M18 33h4" /></>,
    scatter: <><circle cx="20" cy="20" r="3" /><path d="M20 12V5M20 28v7M12 20H5M28 20h7M14 14l-5-5M26 26l5 5M26 14l5-5M14 26l-5 5" /></>,
    "hard-palate": <><rect x="8" y="8" width="24" height="24" /><path d="M8 18l10-10M8 28l20-20M18 32l14-14" /></>,
    "second-wind": <><path d="M20 20m-3 0a3 3 0 1 1 6 0a7 7 0 1 1-14 0a11 11 0 1 1 22 0" /></>,
    twitch: <><path d="M22 4L10 22h10l-2 14 12-18H20z" /></>,
    mitosis: <><circle cx="20" cy="12" r="6" /><circle cx="12" cy="26" r="6" /><circle cx="28" cy="26" r="6" /></>,
    martyr: <><path d="M10 34V16a10 10 0 0 1 20 0v18l-5-4-5 4-5-4z" /><circle cx="16" cy="17" r="1.5" /><circle cx="24" cy="17" r="1.5" /></>,
    overclock: <><path d="M6 28a14 14 0 1 1 28 0" /><path d="M20 28l8-12" /></>,
    "swarm-mind": <><circle cx="20" cy="20" r="4" /><path d="M6 6l9 9M34 6l-9 9M6 34l9-9M34 34l-9-9" /></>,
    battery: <><rect x="6" y="12" width="24" height="16" /><path d="M30 17h4v6h-4M11 17v6M16 17v6M21 17v6" /></>,
    thrusters: <><path d="M8 20h18l8-6v12l-8-6" /><path d="M8 14l-4 6 4 6" /></>,
    capacitor: <><path d="M6 20h11M23 20h11M17 10v20M23 10v20" /></>,
    "wide-net": <><path d="M6 10h28M6 20h28M6 30h28M10 6v28M20 6v28M30 6v28" /></>,
    "long-q": <><rect x="6" y="6" width="22" height="22" strokeDasharray="3 3" /><circle cx="28" cy="28" r="7" /><path d="M28 24v4h3" /></>,
    "cheap-harden": <><rect x="6" y="14" width="28" height="18" /><path d="M6 23h28M15 14v9M25 23v9" /></>,
    honey2: <><path d="M20 6c6 9 10 14 10 19a10 10 0 0 1-20 0c0-5 4-10 10-19z" /><path d="M16 26a4 4 0 0 0 4 4" /></>,
    "big-q": <><rect x="4" y="4" width="32" height="32" strokeDasharray="4 3" /><rect x="12" y="12" width="16" height="16" /></>,
    loud: <><circle cx="20" cy="20" r="3" /><circle cx="20" cy="20" r="9" /><circle cx="20" cy="20" r="15" /></>,
    "notify-all": <><path d="M12 28V18a8 8 0 0 1 16 0v10l3 3H9z" /><path d="M17 34h6" /></>,
    sniffer: <><circle cx="17" cy="17" r="9" /><path d="M24 24l10 10" /></>,
    patch: <><rect x="6" y="14" width="28" height="12" rx="6" transform="rotate(-35 20 20)" /><circle cx="20" cy="20" r="1.5" /></>,
    scrubber: <><path d="M8 28h24M10 28l4-16h12l4 16" /><path d="M14 33l-2 3M20 33v3M26 33l2 3" /></>,
    overwatch: <><circle cx="20" cy="20" r="11" /><path d="M20 4v10M20 26v10M4 20h10M26 20h10" /></>
  };
  return <svg className="obGlyph" viewBox="0 0 40 40" aria-hidden="true">{g[id] ?? <circle cx="20" cy="20" r="10" />}</svg>;
}

function NoteEditor({ note, setNote, compact }: { note: Note; setNote: (n: Note) => void; compact?: boolean }) {
  const row = <K extends keyof Note>(k: K, label: string, opts: [Note[K], string][]) => <div className="obNoteRow"><span className="mono">{label}</span><div>
    {opts.map(([v, t]) => <button key={String(v)} className={note[k] === v ? "on" : ""} onClick={() => { sfx.click(); setNote({ ...note, [k]: v }); }}>{t}</button>)}</div></div>;
  return <div className={`obNote${compact ? " compact" : ""}`}>
    {row("ground", "SETTLE ON", [["any", "Anywhere"], ["soft", "Soft · fast"], ["hard", "Hard · rich"]])}
    {row("split", "SPLIT", [["early", "Early · 5"], ["normal", "Normal · 6.5"], ["late", "Late · 9"]])}
    {row("food", "FOOD", [["greedy", "Eat everything"], ["careful", "Skip lone food"]])}
    {row("avoid", "STAY AWAY FROM", [["none", "Nowhere"], ["north", "North"], ["south", "South"], ["east", "East"], ["west", "West"], ["center", "Middle"]])}
  </div>;
}
