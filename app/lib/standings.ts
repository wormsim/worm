/* ── app/lib/standings.ts ────────────────────────────────────────────────────
   Who is ahead, computed from the season itself — never stored, never trusted.
   Pure. The live tab and /player pages run it on a season the browser rebuilt
   from published data; the practice tab runs it on its own season.

   Worm families rank by worms alive now, then deepest generation, then births.
   Wardens rank by worms stopped (caught in a honeypot + cleaned), then catches.
   --------------------------------------------------------------------------- */

import type { DayResult, Move, WarState } from "../../sim/war";

export interface FamilyRow { player: string; fam: number; alive: number; gens: number; born: number; settled: number; deadOn: number | null }
export interface WardenRow { player: string; stopped: number; caught: number; cleaned: number; notesRead: number }
export interface Standings { families: FamilyRow[]; wardens: WardenRow[]; days: { red: number; blue: number } }

export const isHuman = (player: string) => /^0x[0-9a-f]{40}$/i.test(player) || player === "you";

export function standings(state: WarState, results: DayResult[]): Standings {
  const alive = new Map<number, number>();
  for (const w of state.worms) alive.set(w.fam, (alive.get(w.fam) ?? 0) + 1);
  const families: FamilyRow[] = state.families.filter((f) => f.founded).map((f) => {
    const mine = Object.values(state.ledger).filter((l) => l.fam === f.id);
    let deadOn: number | null = null;
    if (!alive.get(f.id)) {
      for (const r of results) { const last = r.frames[r.frames.length - 1] ?? []; if (deadOn === null && !last.some((fw) => fw[1] === f.id)) deadOn = r.day; }
    }
    return { player: f.player, fam: f.id, alive: alive.get(f.id) ?? 0, gens: Math.max(0, ...mine.map((l) => l.gen)), born: mine.length, settled: mine.filter((l) => l.settled).length, deadOn };
  }).sort((a, b) => b.alive - a.alive || b.gens - a.gens || b.born - a.born || a.fam - b.fam);

  const by = new Map<string, WardenRow>(state.wardens.map((p) => [p, { player: p, stopped: 0, caught: 0, cleaned: 0, notesRead: 0 }]));
  for (const r of results) for (const e of r.events) {
    if (e.kind !== "caught" && e.kind !== "cleaned") continue;
    const row = by.get(e.by) ?? { player: e.by, stopped: 0, caught: 0, cleaned: 0, notesRead: 0 };
    if (e.kind === "caught") { row.caught++; row.notesRead++; } else row.cleaned++;
    row.stopped++; by.set(e.by, row);
  }
  const wardens = [...by.values()].sort((a, b) => b.stopped - a.stopped || b.caught - a.caught || a.player.localeCompare(b.player));
  return { families, wardens, days: { red: results.filter((r) => r.winner === "red").length, blue: results.filter((r) => r.winner === "blue").length } };
}

export interface PlayerDay { day: number; side: "red" | "blue" | null; move: Move | null; score: number; R: number; winner: "red" | "blue"; births: number; deaths: number; stopped: number }

/** One player's season, day by day. `side` is null on days they did not reveal. */
export function playerDays(player: string, state: WarState, days: { day: number; moves: Move[]; result: DayResult }[]): PlayerDay[] {
  const fam = state.families.find((f) => f.player === player)?.id ?? null;
  return days.map(({ day, moves, result }) => {
    const move = moves.find((m) => m.player === player) ?? null;
    const ev = result.events;
    return {
      day, side: move?.side ?? null, move, score: result.score[player] ?? 0, R: result.R, winner: result.winner,
      births: fam === null ? 0 : ev.filter((e) => e.kind === "birth" && e.fam === fam).length,
      deaths: fam === null ? 0 : ev.filter((e) => (e.kind === "starve" || e.kind === "caught" || e.kind === "cleaned") && e.fam === fam).length,
      stopped: ev.filter((e) => (e.kind === "caught" || e.kind === "cleaned") && e.by === player).length
    };
  });
}

export const rankOf = (s: Standings, player: string) => {
  const f = s.families.findIndex((r) => r.player === player); if (f >= 0) return { side: "red" as const, rank: f + 1, of: s.families.length };
  const w = s.wardens.findIndex((r) => r.player === player); if (w >= 0) return { side: "blue" as const, rank: w + 1, of: s.wardens.length };
  return null;
};
