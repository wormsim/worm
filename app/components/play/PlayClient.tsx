"use client";

/* Red vs Blue, playable: you and forty rule-following bots, seven days.

   Each day runs the same four steps the real thing will: PLAN (write a note or
   place tools), SEAL (publish only a hash of your move), REVEAL (the seed is
   drawn from everyone's sealed moves), REPLAY (watch the day the engine
   computed). Everything runs in this browser; nothing is sent anywhere. */

import { useEffect, useMemo, useRef, useState } from "react";
import { botBlueMove, botRedMove, botRoster } from "../../../sim/warbots";
import {
  commitmentOf, idx, newSeason, NOTE_DEFAULT, notesCurve, noteText, playDay, seedFromCommitments, WAR, WAR_VERSION,
  type DayResult, type Ground, type Move, type Note, type SplitWhen, type Tool, type ToolKind, type WarState, type Zone
} from "../../../sim/war";
import Board from "./Board";
import ShareCard from "./ShareCard";
import { recapRed } from "../../lib/recap";
import Standings from "./Standings";
import { standings } from "../../lib/standings";
import { NotePlanner, ToolPlanner } from "./Planner";
import type { ShareData } from "../../lib/share";

type Side = "red" | "blue";
type Phase = "choose" | "plan" | "seal" | "replay" | "report" | "final";
interface Played { before: WarState; moves: Move[]; seed: number; result: DayResult; myCommitment: string; salt: string }

const ME = "you";
/* One line a day. Our words, not the paper's — each one is a thing the paper's findings imply. */
const FIELD_NOTES = [
  "Copying is the easy part. Settling in somewhere new is the hard part.",
  "Slow is not the same as safe.",
  "A note is the only thing that survives a death.",
  "Every trap teaches the one who set it, and the one who escaped it.",
  "Below one, everything ends eventually. Above one, nothing does.",
  "The swarm has no plan. It only has notes.",
  "The dish was sealed from the start. That was the point."
];

const tick = (t: number) => `T${String(Math.floor(t)).padStart(2, "0")}`;
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;
const randSalt = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0")).join("");

