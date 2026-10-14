/* The daily board: scores come from the server's replay, entries are committed to
   by a Merkle root, and every entry can prove it's under that root. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { dailySeed, type RunRecord } from "../sim/outbreak";
import { boardMessage, judge, runId } from "../app/lib/board/board";
import { EMPTY_ROOT, leafHash, merkleProof, merkleRoot, verifyProof } from "../app/lib/board/merkle";
import { board, runWithProof, submitRun } from "../app/lib/board/service";
import { setDataDir } from "../app/lib/live/store";
import { playRun } from "./helpers/outbreak-bot";

const DATE = "2026-10-14", NOW = Date.parse(`${DATE}T12:00:00Z`);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

test("every leaf of every tree size proves against the root, and nothing else does", () => {
  assert.equal(merkleRoot([]), EMPTY_ROOT);
  for (let n = 1; n <= 11; n++) {
    const leaves = Array.from({ length: n }, (_, i) => leafHash({ i }));
    const root = merkleRoot(leaves);
    for (let i = 0; i < n; i++) {
      const p = merkleProof(leaves, i);
      assert.ok(verifyProof(leaves[i], p, root), `n=${n} i=${i}`);
      assert.ok(p.length <= Math.ceil(Math.log2(n)) || n === 1);
      assert.ok(!verifyProof(leafHash({ i: i + 100 }), p, root));
    }
  }
});

test("the judge replays the run: the score is the replay's, a forged run is refused", () => {
  const { s, rec } = playRun(dailySeed(DATE), "worm");
  const v = judge(clone(rec), DATE);
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.score, s.score); assert.equal(v.head, s.head); assert.equal(v.run, runId(rec)); }
  assert.match((judge(clone(rec), "2026-10-15") as { error: string }).error, /daily dish/);
  const unfinished = playRun(dailySeed(DATE), "worm", 2).rec;
  assert.equal(judge(unfinished, DATE).ok, false);
  const forged: RunRecord = clone(rec);
  const row = forged.days[0].inputs.find((r) => r[1] >= 0)!; row[1] = (row[1] + 400) % 1024;
  const f = judge(forged, DATE);
  assert.ok(!f.ok || f.score !== s.score || f.head !== s.head, "a changed input is a different game");
});

test("submitting: the server ranks by its own replay, proves the entry, and binds a signed wallet", async () => {
  setDataDir(mkdtempSync(path.join(tmpdir(), "worm-board-")));
  const a = playRun(dailySeed(DATE), "worm"), b = playRun(dailySeed(DATE), "warden");
  const r1 = await submitRun({ date: DATE, record: clone(a.rec), name: "Moss" }, NOW);
  assert.equal(r1.rank, 1);
  assert.equal(r1.entry!.score, a.s.score);
  assert.ok(r1.proof && verifyProof(r1.proof.leaf, r1.proof.proof, r1.proof.root));
  // Same run again: nothing new.
  const again = await submitRun({ date: DATE, record: clone(a.rec), name: "Moss" }, NOW);
  assert.equal(again.entry!.at, r1.entry!.at);
  // A wallet signs to put its address on a run.
  const acct = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
  const v = judge(clone(b.rec), DATE); assert.ok(v.ok);
  const msg = boardMessage(DATE, "warden", v.ok ? v.score : 0, runId(b.rec), "Fern");
  await assert.rejects(submitRun({ date: DATE, record: clone(b.rec), name: "Fern", address: acct.address, signature: await acct.signMessage({ message: msg + "x" }) }, NOW), /signature/);
  const r2 = await submitRun({ date: DATE, record: clone(b.rec), name: "Fern", address: acct.address, signature: await acct.signMessage({ message: msg }) }, NOW);
  assert.equal(r2.entry!.address, acct.address.toLowerCase());
  // Bad inputs.
  await assert.rejects(submitRun({ date: "2026-10-01", record: clone(a.rec), name: "Moss" }, NOW), /today/);
  await assert.rejects(submitRun({ date: DATE, record: clone(a.rec), name: "<script>" }, NOW), /name/);
  // The board and a run's proof agree on one root that covers both sides.
  const w = board(DATE, "worm"), wd = board(DATE, "warden");
  assert.equal(w.root, wd.root);
  const got = runWithProof(DATE, r2.entry!.run)!;
  assert.ok(verifyProof(got.proof!.leaf, got.proof!.proof, w.root));
  assert.deepEqual(got.record, b.rec);
  setDataDir(null);
});
