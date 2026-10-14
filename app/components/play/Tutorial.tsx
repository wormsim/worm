"use client";

/* The 60-second version. Opens once on the first visit to /play and any time
   from "How to play". Five cards; each drawing shows the one idea on its card. */

import { useCallback, useEffect, useState } from "react";

const SEEN = "worm:tutorial:v1";

const W = ({ x, y, n = 5, cls = "" }: { x: number; y: number; n?: number; cls?: string }) =>
  <g className={`tw ${cls}`} transform={`translate(${x} ${y})`}><g transform="scale(1.7)">{Array.from({ length: n }, (_, i) => <circle key={i} cx={-i * 6.2} cy={Math.sin(i * 0.9) * 1.8} r={i === 0 ? 4 : 3.5 - i * 0.3} />)}</g></g>;

const STEPS: { kicker: string; title: string; body: string; art: React.ReactNode }[] = [
  {
    kicker: "THE DISH",
    title: "A worm that can pay rent copies itself.",
    body: "Every worm pays rent each tick. It earns by settling on a patch of ground — soft ground is quick to take, hard ground pays more. Save enough and it splits in two. Run out and it dies. That's the whole AI worm from the paper, as an economy.",
    art: <svg viewBox="0 0 240 120" className="tArt t1"><rect x="8" y="94" width="224" height="14" className="soft" /><rect x="150" y="94" width="82" height="14" className="hard" />
      <W x={88} y={78} cls="parent" /><W x={88} y={78} cls="child" /><g className="coin"><circle cx="120" cy="36" r="9" /><text x="120" y="40">$</text></g>
      <text x="16" y="20" className="lbl">RENT −0.3 / TICK</text><text x="224" y="20" className="lbl" textAnchor="end">SPLIT AT 6.5</text></svg>
  },
  {
    kicker: "PICK A SIDE",
    title: "Worms write notes. Wardens set traps.",
    body: "As a Worm you found a family and write it a note — where to settle, when to split, what to avoid. Children inherit it, like the paper's worms passing notes to their copies. As a Warden you place a honeypot, a quarantine, an alert or hardened ground — the paper's own defences.",
    art: <svg viewBox="0 0 240 120" className="tArt t2"><line x1="120" y1="10" x2="120" y2="110" className="split" />
      <W x={62} y={84} cls="red" /><g className="note"><rect x="40" y="22" width="44" height="30" rx="2" /><line x1="46" y1="32" x2="78" y2="32" /><line x1="46" y1="40" x2="70" y2="40" /></g>
      <g className="zone"><rect x="150" y="34" width="60" height="60" /></g><g className="pot"><circle cx="180" cy="64" r="6" /></g>
      <text x="16" y="114" className="lbl">WORM</text><text x="224" y="114" className="lbl" textAnchor="end">WARDEN</text></svg>
  },
  {
    kicker: "SEAL",
    title: "You commit before anyone knows the dice.",
    body: "Your move is hashed with a secret salt and only the hash is sent. The day's randomness comes after every move is sealed — from the hashes themselves in practice, from a Robinhood Chain block in the live season. Nobody, including us, can see your move early or pick the dice.",
    art: <svg viewBox="0 0 240 120" className="tArt t3"><g className="card"><rect x="14" y="40" width="58" height="40" rx="2" /><text x="43" y="64">MOVE</text></g>
      <text x="96" y="64" className="arrow">→</text><g className="hash"><text x="160" y="50">sha256</text><text x="160" y="70" className="hx">9f3a…c21e</text></g>
      <g className="lock"><rect x="206" y="56" width="20" height="16" rx="2" /><path d="M210 56v-5a6 6 0 0 1 12 0v5" /></g>
      <g className="block"><rect x="140" y="88" width="40" height="22" /><text x="160" y="103">BLOCK</text></g></svg>
  },
  {
    kicker: "WATCH",
    title: "One number decides the day: R.",
    body: "Everyone's moves play out together for twenty ticks. R is worms alive at the end divided by worms alive at the start. Above one, the swarm grew and the Worms take the day. Below one, it was contained. That threshold is the paper's question: can it spread faster than it's cleaned up?",
    art: <svg viewBox="0 0 240 120" className="tArt t4"><line x1="20" y1="60" x2="220" y2="60" className="one" /><text x="226" y="63" className="lbl">1.0</text>
      <path className="rline" d="M20 80 C60 76 80 70 110 64 S170 44 220 36" /><circle className="rdot" r="4" cx="220" cy="36" /><text x="20" y="22" className="lbl">R = ALIVE AT END / ALIVE AT START</text>
      <text x="218" y="28" className="rv" textAnchor="end">1.24</text></svg>
  },
  {
    kicker: "CHECK",
    title: "Don't trust us. Re-run it.",
    body: "Every day ends with a chain hash over every tick. Press RE-RUN and your browser replays the whole day from the seed and the moves; if one bit differed, the hash would too. The live season is rebuilt the same way from what the server publishes. That's the game: fun first, and real underneath.",
    art: <svg viewBox="0 0 240 120" className="tArt t5"><g className="row a"><text x="16" y="44" className="lbl">SERVER</text><text x="80" y="44" className="hx">0a8a5a6b…9c02d</text></g>
      <g className="row b"><text x="16" y="72" className="lbl">YOU</text><text x="80" y="72" className="hx">0a8a5a6b…9c02d</text></g><text x="120" y="104" className="ok" textAnchor="middle">✓ IDENTICAL</text></svg>
  }
];

export default function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const close = useCallback(() => { try { localStorage.setItem(SEEN, "1"); } catch { /* storage off */ } onClose(); setTimeout(() => setI(0), 300); }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") setI((v) => Math.min(STEPS.length - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, close]);
  if (!open) return null;
  const s = STEPS[i], last = i === STEPS.length - 1;
  return <div className="tutorial" role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className="tCard">
      <div className="tTop"><span className="mono">HOW TO PLAY · {i + 1} / {STEPS.length} · ABOUT A MINUTE</span><button className="tX" onClick={close} aria-label="Close">✕</button></div>
      <div className="tStage" key={i}>{s.art}</div>
      <div className="tText" key={`t${i}`}><span className="mono step">{s.kicker}</span><h2>{s.title}</h2><p>{s.body}</p></div>
      <div className="tNav">
        <div className="tDots">{STEPS.map((_, k) => <button key={k} className={k === i ? "on" : k < i ? "done" : ""} onClick={() => setI(k)} aria-label={`Step ${k + 1}`} />)}</div>
        <div className="tBtns">{i > 0 && <button className="secondary" onClick={() => setI(i - 1)}>BACK</button>}
          <button className="primary" onClick={() => last ? close() : setI(i + 1)}>{last ? "START PLAYING" : "NEXT"} <span>→</span></button></div>
      </div>
    </div>
  </div>;
}

export const tutorialSeen = () => { try { return localStorage.getItem(SEEN) === "1"; } catch { return true; } };
