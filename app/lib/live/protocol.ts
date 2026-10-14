/* ── app/lib/live/protocol.ts ────────────────────────────────────────────────
   The live season's rules of engagement, shared by the browser and the server.
   Pure: no network, no clock of its own (callers pass `now`).

   One live day, in UTC:
     00:00 – 18:00  COMMIT  sign and send only the hash of your move
     18:00          DRAW    the seed's randomness is the first Robinhood Chain
                            block mined after 18:00 — unknowable while commits are open
     18:00 – 22:00  REVEAL  send the move and its salt; the server re-hashes it
     22:00          RESOLVE the day is played: revealed moves + bots, one seed
   A season is seven days. A wallet picks a side on its first commit and keeps it.
   --------------------------------------------------------------------------- */

import { sha256Hex, stableStringify } from "../../../sim/hash";
import { WAR, WAR_VERSION, type Move, type Note, type Tool } from "../../../sim/war";

export const LIVE_VERSION = "live/1";
export const EPOCH_MS = Date.parse("2026-10-13T00:00:00Z");
const DAY_MS = 86_400_000, HOUR = 3_600_000;
export const COMMIT_END_H = 18, REVEAL_END_H = 22;
export const SEASON_DAYS = WAR.days;

export const CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com"
} as const;

export type Phase = "commit" | "reveal" | "resolve";

export function clock(now: number) {
  const dayIndex = Math.floor((now - EPOCH_MS) / DAY_MS);
  const season = Math.floor(dayIndex / SEASON_DAYS);
  const day = (dayIndex % SEASON_DAYS) + 1;
  const start = EPOCH_MS + dayIndex * DAY_MS;
  const commitEnd = start + COMMIT_END_H * HOUR, revealEnd = start + REVEAL_END_H * HOUR;
  const phase: Phase = now < commitEnd ? "commit" : now < revealEnd ? "reveal" : "resolve";
  return { dayIndex, season, day, start, commitEnd, revealEnd, nextDay: start + DAY_MS, phase };
}
/** Absolute times for a given season and day. */
export function windowsOf(season: number, day: number) {
  const start = EPOCH_MS + (season * SEASON_DAYS + day - 1) * DAY_MS;
  return { start, commitEnd: start + COMMIT_END_H * HOUR, revealEnd: start + REVEAL_END_H * HOUR };
}

/** The ground of a live season is drawn from its number, so every season looks different. */
export const seasonSeed = (season: number) => parseInt(sha256Hex(`${LIVE_VERSION}|season|${season}`).slice(0, 8), 16) >>> 1;

export const normalizeAddress = (a: string) => a.trim().toLowerCase();
export const isAddress = (a: unknown): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());

/** The exact text a wallet signs to commit. Human-readable on purpose: you can see what you are signing. */
export function commitMessage(season: number, day: number, side: "red" | "blue", address: string, commitment: string): string {
  return [
    "WORM · Red vs Blue",
    `I seal my move for season ${season}, day ${day}.`,
    `Side: ${side === "red" ? "Worm" : "Warden"}`,
    `Wallet: ${normalizeAddress(address)}`,
    `Commitment: ${commitment}`,
    `Rules: ${WAR_VERSION} · ${LIVE_VERSION}`,
    "This signature moves no funds and approves nothing."
  ].join("\n");
}

/** The seed: the block nobody could know at commit time, plus every sealed move. */
export function seedFromBlock(season: number, day: number, blockHash: string, commitments: string[]): number {
  return parseInt(sha256Hex(`${WAR_VERSION}|${LIVE_VERSION}|${season}|${day}|${blockHash.toLowerCase()}|${[...commitments].sort().join(",")}`).slice(0, 8), 16) >>> 1;
}

/** A sealed move, the same function the practice mode uses. */
export const commitmentFor = (move: Move, salt: string) => sha256Hex(stableStringify({ move, salt }));

const GROUNDS = ["any", "soft", "hard"], SPLITS = ["early", "normal", "late"], FOODS = ["greedy", "careful"], ZONES = ["none", "north", "south", "east", "west", "center"];
const TOOLS = ["honeypot", "quarantine", "alert", "harden"];
const cellOk = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < WAR.size;

/** Check a revealed move is well-formed and belongs to `address` on `side`. Returns the canonical move or an error. */
export function validateMove(raw: unknown, address: string, side: "red" | "blue", day: number): { move: Move } | { error: string } {
  const m = raw as Record<string, unknown>;
  if (!m || typeof m !== "object") return { error: "move must be an object" };
  if (m.player !== normalizeAddress(address)) return { error: "move.player must be your wallet address" };
  if (m.side !== side) return { error: `you play ${side} this season` };
  if (side === "red") {
    const n = m.note as Record<string, unknown>;
    if (!n || !GROUNDS.includes(n.ground as string) || !SPLITS.includes(n.split as string) || !FOODS.includes(n.food as string) || !ZONES.includes(n.avoid as string)) return { error: "note has an unknown value" };
    const note = { ground: n.ground, split: n.split, food: n.food, avoid: n.avoid } as Note;
    if (m.spawn !== undefined) {
      // Founders are only used the first time a family plays; later spawns are ignored by the engine.
      void day;
      if (!Array.isArray(m.spawn) || m.spawn.length > WAR.founders || !m.spawn.every((p) => Array.isArray(p) && p.length === 2 && cellOk(p[0]) && cellOk(p[1]))) return { error: "spawn must be up to two [x, y] cells" };
      return { move: { side: "red", player: m.player, note, spawn: (m.spawn as number[][]).map(([x, y]) => [x, y] as [number, number]) } };
    }
    return { move: { side: "red", player: m.player, note } };
  }
  if (!Array.isArray(m.tools) || m.tools.length > WAR.toolsPerWarden + 1) return { error: "tools must be a list of up to three" };
  const tools: Tool[] = [];
  for (const t of m.tools as Record<string, unknown>[]) {
    if (!t || !TOOLS.includes(t.kind as string) || !cellOk(t.x) || !cellOk(t.y)) return { error: "a tool has an unknown kind or cell" };
    tools.push({ kind: t.kind as Tool["kind"], x: t.x as number, y: t.y as number });
  }
  if (tools.filter((t) => t.kind === "honeypot").length > 1) return { error: "one honeypot per day" };
  return { move: { side: "blue", player: m.player as string, tools } };
}

/** How many bots fill each side, so a dish is lively even with few players. */
export function botCounts(humanRed: number, humanBlue: number) {
  return { red: Math.max(0, 24 - humanRed), blue: Math.max(0, 17 - humanBlue) };
}
