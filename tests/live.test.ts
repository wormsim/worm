/* The live season, end to end without a network: real wallet signatures, the
   commit/reveal checks, a block drawn from a fake chain by binary search, and the
   browser's replayer agreeing with what the server publishes. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { firstBlockAfter, type BlockReader } from "../app/lib/live/chain";
import { clock, commitMessage, commitmentFor, EPOCH_MS, seedFromBlock, validateMove, windowsOf } from "../app/lib/live/protocol";
import { replaySeason } from "../app/lib/live/season";
import { commit, ensureDraws, published, reveal } from "../app/lib/live/service";
import { load, setDataDir } from "../app/lib/live/store";
import { NOTE_DEFAULT, type Move } from "../sim/war";

const H = 3_600_000;

test("the day clock: commit until 18:00 UTC, reveal until 22:00, then resolve", () => {
  assert.equal(clock(EPOCH_MS + 1 * H).phase, "commit");
  assert.equal(clock(EPOCH_MS + 19 * H).phase, "reveal");
  assert.equal(clock(EPOCH_MS + 23 * H).phase, "resolve");
  const c = clock(EPOCH_MS + 8 * 24 * H + H);
  assert.deepEqual([c.season, c.day], [1, 2]);
});

test("the signed message is readable and says it moves no funds", () => {
  const m = commitMessage(0, 1, "red", "0xABC0000000000000000000000000000000000001", "ab".repeat(32));
  assert.match(m, /Commitment: abab/);
  assert.match(m, /moves no funds/);
  assert.match(m, /0xabc0/);
});

test("a revealed move must be well-formed and belong to the wallet", () => {
  const a = "0x1111111111111111111111111111111111111111";
  assert.ok("move" in validateMove({ side: "red", player: a, note: NOTE_DEFAULT }, a, "red", 2));
  assert.ok("error" in validateMove({ side: "red", player: "0x2222222222222222222222222222222222222222", note: NOTE_DEFAULT }, a, "red", 2));
  assert.ok("error" in validateMove({ side: "blue", player: a, tools: [] }, a, "red", 2));
  assert.ok("error" in validateMove({ side: "red", player: a, note: { ...NOTE_DEFAULT, split: "never" } }, a, "red", 2));
  assert.ok("error" in validateMove({ side: "blue", player: a, tools: [{ kind: "honeypot", x: 1, y: 1 }, { kind: "honeypot", x: 2, y: 2 }] }, a, "blue", 2));
});

function fakeChain(startMs: number, blocks: number, spacingMs = 100) {
  let calls = 0;
  const reader: BlockReader = {
    tip: async () => { calls++; return blocks - 1; },
    block: async (n) => { calls++; return { number: n, hash: "0x" + n.toString(16).padStart(64, "0"), timestamp: startMs + n * spacingMs }; }
  };
  return { reader, calls: () => calls };
}

test("the draw is the first block strictly after the cutoff, found in a few dozen reads", async () => {
  const start = EPOCH_MS, chain = fakeChain(start, 2_000_000);
  const cutoff = start + 123_456_789 / 1000 * 1000 + 50;   // between two blocks
  const b = await firstBlockAfter(chain.reader, cutoff);
  assert.ok(b.timestamp > cutoff);
  assert.ok(b.timestamp - 100 <= cutoff, "the block before it is at or before the cutoff");
  assert.ok(chain.calls() < 80, `${chain.calls()} reads`);
  await assert.rejects(firstBlockAfter(fakeChain(start, 10).reader, start + 10_000), /no block after/);
});

test("commit with a real signature, reveal, draw, publish, and the browser replays the same day", async () => {
  setDataDir(mkdtempSync(path.join(tmpdir(), "worm-live-")));
  const season = 3, day = 1, w = windowsOf(season, day);
  const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const bob = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const a = alice.address.toLowerCase(), b = bob.address.toLowerCase();
  const aMove: Move = { side: "red", player: a, note: { ...NOTE_DEFAULT, ground: "hard" }, spawn: [[4, 4], [8, 8]] };
  const bMove: Move = { side: "blue", player: b, tools: [{ kind: "quarantine", x: 6, y: 6 }] };
  const aSalt = "aa".repeat(16), bSalt = "bb".repeat(16);
  const aC = commitmentFor(aMove, aSalt), bC = commitmentFor(bMove, bSalt);
  const during = w.start + 2 * H;

  const aSig = await alice.signMessage({ message: commitMessage(season, day, "red", a, aC) });
  await commit({ address: a, side: "red", commitment: aC, signature: aSig }, during);
  // a signature over somebody else's commitment is refused
  const forged = await alice.signMessage({ message: commitMessage(season, day, "blue", b, bC) });
  await assert.rejects(commit({ address: b, side: "blue", commitment: bC, signature: forged }, during), /signature/);
  const bSig = await bob.signMessage({ message: commitMessage(season, day, "blue", b, bC) });
  await commit({ address: b, side: "blue", commitment: bC, signature: bSig }, during);
  await assert.rejects(commit({ address: a, side: "red", commitment: aC, signature: aSig }, during), /already sealed/);

  // reveals open only after the commit window, and must hash to the seal
  await assert.rejects(reveal({ address: a, move: aMove, salt: aSalt }, during), /open at 18:00/);
  const after = w.commitEnd + H;
  await assert.rejects(reveal({ address: a, move: { ...aMove, note: NOTE_DEFAULT }, salt: aSalt }, after), /do not hash/);
  await reveal({ address: a, move: aMove, salt: aSalt }, after);
  // bob never reveals: his commitment still counts in the seed, his move does not play

  const chain = fakeChain(w.start, 864_000);
  await ensureDraws(season, w.revealEnd + H, chain.reader);
  const ledger = load(season);
  const draw = ledger.days["1"].draw!;
  assert.ok(draw.timestamp > w.commitEnd && draw.timestamp - 100 <= w.commitEnd);

  const days = published(ledger, w.revealEnd + H);
  assert.equal(days.length, 1);
  assert.equal(days[0].moves.length, 1, "only revealed moves play");
  assert.deepEqual(days[0].humanCommitments, [aC, bC].sort());
  const server = replaySeason(season, days), browser = replaySeason(season, JSON.parse(JSON.stringify(days)));
  assert.equal(server.resolved[0].result.head, browser.resolved[0].result.head);
  assert.ok(server.state.families.some((f) => f.player === a), "the human family was founded");

  // a different block gives a different day
  const other = seedFromBlock(season, 1, "0x" + "1".repeat(64), server.resolved[0].commitments);
  assert.notEqual(other, server.resolved[0].seed);
  setDataDir(null);
});
