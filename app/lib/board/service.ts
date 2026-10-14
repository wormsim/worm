/* The leaderboard's server logic: replay, rank, store, prove. */

import { verifyMessage } from "viem";
import type { RunRecord, Side } from "../../../sim/outbreak";
import { isAddress, normalizeAddress } from "../live/protocol";
import { BOARD_SIZE, boardMessage, boardRoot, cleanName, isDate, judge, proofFor, ranked, utcDate, validName, type Entry } from "./board";
import { loadBoard, loadRun, saveRun, updateBoard } from "./files";

export class BoardError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export async function submitRun(input: { date: unknown; record: unknown; name: unknown; address?: unknown; signature?: unknown }, now = Date.now()) {
  if (!isDate(input.date)) throw new BoardError("date must be YYYY-MM-DD");
  const date = input.date;
  if (date !== utcDate(now) && date !== utcDate(now - 86_400_000)) throw new BoardError("the board takes today's and yesterday's runs only", 409);
  const name = cleanName(input.name);
  if (!validName(name)) throw new BoardError("a name is 2–20 letters, digits, spaces, . _ or -");
  const v = judge(input.record, date);
  if (!v.ok) throw new BoardError(v.error, 422);
  let address: string | null = null;
  if (input.address !== undefined && input.address !== null) {
    if (!isAddress(input.address) || typeof input.signature !== "string") throw new BoardError("an address needs a signature");
    address = normalizeAddress(input.address);
    const ok = await verifyMessage({ address: address as `0x${string}`, message: boardMessage(date, v.side, v.score, v.run, name), signature: input.signature as `0x${string}` }).catch(() => false);
    if (!ok) throw new BoardError("the signature doesn't match this wallet and run", 401);
  }
  const entry: Entry = { date, side: v.side, name, address, score: v.score, days: v.days, over: v.over, maxGen: v.maxGen, run: v.run, head: v.head, at: now };
  const result = await updateBoard(date, (entries) => {
    const same = entries.find((e) => e.run === entry.run);
    if (same) return { entry: same, fresh: false };
    const side = ranked(entries.filter((e) => e.side === entry.side));
    if (side.length >= BOARD_SIZE && side[side.length - 1].score >= entry.score) return { entry: null, fresh: false };
    entries.push(entry);
    if (side.length + 1 > BOARD_SIZE) { const drop = ranked(entries.filter((e) => e.side === entry.side)).pop()!; entries.splice(entries.indexOf(drop), 1); }
    return { entry, fresh: true };
  });
  if (result.entry && result.fresh) saveRun(entry.run, input.record as RunRecord);
  const entries = loadBoard(date);
  const rank = result.entry ? ranked(entries.filter((e) => e.side === v.side)).findIndex((e) => e.run === v.run) + 1 : null;
  return { replayed: { score: v.score, head: v.head, days: v.days }, entry: result.entry, rank, ...(result.entry ? { proof: proofFor(entries, v.run) } : {}) };
}

export function board(date: string, side: Side, limit = 50) {
  const entries = loadBoard(date);
  return { date, side, count: entries.filter((e) => e.side === side).length, root: boardRoot(entries), entries: ranked(entries.filter((e) => e.side === side)).slice(0, limit) };
}

export function runWithProof(date: string, id: string) {
  const record = loadRun(id), entries = loadBoard(date), entry = entries.find((e) => e.run === id) ?? null;
  if (!record || !entry) return null;
  return { record, entry, proof: proofFor(entries, id) };
}
