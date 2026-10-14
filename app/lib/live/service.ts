/* ── app/lib/live/service.ts ─────────────────────────────────────────────────
   The live season's server logic: accept a signed commit, accept a reveal that
   hashes to it, draw the block after the commit window, and publish closed days
   in the exact form the browser replays (app/lib/live/season.ts).
   --------------------------------------------------------------------------- */

import { verifyMessage } from "viem";
import type { Move } from "../../../sim/war";
import type { ChainClient } from "tlock-js";
import { openSealed, revealRound, roundOf } from "./timelock";
import { firstBlockAfter, rpcReader, type BlockReader } from "./chain";
import { clock, commitMessage, commitmentFor, isAddress, normalizeAddress, SEASON_DAYS, validateMove, windowsOf } from "./protocol";
import type { PublishedDay } from "./season";
import { dayOf, load, update, type SeasonLedger } from "./store";

export class LiveError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export async function commit(input: { address: unknown; side: unknown; commitment: unknown; signature: unknown; sealed?: unknown }, now = Date.now()) {
  if (!isAddress(input.address)) throw new LiveError("address must be a 0x wallet address");
  if (input.side !== "red" && input.side !== "blue") throw new LiveError("side must be red or blue");
  if (typeof input.commitment !== "string" || !/^[0-9a-f]{64}$/.test(input.commitment)) throw new LiveError("commitment must be a sha-256 hex digest");
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]{130,}$/.test(input.signature)) throw new LiveError("signature must be hex");
  const c = clock(now);
  if (c.phase !== "commit") throw new LiveError("the commit window is closed until 00:00 UTC", 409);
  let sealed: string | undefined;
  if (input.sealed !== undefined) {
    if (typeof input.sealed !== "string" || input.sealed.length > 6000 || !input.sealed.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new LiveError("sealed must be an age-armoured timelock ciphertext");
    if (roundOf(input.sealed) !== revealRound(c.season, c.day)) throw new LiveError("the timelock must open at today's reveal round");
    sealed = input.sealed;
  }
  const address = normalizeAddress(input.address), side = input.side, commitment = input.commitment;
  const message = commitMessage(c.season, c.day, side, address, commitment);
  const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: input.signature as `0x${string}` }).catch(() => false);
  if (!ok) throw new LiveError("the signature does not match this wallet and message", 401);
  return update(c.season, (l) => {
    const locked = l.sides[address];
    if (locked && locked !== side) throw new LiveError(`this wallet plays ${locked === "red" ? "Worm" : "Warden"} for the whole season`, 409);
    const d = dayOf(l, c.day);
    if (d.commits[address]) throw new LiveError("you have already sealed a move today", 409);
    if (Object.keys(d.commits).length >= 512) throw new LiveError("today is full", 409);
    l.sides[address] = side;
    d.commits[address] = { side, commitment, signature: input.signature as string, at: now, ...(sealed ? { sealed } : {}) };
    return { season: c.season, day: c.day, commitment, revealFrom: c.commitEnd, revealUntil: c.revealEnd };
  });
}

export async function reveal(input: { address: unknown; move: unknown; salt: unknown }, now = Date.now()) {
  if (!isAddress(input.address)) throw new LiveError("address must be a 0x wallet address");
  if (typeof input.salt !== "string" || !/^[0-9a-f]{16,128}$/.test(input.salt)) throw new LiveError("salt must be hex");
  const c = clock(now);
  if (c.phase !== "reveal") throw new LiveError(c.phase === "commit" ? "reveals open at 18:00 UTC, after the draw" : "the reveal window has closed", 409);
  const address = normalizeAddress(input.address);
  return update(c.season, (l) => {
    const d = dayOf(l, c.day);
    const sealed = d.commits[address];
    if (!sealed) throw new LiveError("no sealed move from this wallet today", 404);
    if (d.reveals[address]) throw new LiveError("already revealed", 409);
    const checked = validateMove(input.move, address, sealed.side, c.day);
    if ("error" in checked) throw new LiveError(checked.error);
    if (commitmentFor(checked.move, input.salt as string) !== sealed.commitment) throw new LiveError("this move and salt do not hash to your sealed commitment", 409);
    d.reveals[address] = { move: checked.move, salt: input.salt as string, at: now };
    return { ok: true, day: c.day };
  });
}

