/* What Outbreak remembers in your browser: bests, runs, badges. Nothing leaves it. */

import type { DayReport, OState, Side } from "../../../sim/outbreak";

export interface Save { v: 1; best: Record<Side, number>; bestDay: Record<Side, number>; runs: number; wins: Record<Side, number>; badges: string[]; daily: Record<string, number> }
const KEY = "worm:outbreak:v1";
const fresh = (): Save => ({ v: 1, best: { worm: 0, warden: 0 }, bestDay: { worm: 0, warden: 0 }, runs: 0, wins: { worm: 0, warden: 0 }, badges: [], daily: {} });

export function load(): Save { try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); return s?.v === 1 ? { ...fresh(), ...s } : fresh(); } catch { return fresh(); } }
export function store(s: Save) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage off */ } }

export interface Badge { id: string; name: string; text: string; test: (s: OState, last: DayReport | null) => boolean }
export const BADGES: Badge[] = [
  { id: "first-split", name: "First Split", text: "A worm of yours split in two.", test: (s) => s.side === "worm" && s.maxGen >= 1 },
  { id: "gen-10", name: "Tenth Generation", text: "Your line reached generation 10.", test: (s) => s.side === "worm" && s.maxGen >= 10 },
  { id: "hundred", name: "A Hundred Mouths", text: "100 worms alive at once.", test: (s) => s.side === "worm" && s.worms.length >= 100 },
  { id: "lid", name: "Lid Off", text: "The swarm hit the lid: 240 worms.", test: (s) => s.side === "worm" && s.worms.length >= 240 },
  { id: "r3", name: "R = 3", text: "A day where the swarm tripled.", test: (s, d) => s.side === "worm" && !!d && d.R >= 3 },
  { id: "worm-win", name: "Survived the Week", text: "Won a run as the Worm.", test: (s) => s.side === "worm" && s.over === "won" },
  { id: "no-strikes", name: "Never Below One", text: "Won as the Worm with no strikes.", test: (s) => s.side === "worm" && s.over === "won" && s.strikes === 0 },
  { id: "eradicated", name: "Eradicated", text: "Took the swarm to zero.", test: (s) => s.side === "warden" && s.over === "eradicated" },
  { id: "warden-win", name: "Held the Line", text: "Won a run as the Warden.", test: (s) => s.side === "warden" && (s.over === "won" || s.over === "eradicated") },
  { id: "sweep-10", name: "Clean Sweep", text: "Cleaned 10 worms in one day as the Warden.", test: (s, d) => s.side === "warden" && !!d && d.deaths.swept >= 10 },
  { id: "r-half", name: "R = 0.5", text: "Halved the swarm in a day.", test: (s, d) => s.side === "warden" && !!d && d.R <= 0.5 && d.startAlive >= 6 },
  { id: "endless", name: "Day Eight", text: "Played past the week.", test: (s) => s.day >= 8 }
];
