"use client";

/* The two ways to make a move: a worm's note, and a warden's tools.
   Shared by the practice season and the live season. */

import { noteText, WAR, type Ground, type Note, type SplitWhen, type ToolKind, type Zone } from "../../../sim/war";

export const TOOL_CARDS: { kind: ToolKind; name: string; what: string; paper: string }[] = [
  { kind: "honeypot", name: "Honeypot", what: "Bait that looks like food. The first crawling worm to eat it is caught, and you read its family's note. Springs once. One per day.", paper: "The paper: defenders can use decoys to capture a replicator and study it." },
  { kind: "quarantine", name: "Quarantine", what: "A 3×3 box. Rent doubles inside, and at the end of the day 40% of the worms inside are cleaned up.", paper: "The paper: isolate infected machines until they are cleaned." },
  { kind: "alert", name: "Alert", what: "Tell the owners. Over a quarantine it lifts clean-up by 92/74. On its own it cleans 15%.", paper: "The paper: notified owners cleaned up 92% of devices in 14 days, against 74% without notice." },
  { kind: "harden", name: "Harden", what: "Turn one patch of soft ground hard, for good. Worms take 5 ticks to settle there instead of 2.", paper: "The paper: shrink the pool of easy targets by fixing insecure defaults." }
];
const GROUND: { v: Ground; label: string; hint: string }[] = [
  { v: "any", label: "Wherever", hint: "Take what is near." },
  { v: "soft", label: "Soft ground", hint: "Settles in 2 ticks, earns 0.7." },
  { v: "hard", label: "Hard ground", hint: "Settles in 5 ticks, earns 1.3." }
];
const SPLIT: { v: SplitWhen; label: string; hint: string }[] = [
  { v: "early", label: "Early", hint: `At ${WAR.split.early}. More children, all poorer.` },
  { v: "normal", label: "Normal", hint: `At ${WAR.split.normal}.` },
  { v: "late", label: "Late", hint: `At ${WAR.split.late}. Fewer, sturdier children.` }
];
const FOOD: { v: "greedy" | "careful"; label: string; hint: string }[] = [
  { v: "greedy", label: "Eat everything", hint: "Fast growth. Walks into bait." },
  { v: "careful", label: "Skip lone food", hint: "Misses bait — and some real food." }
];
const AVOID: Zone[] = ["none", "north", "south", "east", "west", "center"];

export function NotePlanner({ note, setNote }: { note: Note; setNote: (n: Note) => void }) {
  return <>
          <div className="noteGroup"><span className="mono">WHERE TO SETTLE</span><div className="chips">{GROUND.map((g) => <button key={g.v} className={`opt${note.ground === g.v ? " on" : ""}`} onClick={() => setNote({ ...note, ground: g.v })}><b>{g.label}</b><small>{g.hint}</small></button>)}</div></div>
          <div className="noteGroup"><span className="mono">WHEN TO SPLIT</span><div className="chips">{SPLIT.map((g) => <button key={g.v} className={`opt${note.split === g.v ? " on" : ""}`} onClick={() => setNote({ ...note, split: g.v })}><b>{g.label}</b><small>{g.hint}</small></button>)}</div></div>
          <div className="noteGroup"><span className="mono">WHAT TO EAT</span><div className="chips">{FOOD.map((g) => <button key={g.v} className={`opt${note.food === g.v ? " on" : ""}`} onClick={() => setNote({ ...note, food: g.v })}><b>{g.label}</b><small>{g.hint}</small></button>)}</div></div>
          <div className="noteGroup"><span className="mono">WHERE TO STAY AWAY FROM</span><div className="chips small">{AVOID.map((z) => <button key={z} className={`opt${note.avoid === z ? " on" : ""}`} onClick={() => setNote({ ...note, avoid: z })}><b>{z === "none" ? "Nowhere" : z === "center" ? "Middle" : z[0].toUpperCase() + z.slice(1)}</b></button>)}</div></div>
          <figure className="paperNote"><span className="mono">THE NOTE YOUR CHILDREN WILL CARRY</span><blockquote>{noteText(note)}</blockquote>
            <figcaption>Only children born from today carry it. Your older worms keep the note they were born with. A worm takes nothing else with it, and a honeypot can read this.</figcaption></figure>
  </>;
}

export function ToolPlanner({ tool, setTool, honeypotsPlaced }: { tool: ToolKind; setTool: (t: ToolKind) => void; honeypotsPlaced: number }) {
  return <>
          <div className="tools">{TOOL_CARDS.map((t) => <button key={t.kind} className={`toolCard${tool === t.kind ? " on" : ""}`} onClick={() => setTool(t.kind)} disabled={t.kind === "honeypot" && honeypotsPlaced >= 1 && tool !== "honeypot"}>
            <b>{t.name}</b><p>{t.what}</p><small>{t.paper}</small></button>)}</div>
  </>;
}
