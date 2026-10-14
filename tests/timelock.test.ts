/* One-step moves: a move time-locked to the reveal round opens only with that
   round's beacon, and the server reveals it for the player. Tested offline with
   a beacon network of our own (a BLS key we hold), the same scheme as drand quicknet. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { bls12_381 } from "@noble/curves/bls12-381";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainInfo } from "tlock-js";
import { commitMessage, commitmentFor, EPOCH_MS, seasonSeed } from "../app/lib/live/protocol";
import { autoReveal, commit } from "../app/lib/live/service";
import { load, setDataDir } from "../app/lib/live/store";
import { offlineClient, openSealed, QUICKNET, revealRound, roundOf, sealForReveal } from "../app/lib/live/timelock";
import { NOTE_DEFAULT, type Move } from "../sim/war";

const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
const sk = BigInt("0x" + "1f".repeat(31));
const pk = Buffer.from(bls12_381.G2.ProjectivePoint.BASE.multiply(sk).toRawBytes(true)).toString("hex");
// Our own network: same scheme as quicknet, our key, and a genesis long enough ago that every round we use has passed.
const INFO: ChainInfo = { ...QUICKNET, public_key: pk, genesis_time: QUICKNET.genesis_time - 400 * 86400, hash: "ab".repeat(32) };
const roundMsg = (r: number) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(r)); return createHash("sha256").update(b).digest(); };
const beacon = async (r: number) => {
  const point = bls12_381.G1.hashToCurve(roundMsg(r), { DST }).multiply(sk) as unknown as { toRawBytes(compressed: boolean): Uint8Array };
  const sig = Buffer.from(point.toRawBytes(true)).toString("hex");
  return { round: r, randomness: createHash("sha256").update(Buffer.from(sig, "hex")).digest("hex"), signature: sig };
};
const encryptTo = offlineClient(INFO);
const opener = offlineClient(INFO, beacon);

const a = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const move: Move = { side: "red", player: a, note: { ...NOTE_DEFAULT, ground: "hard" } };
const salt = "c0ffee".repeat(6);

test("a time-locked move opens with its round's beacon, and not with another", async () => {
  const ct = await sealForReveal({ move, salt }, 1000, encryptTo);
  assert.match(ct, /^-----BEGIN AGE ENCRYPTED FILE-----/);
  assert.equal(roundOf(ct), 1000);
  assert.deepEqual(await openSealed(ct, opener), { move, salt });
  const wrong = offlineClient(INFO, async () => beacon(999));
  await assert.rejects(openSealed(ct, wrong));
});

test("today's reveal round is the first drand round after 18:00 UTC", () => {
  const r = revealRound(0, 1);
  const t = (QUICKNET.genesis_time + (r - 1) * QUICKNET.period) * 1000;
  const cutoff = EPOCH_MS + 18 * 3_600_000;
  assert.ok(t > cutoff && t <= cutoff + 3000 * 2, `round ${r} at ${new Date(t).toISOString()}`);
});

test("the server reveals a sealed move by itself after the round, and only a true one", async () => {
  setDataDir(mkdtempSync(path.join(tmpdir(), "worm-tl-")));
  const season = 0, day = 1, during = EPOCH_MS + 2 * 3_600_000;
  const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  assert.equal(alice.address.toLowerCase(), a);
  const c = commitmentFor(move, salt);
  const sig = await alice.signMessage({ message: commitMessage(season, day, "red", a, c) });
  // A ciphertext for the wrong round is refused at commit time.
  await assert.rejects(commit({ address: a, side: "red", commitment: c, signature: sig, sealed: await sealForReveal({ move, salt }, 5, encryptTo) }, during), /reveal round/);
  await commit({ address: a, side: "red", commitment: c, signature: sig, sealed: await sealForReveal({ move, salt }, revealRound(season, day), encryptTo) }, during);
  // Before 18:00 nothing happens; after, the move is revealed and marked as automatic.
  await autoReveal(season, during, opener);
  assert.equal(load(season).days["1"].reveals[a], undefined);
  await autoReveal(season, EPOCH_MS + 18 * 3_600_000 + 10_000, opener);
  const r = load(season).days["1"].reveals[a];
  assert.ok(r?.auto);
  assert.deepEqual(r.move, move);
  void seasonSeed;
  setDataDir(null);
});
