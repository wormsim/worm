/* The daily anchors, checked without a network: the memo format, the daily seed,
   the manifest against the code, and the exact transaction the writer would sign. */

import test from "node:test";
import assert from "node:assert/strict";
import { parseTransaction, recoverTransactionAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ANCHORS, checkManifest, memoFor, parseMemo, recomputeDay, type Anchor } from "../app/lib/anchors";
import { dateOf, dayOf, seedFor } from "../app/lib/daily";
import { memoFromInput, memoRequest, robinhood } from "../scripts/evm-memo";

test("days and dates convert both ways, from day 0", () => {
  assert.equal(dateOf(0), "2026-10-13");
  assert.equal(dayOf("2026-10-13"), 0);
  assert.equal(dayOf("2026-11-01"), 19);
  assert.equal(dateOf(dayOf("2027-02-28")), "2027-02-28");
  assert.throws(() => dayOf("2026-10-12"));
});

test("each day has its own seed, and the same day always has the same one", () => {
  const seeds = Array.from({ length: 60 }, (_, d) => seedFor(d));
  assert.equal(new Set(seeds).size, 60);
  assert.deepEqual(seeds, Array.from({ length: 60 }, (_, d) => seedFor(d)));
  for (const s of seeds) assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 31);
});

test("a memo parses back into the fields that made it", () => {
  const head = recomputeDay(0);
  const memo = memoFor(0, head.seed, head.ticks, head.chainHash);
  assert.deepEqual(parseMemo(memo), { version: 1, day: 0, date: "2026-10-13", seed: head.seed, ticks: head.ticks, chainHash: head.chainHash });
  assert.equal(parseMemo("ffw:1|0|2026-10-10|28799|55bdf958"), null, "another project's memo is not ours");
});

test("the manifest agrees with the code, and a tampered entry is caught", () => {
  for (const c of checkManifest()) assert.ok(c.ok, `day ${c.day}: ${c.problem}`);
  const head = recomputeDay(1);
  const forged: Anchor = { day: 1, date: head.date, seed: head.seed, ticks: head.ticks, chainHash: "f".repeat(64), worldVersion: head.worldVersion, tx: "x", chain: "robinhood", anchoredAt: "" };
  const [check] = checkManifest([forged]);
  assert.equal(check.ok, false);
  assert.match(check.problem ?? "", /hash differs/);
  assert.ok(Array.isArray(ANCHORS));
});

test("the transaction the writer would send carries exactly the memo, on Robinhood Chain, signed by the anchor wallet", async () => {
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const head = recomputeDay(0);
  const memo = memoFor(0, head.seed, head.ticks, head.chainHash);
  const req = memoRequest(account.address, memo);
  const signed = await account.signTransaction({ ...req, chainId: robinhood.id, nonce: 0, gas: 60_000n, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000n, type: "eip1559" });
  const tx = parseTransaction(signed);
  assert.equal(tx.chainId, 4663);
  assert.equal(tx.value ?? 0n, 0n, "an anchor sends nothing");
  assert.equal(tx.to?.toLowerCase(), account.address.toLowerCase(), "to the wallet itself");
  assert.equal(memoFromInput(tx.data), memo);
  assert.equal((await recoverTransactionAddress({ serializedTransaction: signed as `0x02${string}` })).toLowerCase(), account.address.toLowerCase());
});
