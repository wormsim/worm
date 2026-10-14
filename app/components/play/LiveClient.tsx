"use client";

/* The live season: real players, one move a day, signed by a wallet.

   The server only stores sealed hashes, revealed moves and the drawn block.
   Everything you see here — the dish, the day's result, the scores — is
   recomputed in this browser from that published data with the same engine,
   so this page is also the check on the server. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { newSeason, NOTE_DEFAULT, WAR, type Move, type Note, type Tool, type ToolKind } from "../../../sim/war";
import { CHAIN, commitMessage, commitmentFor, seasonSeed } from "../../lib/live/protocol";
import { replaySeason, type PublishedDay } from "../../lib/live/season";
import Board from "./Board";
import { NotePlanner, ToolPlanner } from "./Planner";
import ShareCard from "./ShareCard";
import Standings from "./Standings";
import { standings } from "../../lib/standings";
import { decodeBackup, encodeBackup, seasonIcs } from "../../lib/live/backup";

type Side = "red" | "blue";
interface Status {
  now: number; season: number; day: number; phase: "commit" | "reveal" | "resolve";
  commitEnd: number; revealEnd: number; nextDay: number;
  players: { red: number; blue: number };
  today: { commits: number; reveals: number; draw: { number: number; hash: string; timestamp: number } | null };
  me: { side: Side | null; committed: boolean; revealed: boolean } | null;
  published: PublishedDay[];
}
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

const short = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`; };
const randSalt = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
const keyOf = (season: number, day: number, address: string) => `worm:live:${season}:${day}:${address}`;
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const toHex = (s: string) => "0x" + Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, "0")).join("");

export default function LiveClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [pickSide, setPickSide] = useState<Side>("red");
  const [note, setNote] = useState<Note>({ ...NOTE_DEFAULT });
  const [tools, setTools] = useState<Tool[]>([]);
  const [tool, setTool] = useState<ToolKind>("honeypot");
  const [spawns, setSpawns] = useState<[number, number][]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [replayTick, setReplayTick] = useState<number>(WAR.ticksPerDay);
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async (addr = address) => {
    try {
      const r = await fetch(`/api/live${addr ? `?address=${addr}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`the server answered ${r.status}`);
      setStatus(await r.json()); setOffline(null);
    } catch (e) { setOffline((e as Error).message || "the live server is not reachable"); }
  }, [address]);
  useEffect(() => { refresh(); const id = setInterval(() => refresh(), 30_000); return () => clearInterval(id); }, [refresh]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  // Rebuild the whole season from what the server published.
  const season = status?.season ?? 0;
  const rebuilt = useMemo(() => status ? replaySeason(season, status.published) : null, [status, season]);
  const state = rebuilt?.state ?? newSeason(seasonSeed(season));
  const lastDay = rebuilt?.resolved[rebuilt.resolved.length - 1] ?? null;
  const side: Side | null = status?.me?.side ?? null;
  const myFam = address ? state.families.find((f) => f.player === address)?.id ?? null : null;

  useEffect(() => { if (!lastDay) return; setReplayTick(0); let raf = 0, t0 = performance.now();
    const step = (t: number) => { const v = ((t - t0) / 1000) * 4; setReplayTick(Math.min(WAR.ticksPerDay, v)); if (v < WAR.ticksPerDay) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [lastDay?.result.head]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { setMsg({ kind: "bad", text: "No wallet found in this browser. Install MetaMask or Rabby, then reload." }); return; }
    try {
      const [a] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const addr = a.toLowerCase(); setAddress(addr); setMsg(null); refresh(addr);
    } catch { setMsg({ kind: "bad", text: "The wallet did not connect." }); }
  }

  const playing: Side = side ?? pickSide;
  const firstMove = playing === "red" && myFam === null;
  const canSeal = playing === "red" ? (!firstMove || spawns.length === WAR.founders) : tools.length > 0;

  async function seal() {
    if (!status || !address) return;
    const eth = (window as unknown as { ethereum?: Eth }).ethereum!;
    const move: Move = playing === "red" ? { side: "red", player: address, note, ...(firstMove ? { spawn: spawns } : {}) } : { side: "blue", player: address, tools };
    const salt = randSalt();
    const commitment = commitmentFor(move, salt);
    const message = commitMessage(status.season, status.day, playing, address, commitment);
    setBusy("Sign the message in your wallet. It moves no funds.");
    try {
      const signature = (await eth.request({ method: "personal_sign", params: [toHex(message), address] })) as string;
      setBusy("Time-locking it to 18:00 UTC…");
      // The move is also encrypted to the first drand round after 18:00, so it reveals itself — see app/lib/live/timelock.ts.
      let sealed: string | undefined;
      try { const tl = await import("../../lib/live/timelock"); sealed = await tl.sealForReveal({ move, salt }, tl.revealRound(status.season, status.day)); } catch { sealed = undefined; }
      setBusy("Sending your sealed move…");
      const r = await fetch("/api/live/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, side: playing, commitment, signature, ...(sealed ? { sealed } : {}) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      save(keyOf(status.season, status.day, address), { move, salt, commitment, locked: Boolean(sealed) });
      setMsg({ kind: "ok", text: sealed ? "Sealed and time-locked. It opens itself at 18:00 UTC — you don't need to come back." : "Sealed. Only the hash left this browser. Keep your backup code and reveal after 18:00 UTC." });
      refresh();
    } catch (e) { setMsg({ kind: "bad", text: (e as Error).message || "Signing was cancelled." }); }
    setBusy(null);
  }

  async function revealMine() {
    if (!status || !address) return;
    let local = read<{ move: Move; salt: string }>(keyOf(status.season, status.day, address));
    if (!local && pasted.trim()) {
      const b = decodeBackup(pasted, { season: status.season, day: status.day, address });
      if ("error" in b) { setMsg({ kind: "bad", text: b.error }); return; }
      local = { move: b.move, salt: b.salt };
    }
    if (!local) { setMsg({ kind: "bad", text: "This browser doesn't hold today's move. Paste the backup code you saved when you sealed." }); return; }
    setBusy("Revealing…");
    try {
      const r = await fetch("/api/live/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, move: local.move, salt: local.salt }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ kind: "ok", text: "Revealed. The server re-hashed it and it matches your seal. The day resolves at 22:00 UTC." });
      refresh();
    } catch (e) { setMsg({ kind: "bad", text: (e as Error).message }); }
    setBusy(null);
  }

  function onCell(x: number, y: number) {
    if (status?.phase !== "commit" || status.me?.committed) return;
    if (playing === "red") {
      if (!firstMove) return;
      setSpawns((sp) => { const i = sp.findIndex(([a, b]) => a === x && b === y); return i >= 0 ? sp.filter((_, k) => k !== i) : [...sp, [x, y] as [number, number]].slice(-WAR.founders); });
    } else {
      const i = tools.findIndex((t) => t.x === x && t.y === y && t.kind === tool);
      if (i >= 0) { setTools(tools.filter((_, k) => k !== i)); return; }
      if (tools.length >= WAR.toolsPerWarden + 1 || (tool === "honeypot" && tools.some((t) => t.kind === "honeypot"))) return;
      setTools([...tools, { kind: tool, x, y }]);
    }
  }

  if (offline && !status) return <div className="play liveBox">
    <span className="mono step">LIVE SEASON · {CHAIN.name.toUpperCase()}</span>
    <h2 className="ph">The live server isn&apos;t reachable from here.</h2>
    <p className="muted">The live season needs the site&apos;s own server ({offline}). The practice season above runs entirely in your browser and works anywhere.</p>
  </div>;
  if (!status) return <div className="play liveBox"><span className="mono step">LIVE SEASON</span><p className="muted">Loading today&apos;s dish…</p></div>;

  const mine = address ? read<{ move: Move; salt: string; commitment: string }>(keyOf(status.season, status.day, address)) : null;
  const backupCode = mine && address ? encodeBackup({ season: status.season, day: status.day, address, move: mine.move, salt: mine.salt, commitment: mine.commitment }) : "";
  const copyCode = async () => { try { await navigator.clipboard.writeText(backupCode); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setMsg({ kind: "bad", text: "Copy was blocked — select the code and copy it by hand." }); } };
  const downloadIcs = () => {
    const blob = new Blob([seasonIcs(status.season, status.day, window.location.origin, side ?? pickSide)], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `worm-season-${status.season}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const phaseText = status.phase === "commit" ? `Moves seal in ${hms(status.commitEnd - now)}` : status.phase === "reveal" ? `Reveal window closes in ${hms(status.revealEnd - now)}` : `Next day opens in ${hms(status.nextDay - now)}`;
  const showReplay = lastDay && !(status.phase === "commit" && !status.me?.committed && address);
  const share = lastDay && address && side && lastDay.moves.some((m) => m.player === address) ? {
    side, mode: "live" as const, season, day: lastDay.result.day, R: lastDay.result.R, winner: lastDay.result.winner,
    alive: lastDay.result.score[address] ?? 0, gens: Math.max(0, ...Object.values(state.ledger).filter((l) => l.fam === myFam).map((l) => l.gen)),
    caught: side === "blue" ? lastDay.result.score[address] ?? 0 : 0, seed: lastDay.seed, head: lastDay.result.head
  } : null;

  return <div className="play live">
    <div className="playBar">
      <span className="mono">LIVE · SEASON {status.season} · {CHAIN.name.toUpperCase()}</span>
      <span className="days">{Array.from({ length: WAR.days }, (_, i) => { const r = rebuilt?.resolved.find((d) => d.day === i + 1); return <i key={i} className={r ? r.result.winner : i + 1 === status.day ? "now" : ""}>{i + 1}</i>; })}</span>
      <span className="mono">{status.players.red} WORM{status.players.red === 1 ? "" : "S"} · {status.players.blue} WARDEN{status.players.blue === 1 ? "" : "S"} · {phaseText}</span>
    </div>
    <div className="playGrid">
      <div className="playBoard">
        <div className="stageTop"><span className="mono">{showReplay ? `DAY ${lastDay!.result.day} · REPLAYED IN YOUR BROWSER` : `DAY ${status.day} · ${status.phase.toUpperCase()}`}</span><span className="mono">{state.worms.length} WORMS</span></div>
        <Board state={showReplay ? (rebuilt!.resolved.length > 1 ? replaySeason(season, status.published.slice(0, -1)).state : newSeason(seasonSeed(season))) : state}
          myFam={myFam} side={playing} tools={showReplay ? lastDay!.result.zones : tools} showBait={playing === "blue"}
          spawns={!showReplay ? spawns : []} replay={showReplay ? { result: lastDay!.result, tick: replayTick } : null}
          onCell={!showReplay ? onCell : undefined} hoverHint={() => ""} />
      </div>
      <div className="playPanel">
        {!address && <>
          <span className="mono step">DAY {status.day} · {status.phase.toUpperCase()}</span>
          <h2 className="ph">Play the live season.</h2>
          <p className="muted">One move a day, signed by your wallet. The signature moves no funds and approves nothing: it only proves the sealed move is yours. The day&apos;s randomness comes from the first {CHAIN.name} block after 18:00 UTC.</p>
          <button className="primary wide" onClick={connect}>CONNECT WALLET <span>→</span></button>
          <button className="linkish mono" onClick={downloadIcs}>ADD THE SEASON&apos;S WINDOWS TO MY CALENDAR ↓</button>
        </>}

        {address && !side && status.phase === "commit" && <>
          <span className="mono step">CHOOSE FOR THE WHOLE SEASON</span>
          <div className="chips">{(["red", "blue"] as Side[]).map((s) => <button key={s} className={`opt${pickSide === s ? " on" : ""}`} onClick={() => setPickSide(s)}><b>{s === "red" ? "Worm" : "Warden"}</b><small>{s === "red" ? "Spread, and write notes" : "Contain, push R below one"}</small></button>)}</div>
        </>}

        {address && status.phase === "commit" && !status.me?.committed && <>
          <span className="mono step">DAY {status.day} · YOUR MOVE · {phaseText.toUpperCase()}</span>
          {playing === "red" ? <>
            {firstMove && <p className="muted">Your family has not been founded yet. Click two cells on the map for your founders.</p>}
            <NotePlanner note={note} setNote={setNote} />
          </> : <>
            <p className="muted">Pick a tool, then click the map. Up to three, one honeypot.</p>
            <ToolPlanner tool={tool} setTool={setTool} honeypotsPlaced={tools.filter((t) => t.kind === "honeypot").length} />
          </>}
          <button className="primary wide" disabled={!canSeal || Boolean(busy)} onClick={seal}>{busy ?? (canSeal ? "SIGN AND SEAL" : playing === "red" ? "PLACE YOUR FOUNDERS" : "PLACE A TOOL")} <span>→</span></button>
        </>}

        {address && status.me?.committed && !status.me.revealed && <>
          <span className="mono step">DAY {status.day} · SEALED</span>
          <h2 className="ph">{status.phase === "reveal" ? "Opening your move…" : "Sealed. You're done for today."}</h2>
          <p className="muted">{status.phase === "reveal"
            ? `Block #${status.today.draw?.number ?? "…"} has been drawn. Your time-locked move opens with the 18:00 drand round and the server reveals it — it only accepts a move that hashes to your seal. If it hasn't shown up in a few minutes, reveal it by hand below.`
            : `Your move is time-locked to the first drand round after 18:00 UTC: nobody can open it before then, not even us. At 18:00 it opens itself. ${phaseText}.`}</p>
          {mine && <div className="backup">
            <span className="mono">BACKUP CODE · ONLY NEEDED IF THE TIME-LOCK FAILS</span>
            <code>{backupCode}</code>
            <div className="row"><button className="secondary" onClick={copyCode}>{copied ? "COPIED" : "COPY CODE"} <span>⧉</span></button><button className="secondary" onClick={downloadIcs}>ADD REMINDERS <span>.ics</span></button></div>
            <small className="muted">It lets you reveal from any browser. Anyone with it could reveal for you — but only this exact move; nothing else matches your seal.</small>
          </div>}
          {!mine && <div className="backup">
            <span className="mono">SEALED FROM ANOTHER BROWSER?</span>
            <textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste your WORM1-… backup code" spellCheck={false} />
          </div>}
          {status.phase === "reveal" && <button className="secondary wide" disabled={Boolean(busy) || (!mine && !pasted.trim())} onClick={revealMine}>{busy ?? "REVEAL BY HAND"} <span>→</span></button>}
        </>}
        {address && status.me?.revealed && <><span className="mono step">DAY {status.day} · REVEALED</span><p className="muted">Your move is in. The day resolves at 22:00 UTC; then this page replays it from the published data.</p></>}
        {address && status.phase !== "commit" && !status.me?.committed && <p className="muted">Today&apos;s moves are sealed. The next day opens at 00:00 UTC.</p>}
        {msg && <p className={`verdict ${msg.kind === "ok" ? "ok" : "bad"}`}>{msg.text}</p>}

        {lastDay && <>
          <div className={`verdictBig ${lastDay.result.winner}`}><span className="mono">DAY {lastDay.result.day} · R = {lastDay.result.endAlive} / {lastDay.result.startAlive}</span><b>{lastDay.result.R.toFixed(2)}</b><p>{lastDay.result.winner === "red" ? "The swarm grew." : "Contained."}</p></div>
          <details className="proofBox" open>
            <summary className="mono">CHECKED IN THIS BROWSER</summary>
            <dl>
              <dt>Block</dt><dd><a href={`${CHAIN.explorer}/block/${status.published[status.published.length - 1].draw.number}`} target="_blank" rel="noreferrer">#{status.published[status.published.length - 1].draw.number} ↗</a> <code>{short(status.published[status.published.length - 1].draw.hash)}</code></dd>
              <dt>Sealed moves</dt><dd>{lastDay.commitments.length} ({status.published[status.published.length - 1].humanCommitments.length} human)</dd>
              <dt>Seed</dt><dd><code>{lastDay.seed}</code></dd>
              <dt>Chain head</dt><dd><code>{short(lastDay.result.head, 10)}</code></dd>
            </dl>
            <p className="muted" style={{ fontSize: 13 }}>Your browser rebuilt the season from the published moves and blocks with the same engine the server uses. These numbers are its own.</p>
          </details>
          {share && <ShareCard data={share} frame={lastDay.result.frames[lastDay.result.frames.length - 1] ?? []} myFam={myFam} />}
        </>}
      </div>
    </div>
    {rebuilt && rebuilt.resolved.length > 0 && <Standings s={standings(state, rebuilt.resolved.map((d) => d.result))} me={address} link title={`SEASON ${season} · STANDINGS`} />}
    {address && <p className="mono" style={{ marginTop: 12, fontSize: 10.5, letterSpacing: ".1em" }}><a className="linkish" href={`/player/${address}`}>YOUR SEASON PAGE →</a></p>}
  </div>;
}