/** Open every time-locked move whose round has passed and reveal it — inside the reveal window only,
 *  so a published day never changes after the fact. Anything that fails is left for a manual reveal. */
export async function autoReveal(season: number, now: number, client: ChainClient) {
  const l = load(season);
  for (let day = 1; day <= SEASON_DAYS; day++) {
    const w = windowsOf(season, day), d = l.days[String(day)];
    if (!d || now < w.commitEnd + 4000 || now >= w.revealEnd) continue;
    for (const [address, c] of Object.entries(d.commits)) {
      if (!c.sealed || d.reveals[address]) continue;
      try {
        const { move, salt } = await openSealed(c.sealed, client);
        if (typeof salt !== "string" || !/^[0-9a-f]{16,128}$/.test(salt)) continue;
        const checked = validateMove(move, address, c.side, day);
        if ("error" in checked || commitmentFor(checked.move, salt) !== c.commitment) continue;
        await update(season, (x) => { const dd = dayOf(x, day); dd.reveals[address] ??= { move: checked.move, salt, at: now, auto: true }; });
      } catch { /* the beacon isn't reachable yet, or the ciphertext is bad: the player can still reveal by hand */ }
    }
  }
}

/** Draw every day of the season whose commit window has closed and has no block yet. */
export async function ensureDraws(season: number, now = Date.now(), reader: BlockReader = rpcReader()) {
  const l = load(season);
  for (let day = 1; day <= SEASON_DAYS; day++) {
    const w = windowsOf(season, day);
    if (now < w.commitEnd || l.days[String(day)]?.draw) continue;
    try {
      const block = await firstBlockAfter(reader, w.commitEnd);
      await update(season, (x) => { const d = dayOf(x, day); d.draw ??= block; });
    } catch { /* the chain is unreachable or behind; the next request tries again */ }
  }
}

/** Days whose reveal window has closed and whose block is drawn, in the form the replayer takes. */
export function published(l: SeasonLedger, now = Date.now()): PublishedDay[] {
  const out: PublishedDay[] = [];
  for (let day = 1; day <= SEASON_DAYS; day++) {
    const d = l.days[String(day)], w = windowsOf(l.season, day);
    if (!d?.draw || now < w.revealEnd) break;     // a missing day stops the season: days build on each other
    const commits = Object.entries(d.commits);
    out.push({
      day,
      moves: Object.entries(d.reveals).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, r]) => r.move as Move),
      humanCommitments: commits.map(([, c]) => c.commitment).sort(),
      humans: { red: commits.filter(([, c]) => c.side === "red").length, blue: commits.filter(([, c]) => c.side === "blue").length },
      draw: d.draw
    });
  }
  return out;
}

export function status(season: number, address: string | null, now = Date.now()) {
  const l = load(season), c = clock(now);
  const me = address && isAddress(address) ? normalizeAddress(address) : null;
  const today = l.days[String(c.day)];
  return {
    now, season: c.season, day: c.day, phase: c.phase, commitEnd: c.commitEnd, revealEnd: c.revealEnd, nextDay: c.nextDay,
    players: { red: Object.values(l.sides).filter((s) => s === "red").length, blue: Object.values(l.sides).filter((s) => s === "blue").length },
    today: { commits: Object.keys(today?.commits ?? {}).length, reveals: Object.keys(today?.reveals ?? {}).length, draw: today?.draw ?? null },
    me: me ? { side: l.sides[me] ?? null, committed: Boolean(today?.commits[me]), revealed: Boolean(today?.reveals[me]) } : null,
    published: published(l, now)
  };
}
