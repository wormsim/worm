/* ── sim/warbots.ts ──────────────────────────────────────────────────────────
   The other forty players in the prototype. They are plain rules, not models,
   and they learn the only way a family can: by rewriting the note its children
   inherit after something goes wrong. A caught family turns careful; a family
   cleaned up in one region learns to avoid it; a starving family splits later.

   Deterministic from (season, day, bot name, yesterday's result), so a recorded
   season replays exactly.
   --------------------------------------------------------------------------- */

import { mulberry32 } from "./engine";
import { sha256Hex } from "./hash";
import { covers, insideCell, idx, inZone, WAR, type BlueMove, type DayResult, type Ground, type Note, type RedMove, type SplitWhen, type Tool, type WarState, type Zone } from "./war";

const seedOf = (...parts: (string | number)[]) => parseInt(sha256Hex(parts.join("|")).slice(0, 8), 16) >>> 0;
const pick = <T,>(rnd: () => number, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
const ZONES: Zone[] = ["north", "south", "east", "west", "center"];

/** Neutral English handles for the bots. */
const RED_NAMES = ["ash", "birch", "cedar", "dune", "ember", "fern", "grove", "heath", "iris", "juniper", "kelp", "larch", "moss", "nettle", "oak", "pine", "quill", "reed", "sage", "thorn", "umber", "vale", "willow", "yarrow"];
const BLUE_NAMES = ["anchor", "beacon", "citadel", "dyke", "embank", "fort", "garrison", "harbor", "keep", "lantern", "moat", "outpost", "palisade", "rampart", "sentry", "tower", "warden"];

export function botRoster(playerSide: "red" | "blue") {
  const red = RED_NAMES.slice(0, playerSide === "red" ? 23 : 24).map((n) => `bot-${n}`);
  const blue = BLUE_NAMES.slice(0, playerSide === "blue" ? 16 : 17).map((n) => `bot-${n}`);
  return { red, blue };
}

export function botRedMove(state: WarState, name: string, last: DayResult | null): RedMove {
  const rnd = mulberry32(seedOf("red", state.season, state.day, name));
  const fam = state.families.find((f) => f.player === name);
  if (!fam) {
    // Day 1: a first guess at a note, and two founders somewhere inside the dish.
    const note: Note = { ground: pick<Ground>(rnd, ["any", "soft", "hard"]), split: pick<SplitWhen>(rnd, ["early", "normal", "normal", "late"]), food: rnd() < 0.25 ? "careful" : "greedy", avoid: "none" };
    const spawn: [number, number][] = [];
    while (spawn.length < WAR.founders) {
      const x = Math.floor(rnd() * WAR.size), y = Math.floor(rnd() * WAR.size);
      if (insideCell(x, y)) spawn.push([x, y]);
    }
    return { side: "red", player: name, note, spawn };
  }
  const note: Note = { ...fam.note };
  if (last) {
    const mine = last.events.filter((e) => "fam" in e && e.fam === fam.id);
    if (mine.some((e) => e.kind === "caught")) note.food = "careful";
    const cleaned = mine.filter((e) => e.kind === "cleaned") as { x: number; y: number }[];
    if (cleaned.length) {
      const worst = ZONES.map((z) => ({ z, n: cleaned.filter((c) => inZone(z, c.x, c.y)).length })).sort((a, b) => b.n - a.n)[0];
      if (worst.n > 0) note.avoid = worst.z;
    }
    const starved = mine.filter((e) => e.kind === "starve").length;
    if (starved >= 2) note.split = note.split === "early" ? "normal" : "late";
    const settledHard = mine.filter((e) => e.kind === "settle" && e.hard).length, settledSoft = mine.filter((e) => e.kind === "settle" && !e.hard).length;
    if (settledHard + settledSoft >= 3 && rnd() < 0.5) note.ground = settledHard > settledSoft ? "hard" : "soft";
    if (rnd() < 0.08) note.avoid = "none";        // memories fade
  }
  return { side: "red", player: name, note };
}

/** Where the crawling worms are thickest, by 3×3 block. */
function densest(state: WarState, unsettledOnly: boolean, rnd: () => number): [number, number] {
  let best: [number, number] = [6, 6], bestN = -1;
  for (let y = 1; y < WAR.size - 1; y++) for (let x = 1; x < WAR.size - 1; x++) {
    if (!insideCell(x, y)) continue;
    const n = state.worms.filter((w) => (!unsettledOnly || !w.settled) && covers({ kind: "alert", x, y }, w.x, w.y)).length + rnd() * 0.5;
    if (n > bestN) { bestN = n; best = [x, y]; }
  }
  return best;
}

export function botBlueMove(state: WarState, name: string, k: number): BlueMove {
  const rnd = mulberry32(seedOf("blue", state.season, state.day, name));
  const tools: Tool[] = [];
  const occupied = new Set(state.worms.map((w) => idx(w.x, w.y)));
  // A honeypot on an empty cell next to the crawling crowd.
  const [hx, hy] = densest(state, true, rnd);
  const ring: [number, number][] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (insideCell(hx + dx, hy + dy) && !occupied.has(idx(hx + dx, hy + dy))) ring.push([hx + dx, hy + dy]);
  if (ring.length) { const [x, y] = pick(rnd, ring); tools.push({ kind: "honeypot", x, y }); }
  const [qx, qy] = densest(state, false, rnd);
  const style = k % 4;
  if (style === 0 || style === 1) tools.push({ kind: "quarantine", x: qx, y: qy });
  else if (style === 2) tools.push({ kind: "alert", x: qx, y: qy });
  else {
    const soft: [number, number][] = [];
    for (let y = 0; y < WAR.size; y++) for (let x = 0; x < WAR.size; x++) if (insideCell(x, y) && !state.cells[idx(x, y)].hard && Math.abs(x - qx) <= 2 && Math.abs(y - qy) <= 2) soft.push([x, y]);
    if (soft.length) { const [x, y] = pick(rnd, soft); tools.push({ kind: "harden", x, y }); }
  }
  return { side: "blue", player: name, tools: tools.slice(0, WAR.toolsPerWarden) };
}