export default function PlayClient() {
  const [phase, setPhase] = useState<Phase>("choose");
  const [side, setSide] = useState<Side>("red");
  const [season, setSeason] = useState(20261013);
  const [state, setState] = useState<WarState>(() => newSeason(20261013));
  const [played, setPlayed] = useState<Played[]>([]);
  const [note, setNote] = useState<Note>({ ...NOTE_DEFAULT });
  const [spawns, setSpawns] = useState<[number, number][]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [tool, setTool] = useState<ToolKind>("honeypot");
  const [sealing, setSealing] = useState<{ list: string[]; mine: string; shown: number; seed: number | null } | null>(null);
  const [replayTick, setReplayTick] = useState(0);
  const [speed, setSpeed] = useState(3);
  const [verify, setVerify] = useState<Record<number, "ok" | "bad" | undefined>>({});
  const pending = useRef<{ moves: Move[]; salt: string; commitments: string[]; mine: string } | null>(null);

  const roster = useMemo(() => botRoster(side), [side]);
  const topRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Every new step starts at the top of the game, not wherever the last one left the page.
    if (phase === "replay" || phase === "report") return;
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase]);
  const last = played[played.length - 1] ?? null;
  const myFam = state.families.find((f) => f.player === ME)?.id ?? null;
  const day = state.day;

  /* ── starting a season ─────────────────────────────────────────────── */
  function start(s: Side) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const r = botRoster(s);
    setSide(s); setSeason(seed);
    setState(newSeason(seed, s === "blue" ? [...r.blue, ME] : r.blue));
    setPlayed([]); setNote({ ...NOTE_DEFAULT }); setSpawns([]); setTools([]); setVerify({});
    setPhase("plan");
  }

  /* ── planning ──────────────────────────────────────────────────────── */
  const honeypotsPlaced = tools.filter((t) => t.kind === "honeypot").length;
  function onCell(x: number, y: number) {
    if (phase !== "plan") return;
    if (side === "red") {
      if (day !== 1) return;
      setSpawns((sp) => { const exists = sp.findIndex(([a, b]) => a === x && b === y); if (exists >= 0) return sp.filter((_, i) => i !== exists); return [...sp, [x, y] as [number, number]].slice(-WAR.founders); });
    } else {
      const existing = tools.findIndex((t) => t.x === x && t.y === y && t.kind === tool);
      if (existing >= 0) { setTools(tools.filter((_, i) => i !== existing)); return; }
      if (tools.length >= WAR.toolsPerWarden + 1) return;
      if (tool === "honeypot" && honeypotsPlaced >= 1) return;
      setTools([...tools, { kind: tool, x, y }]);
    }
  }
  function hint(x: number, y: number) {
    const c = state.cells[idx(x, y)];
    const here = state.worms.filter((w) => w.x === x && w.y === y);
    const mine = here.filter((w) => w.fam === myFam).length;
    return `${c.hard ? "Hard ground · settles in 5 ticks" : "Soft ground · settles in 2 ticks"} · food ${c.food}${here.length ? ` · ${here.length} worm${here.length > 1 ? "s" : ""}${mine ? ` (${mine} yours)` : ""}` : ""}`;
  }
  const canSeal = side === "red" ? (day !== 1 || spawns.length === WAR.founders) : tools.length > 0;

  /* ── sealing and revealing ─────────────────────────────────────────── */
  function seal() {
    const myMove: Move = side === "red"
      ? { side: "red", player: ME, note, ...(day === 1 ? { spawn: spawns } : {}) }
      : { side: "blue", player: ME, tools };
    const moves: Move[] = [myMove, ...roster.red.map((n) => botRedMove(state, n, last?.result ?? null)), ...roster.blue.map((n, k) => botBlueMove(state, n, k))];
    const salt = randSalt();
    const mine = commitmentOf(myMove, salt);
    const commitments = [mine, ...moves.slice(1).map((m) => commitmentOf(m, `${m.player}|${season}|${day}`))];
    pending.current = { moves, salt, commitments, mine };
    setSealing({ list: commitments, mine, shown: 0, seed: null });
    setPhase("seal");
  }
  useEffect(() => {
    if (phase !== "seal" || !sealing) return;
    if (sealing.shown < sealing.list.length) {
      const id = setTimeout(() => setSealing((s) => s && { ...s, shown: Math.min(s.list.length, s.shown + 3) }), 45);
      return () => clearTimeout(id);
    }
    if (sealing.seed === null) {
      const id = setTimeout(() => setSealing((s) => s && { ...s, seed: seedFromCommitments(season, day, s.list) }), 500);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      const p = pending.current!;
      const seed = sealing.seed!;
      const out = playDay(state, p.moves, seed, p.commitments);
      setPlayed((xs) => [...xs, { before: state, moves: p.moves, seed, result: out.result, myCommitment: p.mine, salt: p.salt }]);
      setState(out.state);
      setReplayTick(0);
      setPhase("replay");
    }, 1100);
    return () => clearTimeout(id);
  }, [phase, sealing, season, day, state]);

  /* ── replay clock ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "replay") return;
    let raf = 0, lastT = performance.now();
    const step = (now: number) => {
      const dt = (now - lastT) / 1000; lastT = now;
      setReplayTick((t) => {
        const n = t + dt * 1.6 * speed;
        if (n >= WAR.ticksPerDay + 0.999) { setPhase("report"); return WAR.ticksPerDay; }
        return n;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed]);

  function nextDay() {
    setSpawns([]); setTools([]);
    setPhase(state.day > WAR.days ? "final" : "plan");
  }
  function rerun(i: number) {
    const p = played[i];
    const again = playDay(p.before, p.moves, seedFromCommitments(season, p.result.day, p.result.commitments), p.result.commitments);
    setVerify((v) => ({ ...v, [i]: again.result.head === p.result.head && again.result.R === p.result.R ? "ok" : "bad" }));
  }

  /* ── derived views ─────────────────────────────────────────────────── */
  const showResult = (phase === "replay" || phase === "report") ? last?.result ?? null : null;
  const boardTools = phase === "plan" ? tools : showResult ? showResult.zones : [];
  const wins = played.reduce((a, p) => ({ red: a.red + (p.result.winner === "red" ? 1 : 0), blue: a.blue + (p.result.winner === "blue" ? 1 : 0) }), { red: 0, blue: 0 });
  const liveAlive = showResult ? (showResult.frames[Math.min(showResult.frames.length - 1, Math.floor(replayTick))]?.length ?? 0) : state.worms.length;
  const liveR = showResult && showResult.startAlive ? liveAlive / showResult.startAlive : null;
  const feed = showResult ? showResult.events.filter((e) => e.t <= replayTick && (e.kind !== "settle" || e.fam === myFam) && (e.kind !== "birth" || e.fam === myFam)).slice(-9).reverse() : [];
  const curve = useMemo(() => notesCurve(state), [state]);
  const readNotes = side === "blue" ? played.flatMap((p) => p.result.events.filter((e) => e.kind === "caught" && e.by === ME).map((e) => ({ day: p.result.day, e }))) : [];
  const myCaught = side === "red" && last ? last.result.events.filter((e) => e.kind === "caught" && e.fam === myFam) : [];

  const myGens = Math.max(0, ...Object.values(state.ledger).filter((l) => l.fam === myFam).map((l) => l.gen));
  const shareDay: ShareData | null = last ? {
    side, mode: "practice", season, day: last.result.day, R: last.result.R, winner: last.result.winner,
    alive: last.result.score[ME] ?? 0, gens: myGens, caught: side === "blue" ? last.result.score[ME] ?? 0 : 0, seed: last.seed, head: last.result.head
  } : null;
  const seasonCaught = played.reduce((a, p) => a + (p.result.score[ME] ?? 0), 0);
  const shareSeason: ShareData | null = last ? {
    side, mode: "practice", season, day: 0, R: last.result.R, winner: wins.red > wins.blue ? "red" : "blue",
    alive: state.worms.filter((w) => w.fam === myFam).length, gens: myGens, caught: seasonCaught, seed: last.seed, head: last.result.head
  } : null;
  const famLabel = (fam: number) => { const f = state.families[fam]; return f ? (f.player === ME ? "your family" : f.player.replace("bot-", "#")) : `#${fam}`; };
  const eventText = (e: DayResult["events"][number]) => {
    switch (e.kind) {
      case "birth": return `${tick(e.t)} · a child is born in ${famLabel(e.fam)} · gen ${e.gen}`;
      case "settle": return `${tick(e.t)} · one of yours settled on ${e.hard ? "hard" : "soft"} ground`;
      case "starve": return `${tick(e.t)} · a worm from ${famLabel(e.fam)} could not pay rent`;
      case "caught": return `${tick(e.t)} · ${famLabel(e.fam)} walked into ${e.by === ME ? "your" : e.by.replace("bot-", "") + "'s"} honeypot`;
      case "cleaned": return `${tick(e.t)} · ${famLabel(e.fam)} cleaned up in ${e.by === ME ? "your" : e.by.replace("bot-", "") + "'s"} quarantine${e.alerted ? " · alerted" : ""}`;
    }
  };

  /* ── choose a side ─────────────────────────────────────────────────── */
  if (phase === "choose") return <div className="play choose">
    <div className="chooseHead">
      <div className="eyebrow"><i />RED VS BLUE · PROTOTYPE · RUNS IN YOUR BROWSER</div>
      <h1>Pick a side.</h1>
      <p className="lede">The research describes two things: worms that copy themselves, slowly, passing notes to their children; and defenders whose whole job is to push R below one. Here both sides are played by people, in a dish that cannot leak. Seven days. Forty bots. One move a day.</p>
    </div>
    <div className="sides">
      <button className="sideCard red" onClick={() => start("red")}>
        <span className="mono">PLAY AS</span>
        <b>Worm</b>
        <p>Spread. Settle on ground, earn, split. Each day you write the note your children will inherit.</p>
        <ul><li>Hard ground pays more but takes longer to hold</li><li>A good note is a weapon. A caught one is a leak</li></ul>
        <span className="go">START AS A WORM →</span>
      </button>
      <button className="sideCard blue" onClick={() => start("blue")}>
        <span className="mono">PLAY AS</span>
        <b>Warden</b>
        <p>Contain. Each day you place three tools: honeypots, quarantines, alerts, hardening.</p>
        <ul><li>You win any day the swarm shrinks (R &lt; 1)</li><li>Catch a worm and you read its family&apos;s note</li></ul>
        <span className="go">START AS A WARDEN →</span>
      </button>
    </div>
    <ol className="dayLoop">
      <li><span className="mono">1 · PLAN</span><b>Decide</b><p>Write a note, or place tools on the map.</p></li>
      <li><span className="mono">2 · SEAL</span><b>Commit</b><p>Only a hash of your move is published. Nobody can see it — or change theirs after seeing yours.</p></li>
      <li><span className="mono">3 · REVEAL</span><b>Draw the seed</b><p>The day&apos;s randomness is made from everyone&apos;s sealed moves. No one picks it, including us.</p></li>
      <li><span className="mono">4 · REPLAY</span><b>Watch, then check</b><p>The day plays out. Re-run it in your browser and get the same hash.</p></li>
    </ol>
  </div>;

  /* ── the game screen ───────────────────────────────────────────────── */
  const dayShown = phase === "replay" || phase === "report" ? last?.result.day ?? day : Math.min(day, WAR.days);
  return <div className="play" ref={topRef}>
    <div className="playBar">
      <span className="mono">SEASON {season} · {side === "red" ? "YOU ARE A WORM" : "YOU ARE A WARDEN"}</span>
      <span className="days">{Array.from({ length: WAR.days }, (_, i) => { const p = played[i]; return <i key={i} className={p ? p.result.winner : i + 1 === dayShown ? "now" : ""} title={p ? `Day ${i + 1}: R ${p.result.R}` : `Day ${i + 1}`}>{i + 1}</i>; })}</span>
      <span className="mono score"><b className="r">WORMS {wins.red}</b> · <b className="b">WARDENS {wins.blue}</b></span>
    </div>

    <div className="playGrid">
      <div className="playBoard">
        <div className="stageTop"><span className="mono">DAY {dayShown} OF {WAR.days} · {phase === "plan" ? "PLANNING" : phase === "seal" ? "SEALING" : phase === "replay" ? `REPLAY ${tick(replayTick)} / T${WAR.ticksPerDay}` : phase === "report" ? "DAY OVER" : "SEASON OVER"}</span>
          <span className="mono">{liveAlive} WORMS{liveR !== null ? ` · R ${liveR.toFixed(2)}` : ""}</span></div>
        <Board state={showResult ? (played[played.length - 1]?.before ?? state) : state} myFam={myFam} side={side}
          tools={boardTools} showBait={side === "blue"} spawns={phase === "plan" ? spawns : []}
          replay={showResult ? { result: showResult, tick: replayTick } : null}
          onCell={phase === "plan" ? onCell : undefined} hoverHint={hint} />
        <div className="legend mono">
          <span><i className="lg dapi" />{side === "red" ? "your worms" : "worms"}</span>
          <span><i className="lg hardKey" />hard ground</span>
          <span><i className="lg amber" />quarantine / hungry</span>
          <span><i className="lg violet" />alert</span>
          {side === "blue" && <span><i className="lg gold" />honeypot (only you see it)</span>}
        </div>
        {phase === "replay" && <div className="controls"><button className="chip" onClick={() => setSpeed(speed === 1 ? 3 : 1)}>{speed === 1 ? "FASTER ×3" : "SLOW DOWN"}</button><button className="chip" onClick={() => { setReplayTick(WAR.ticksPerDay); setPhase("report"); }}>SKIP TO THE END</button></div>}
      </div>

      <div className="playPanel">
        {phase === "plan" && side === "red" && <>
          <span className="mono step">DAY {day} · PLAN</span>
          <h2 className="ph">{day === 1 ? "Place two founders, then write a note." : "Write today's note."}</h2>
          {day === 1 && <p className="muted">Click two cells on the map. Hard ground (hatched) is slow to settle but pays almost double.</p>}
          {myCaught.length > 0 && <div className="note"><b>Yesterday a warden caught {myCaught.length} of yours</b> and read the note they carried. Consider changing it.</div>}
          <NotePlanner note={note} setNote={setNote} />
          <button className="primary wide" disabled={!canSeal} onClick={seal}>{canSeal ? "SEAL MY NOTE" : `PLACE ${WAR.founders - spawns.length} MORE FOUNDER${WAR.founders - spawns.length > 1 ? "S" : ""}`} <span>→</span></button>
        </>}

        {phase === "plan" && side === "blue" && <>
          <span className="mono step">DAY {day} · PLAN</span>
          <h2 className="ph">Place up to three tools.</h2>
          <p className="muted">Pick a tool, then click the map. Click a placed tool again to remove it. You win the day if the swarm ends smaller than it started.</p>
          <ToolPlanner tool={tool} setTool={setTool} honeypotsPlaced={honeypotsPlaced} />
          <div className="budget mono">{tools.length} / {WAR.toolsPerWarden + 1} PLACED{tools.length ? ` · ${tools.map((t) => t.kind).join(", ")}` : ""}</div>
          {readNotes.length > 0 && <div className="readNotes"><span className="mono">NOTES YOU HAVE READ</span>{readNotes.slice(-3).map(({ day: d, e }, i) => e.kind === "caught" && <blockquote key={i}><small className="mono">DAY {d} · {famLabel(e.fam).toUpperCase()}</small>{noteText(e.note)}</blockquote>)}</div>}
          <button className="primary wide" disabled={!canSeal} onClick={seal}>{canSeal ? "SEAL MY MOVES" : "PLACE AT LEAST ONE TOOL"} <span>→</span></button>
        </>}

        {phase === "seal" && sealing && <>
          <span className="mono step">DAY {day} · SEAL AND REVEAL</span>
          <h2 className="ph">You chose before the dice existed.</h2>
          <p className="muted">Every player publishes only a fingerprint of their move. When all {sealing.list.length} are in, the day&apos;s seed is made from all of them, so nobody — including us — can pick it.</p>
          <ul className="commitList">{sealing.list.slice(0, sealing.shown).map((c) => <li key={c} className={c === sealing.mine ? "mine" : ""}><code>{short(c)}</code>{c === sealing.mine && <b className="mono">YOURS</b>}</li>)}</ul>
          <div className={`seedBox${sealing.seed !== null ? " on" : ""}`}><span className="mono">SEED = SHA-256(ALL SEALED MOVES)</span><b>{sealing.seed ?? "…"}</b></div>
        </>}

        {(phase === "replay" || phase === "report") && last && <>
          <span className="mono step">DAY {last.result.day} · {phase === "replay" ? "REPLAY" : "RESULT"}</span>
          {phase === "report"
            ? <div className={`verdictBig ${last.result.winner}`}><span className="mono">R = {last.result.endAlive} / {last.result.startAlive}</span><b>{last.result.R.toFixed(2)}</b><p>{last.result.winner === "red" ? "The swarm grew. Worms take the day." : "Contained. Wardens take the day."}</p></div>
            : <div className="liveR"><span className="mono">R SO FAR</span><b>{liveR !== null ? liveR.toFixed(2) : "—"}</b><span className="meter"><i style={{ width: `${Math.min(100, (liveR ?? 0) * 50)}%` }} /><em /></span></div>}
          <ul className="feed">{(phase === "report" ? last.result.events.filter((e) => e.fam === myFam || ("by" in e && e.by === ME)).slice(-8).reverse() : feed).map((e, i) => <li key={`${e.kind}${e.id}${i}`} className={e.kind}>{eventText(e)}</li>)}
            {phase === "report" && !last.result.events.some((e) => e.fam === myFam || ("by" in e && e.by === ME)) && <li className="muted">Nothing happened to you today.</li>}</ul>
          {phase === "report" && <>
            <div className="youStat">{side === "red"
              ? <><span className="mono">YOUR FAMILY</span><b>{last.result.score[ME] ?? 0} worm{(last.result.score[ME] ?? 0) === 1 ? "" : "s"} alive</b></>
              : <><span className="mono">YOUR CATCHES TODAY</span><b>{last.result.score[ME] ?? 0} worm{(last.result.score[ME] ?? 0) === 1 ? "" : "s"}</b></>}</div>
            {side === "red" && (() => { const rc = recapRed(last.result, myFam, note); return rc && <div className="recap">
              <span className="mono">WHY · YOUR FAMILY TODAY</span>
              <ul className="mono"><li>BORN <b>{rc.born}</b></li><li>STARVED <b>{rc.starved}</b></li><li>CAUGHT <b>{rc.caught}</b></li><li>SWEPT <b>{rc.cleaned}</b></li><li>SETTLED <b>{rc.settledHard}</b> HARD · <b>{rc.settledSoft}</b> SOFT</li></ul>
              <p>{rc.advice}</p></div>; })()}
            <p className="fieldNote">“{FIELD_NOTES[(last.result.day - 1) % FIELD_NOTES.length]}”</p>
            <details className="proofBox" open>
              <summary className="mono">HOW THIS DAY WAS DECIDED</summary>
              <dl>
                <dt>Rules</dt><dd>{WAR_VERSION} · {WAR.ticksPerDay} ticks</dd>
                <dt>Sealed moves</dt><dd>{last.result.commitments.length} · yours <code>{short(last.myCommitment)}</code></dd>
                <dt>Seed</dt><dd><code>{last.seed}</code></dd>
                <dt>Chain head</dt><dd><code>{short(last.result.head)}</code></dd>
              </dl>
              <button className="chip" onClick={() => rerun(played.length - 1)}>↺ RE-RUN THIS DAY IN MY BROWSER</button>
              {verify[played.length - 1] && <span className={`verdict ${verify[played.length - 1] === "ok" ? "ok stamp" : "bad stamp"}`}>{verify[played.length - 1] === "ok" ? "✓ IDENTICAL" : "✕ DIVERGED"}</span>}
            </details>
            {shareDay && <ShareCard data={shareDay} frame={last.result.frames[last.result.frames.length - 1] ?? []} myFam={myFam} />}
            <button className="primary wide" onClick={nextDay}>{state.day > WAR.days ? "SEE THE SEASON" : `PLAN DAY ${state.day}`} <span>→</span></button>
          </>}
        </>}

        {phase === "final" && <>
          <span className="mono step">SEASON OVER</span>
          <h2 className="ph">{wins.red > wins.blue ? "The worms spread." : wins.red < wins.blue ? "The wardens held." : "A draw."}</h2>
          <p className="muted">Worms took {wins.red} day{wins.red === 1 ? "" : "s"}, wardens {wins.blue}. R doesn&apos;t care who was clever. It only counts.</p>
          <div className="youStat">{side === "red"
            ? <><span className="mono">YOUR FAMILY AT THE END</span><b>{state.worms.filter((w) => w.fam === myFam).length} worms · {Math.max(0, ...Object.values(state.ledger).filter((l) => l.fam === myFam).map((l) => l.gen))} generations</b></>
            : <><span className="mono">YOUR CATCHES THIS SEASON</span><b>{played.reduce((a, p) => a + (p.result.score[ME] ?? 0), 0)} worms</b></>}</div>
          {shareSeason && last && <ShareCard data={shareSeason} frame={last.result.frames[last.result.frames.length - 1] ?? []} myFam={myFam} />}
          <button className="primary wide" onClick={() => setPhase("choose")}>PLAY ANOTHER SEASON <span>→</span></button>
        </>}
      </div>
    </div>

    {played.length > 0 && <div className="curveBox">
      <div className="curveHead"><div><span className="mono">DO NOTES HELP? · THIS SEASON, ALL FAMILIES</span><h3>Share of each generation that managed to settle</h3></div>
        <p className="muted">In the research, inherited notes lifted success from 45% in the first generation to 61–84% later. Here the bots rewrite their notes after every loss. Whether it helps in this dish is not assumed — it is counted.</p></div>
      <div className="curve">{curve.slice(0, 8).map((r) => <div key={r.gen} className="bar"><i style={{ height: `${Math.round(r.rate * 100)}%` }} /><b>{Math.round(r.rate * 100)}%</b><span className="mono">GEN {r.gen}</span><small>{r.settled}/{r.born}</small></div>)}</div>
    </div>}

    {played.length > 0 && <Standings s={standings(state, played.map((p) => p.result))} me={ME} title="PRACTICE SEASON · STANDINGS" />}

    {played.length > 0 && <div className="history">
      <span className="mono">EVERY DAY, CHECKABLE</span>
      <table className="runsTable"><thead><tr><th>Day</th><th>R</th><th>Winner</th><th>Seed</th><th>Head</th><th /></tr></thead>
        <tbody>{played.map((p, i) => <tr key={i}><td>{p.result.day}</td><td>{p.result.R.toFixed(2)}</td><td className={p.result.winner === "red" ? "rTxt" : "bTxt"}>{p.result.winner === "red" ? "Worms" : "Wardens"}</td><td><code>{p.seed}</code></td><td><code>{short(p.result.head)}</code></td>
          <td><button className="chip" onClick={() => rerun(i)}>RE-RUN</button> {verify[i] && <span className={`verdict ${verify[i] === "ok" ? "ok" : "bad"}`}>{verify[i] === "ok" ? "✓ IDENTICAL" : "✕"}</span>}</td></tr>)}</tbody></table>
    </div>}
  </div>;
}

