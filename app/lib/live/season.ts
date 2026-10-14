/* ── app/lib/live/season.ts ──────────────────────────────────────────────────
   Rebuild a live season from what was published: for every day, the revealed
   moves, every commitment and the drawn block. Pure — the server runs it to
   resolve a day, and the browser runs the very same function to check the
   server. If the two disagree, that is a bug report.
   --------------------------------------------------------------------------- */

import { newSeason, playDay, type DayResult, type Move, type WarState } from "../../../sim/war";
import { botBlueMove, botRedMove } from "../../../sim/warbots";
import { botCounts, commitmentFor, seasonSeed, seedFromBlock } from "./protocol";

export interface PublishedDay {
  day: number;
  /** Revealed human moves, canonical. */
  moves: Move[];
  /** Commitments of every human who committed (revealed or not). */
  humanCommitments: string[];
  /** Human players per side who committed this day (decides how many bots fill). */
  humans: { red: number; blue: number };
  draw: { number: number; hash: string; timestamp: number };
}

const RED_BOTS = ["ash", "birch", "cedar", "dune", "ember", "fern", "grove", "heath", "iris", "juniper", "kelp", "larch", "moss", "nettle", "oak", "pine", "quill", "reed", "sage", "thorn", "umber", "vale", "willow", "yarrow"].map((n) => `bot-${n}`);
const BLUE_BOTS = ["anchor", "beacon", "citadel", "dyke", "embank", "fort", "garrison", "harbor", "keep", "lantern", "moat", "outpost", "palisade", "rampart", "sentry", "tower", "warden"].map((n) => `bot-${n}`);

export interface ResolvedDay { day: number; seed: number; commitments: string[]; moves: Move[]; result: DayResult }

/** Play days 1..n of a season from published data. */
export function replaySeason(season: number, days: PublishedDay[]): { state: WarState; resolved: ResolvedDay[] } {
  let state = newSeason(seasonSeed(season));
  let last: DayResult | null = null;
  const resolved: ResolvedDay[] = [];
  for (const d of [...days].sort((a, b) => a.day - b.day)) {
    const bots = botCounts(d.humans.red, d.humans.blue);
    // Bots join on day 1 with the season's counts; later days keep the same bots so families persist.
    const firstDay = days.find((x) => x.day === 1) ?? d;
    const firstBots = botCounts(firstDay.humans.red, firstDay.humans.blue);
    const reds = RED_BOTS.slice(0, d.day === 1 ? bots.red : firstBots.red);
    const blues = BLUE_BOTS.slice(0, bots.blue);
    const botMoves: Move[] = [...reds.map((n) => botRedMove(state, n, last)), ...blues.map((n, k) => botBlueMove(state, n, k))];
    const botCommitments = botMoves.map((m) => commitmentFor(m, `${m.player}|${season}|${d.day}`));
    const commitments = [...d.humanCommitments, ...botCommitments];
    const seed = seedFromBlock(season, d.day, d.draw.hash, commitments);
    const moves = [...d.moves, ...botMoves];
    const out = playDay(state, moves, seed, commitments);
    state = out.state; last = out.result;
    resolved.push({ day: d.day, seed, commitments: out.result.commitments, moves, result: out.result });
  }
  return { state, resolved };
}
