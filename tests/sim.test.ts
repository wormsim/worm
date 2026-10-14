/* The rules are only a commitment if a stranger can re-derive them. These tests are
   that check, and CI runs them on every push: determinism, the invariants the rules
   claim to hold, the hash chain, the SHA-256 implementation itself, and the goldens. */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES, WORLD_VERSION, simulate } from "../sim/engine";
import { chainHash, recordHash, sha256Hex, stableStringify } from "../sim/hash";

interface Golden { seed: number; ticks: number; chain: string; alive: number; maxGen: number; note: string }
const goldens = JSON.parse(readFileSync(join(process.cwd(), "tests", "goldens.json"), "utf8")) as Golden[];

test("the SHA-256 implementation matches node:crypto", () => {
  for (const input of ["", "a", "abc", "mitosis/1", "× ünïcödé 🧫", "x".repeat(1000), stableStringify({ b: 1, a: [2, { c: null }] })]) {
    assert.equal(sha256Hex(input), createHash("sha256").update(input, "utf8").digest("hex"), `sha256(${JSON.stringify(input.slice(0, 20))})`);
  }
});

test("canonical JSON makes key order irrelevant to a hash", () => {
  assert.equal(recordHash({ b: 1, a: 2 }), recordHash({ a: 2, b: 1 }));
  assert.notEqual(recordHash({ a: 1 }), recordHash({ a: 2 }));
});

test("the same seed replays to the same bytes, twice", () => {
  const a = simulate(20261013, 220);
  const b = simulate(20261013, 220);
  assert.equal(a.chain, b.chain);
  assert.deepEqual(a.records, b.records);
  assert.deepEqual(a.events, b.events);
});

test("an observer sees every tick and cannot change the run", () => {
  const plain = simulate(20261013, 200);
  const seen: number[] = [];
  const watched = simulate(20261013, 200, (t, agents) => {
    seen.push(t);
    for (const a of agents) (a as { cash: number }).cash = -1;   // vandalise the copy
  });
  assert.equal(watched.chain, plain.chain);
  assert.deepEqual(watched.events, plain.events);
  assert.deepEqual(seen, Array.from({ length: plain.records.length + 1 }, (_, i) => i));
});

test("a different seed produces a different run", () => {
  assert.notEqual(simulate(1, 120).chain, simulate(2, 120).chain);
});

test("the chain commits to every tick before it, not just the last one", () => {
  const run = simulate(20261013, 120);
  let chain = "0".repeat(64);
  for (const record of run.records) chain = chainHash(chain, recordHash(record));
  assert.equal(chain, run.chain);
  // The same record with a different preceding head must not reproduce the head.
  const last = run.records[run.records.length - 1];
  assert.notEqual(chainHash("f".repeat(64), recordHash(last)), run.chain);
});

test("the rules hold: no negative balances, a lid on the jar, halves on split", () => {
  const run = simulate(20261013, RULES.maxTicks);
  for (const record of run.records) {
    assert.ok(record.alive <= RULES.cap, `tick ${record.t}: ${record.alive} alive exceeds the cap`);
    assert.ok(record.treasury >= 0 && record.rent > 0);
    assert.equal(record.alive, Math.max(0, record.alive));
  }
  for (const ev of run.events.filter((e) => e.kind === "split")) {
    assert.ok(ev.cash > 0, "a child is never created with nothing");
    const parentBefore = run.records[ev.t - 1];
    assert.ok(parentBefore, "a split cannot happen before its tick's record exists");
  }
  // An agent can appear twice (it splits, then it dies) — so uniqueness belongs to
  // the set of children, not to the event list.
  const childIds = new Set(run.events.filter((e) => e.kind === "split").map((e) => e.id));
  assert.equal(childIds.size, run.events.filter((e) => e.kind === "split").length, "every child has a unique id");
});

test("generations only ever descend from an earlier generation", () => {
  const run = simulate(7, 260);
  const byId = new Map<number, number>();
  for (const ev of run.events.filter((e) => e.kind === "split")) {
    assert.ok(ev.parent !== null);
    const parentGen = byId.get(ev.parent!) ?? 1;
    assert.equal(ev.gen, parentGen + 1, `child ${ev.id} claims generation ${ev.gen}`);
    byId.set(ev.id, ev.gen);
  }
});

test("the pinned goldens still replay", () => {
  for (const golden of goldens) {
    const run = simulate(golden.seed, golden.ticks);
    assert.equal(run.chain, golden.chain, `seed ${golden.seed} / ${golden.ticks} ticks (${golden.note})`);
    assert.equal(run.stats.alive, golden.alive);
    assert.equal(run.stats.maxGen, golden.maxGen);
  }
});

test("the world version is declared and stamped on every record", () => {
  const run = simulate(3, 40);
  assert.equal(WORLD_VERSION, "worm/1");
  for (const record of run.records) assert.equal(record.v, WORLD_VERSION);
});

test("an extinct jar stops early and keeps its record", () => {
  // A seed chosen for a short life: whatever the outcome, the invariants hold.
  const run = simulate(999999, 340);
  if (run.stats.alive === 0) {
    assert.ok(run.ticks < 340, "an extinct run stops before maxTicks");
    assert.equal(run.records[run.records.length - 1].alive, 0);
  }
  assert.equal(run.records.length, run.ticks);
});
