/* Outbreak: the real-time mode is still a pure function of its record. */

import test from "node:test";
import assert from "node:assert/strict";
import { beginDay, cosOf, endDay, headingTo, IDLE, newRun, O, pick, Recorder, replay, sinOf, step, type OState, type RunRecord, type TickInput } from "../sim/outbreak";
import { CARDS } from "../sim/outbreak-cards";
import { NOTE_DEFAULT } from "../sim/war";

/** A plain player: chase the nearest real food, burrow when rich, dodge a strike drawn through you. */
function bot(s: OState): TickInput {
  const lead = s.worms.find((w) => w.lead);
  if (!lead) return IDLE;
  const d = s.drone;
  if (d.phase === 1) for (let k = 0; k <= 10; k++) {
    const px = d.x + cosOf(d.lh) * 0.055 * k, py = d.y + sinOf(d.lh) * 0.055 * k;
    if ((px - lead.x) ** 2 + (py - lead.y) ** 2 < 0.012) return { ...IDLE, h: (d.lh + 256) % 1024, dash: true };
  }
  if (lead.cash > 4.2 || lead.st > 0) return { ...IDLE, burrow: lead.cash > 1.2 };
  let best = 9, tx = 0, ty = 0;
  for (const p of s.pellets) { if (p.bait) continue; const dd = (p.x - lead.x) ** 2 + (p.y - lead.y) ** 2; if (dd < best) { best = dd; tx = p.x; ty = p.y; } }
  return best === 9 ? { ...IDLE, burrow: true } : { ...IDLE, h: headingTo(tx - lead.x, ty - lead.y), rally: s.tick % 200 < 20 };
}

function play(seed: number, days: number): { s: OState; rec: RunRecord } {
  const s = newRun(seed, "worm");
  const rec: RunRecord = { v: s.v, seed, side: "worm", days: [] };
  for (let d = 0; d < days && !s.over; d++) {
    const note = { ...NOTE_DEFAULT, ground: d % 2 ? "hard" as const : "any" as const };
    beginDay(s, note);
    const r = new Recorder();
    while (!s.dayOver) { const i = bot(s); r.push(s.tick, i); step(s, i); }
    endDay(s);
    const day: RunRecord["days"][number] = { note, inputs: r.rows };
    if (s.offers.length) { day.pick = s.offers[1]; pick(s, s.offers[1]); }
    rec.days.push(day);
  }
  return { s, rec };
}

test("the trig is integer headings and a fixed polynomial", () => {
  assert.equal(headingTo(1, 0), 0);
  assert.equal(headingTo(0, 1), 256);
  assert.equal(headingTo(-1, 0), 512);
  assert.equal(headingTo(0, -1), 768);
  assert.equal(headingTo(1, 1), 128);
  assert.equal(sinOf(256), 1);
  assert.equal(cosOf(512), -1);
  for (let h = 0; h < 1024; h += 37) assert.ok(Math.abs(sinOf(h) ** 2 + cosOf(h) ** 2 - 1) < 1e-8);
});

test("a played run replays from its record to the same heads and score", () => {
  const { s, rec } = play(4242, 3);
  const r = replay(JSON.parse(JSON.stringify(rec)));
  assert.equal(r.state.head, s.head);
  assert.equal(r.state.score, s.score);
  assert.deepEqual(r.reports.map((x) => x.head), s.reports.map((x) => x.head));
  assert.ok(rec.days.every((d) => d.inputs.length < O.dayTicks), "inputs are stored only when they change");
});

test("change one input and the head changes", () => {
  const { s, rec } = play(4242, 2);
  const forged: RunRecord = JSON.parse(JSON.stringify(rec));
  const row = forged.days[0].inputs.find((r) => r[1] >= 0)!;
  row[1] = (row[1] + 300) % 1024;
  // Either the run now plays differently, or it stops making sense (a card that was never offered).
  let head = "";
  try { head = replay(forged).state.head; } catch { head = "refused"; }
  assert.notEqual(head, s.head);
});

test("the same seed deals the same dish; another seed deals another", () => {
  const a = newRun(7, "worm"), b = newRun(7, "worm"), c = newRun(8, "worm");
  assert.deepEqual(a.hard, b.hard);
  assert.notDeepEqual(a.hard, c.hard);
  beginDay(a); beginDay(b);
  assert.deepEqual(a.pellets, b.pellets);
});

test("the draft offers your side's cards, and refuses one it didn't offer", () => {
  const { s } = play(99, 1);
  const s2 = newRun(99, "warden"); beginDay(s2); while (!s2.dayOver) step(s2); endDay(s2);
  for (const id of s2.offers) assert.equal(CARDS.find((c) => c.id === id)!.side, "warden");
  assert.ok(s2.cards.worm.length === 1, "the house drafted for the swarm");
  assert.throws(() => pick(s2, "thick-skin"));
  assert.ok(s.cards.warden.length === 1, "the house drafted for the wardens");
});

test("a warden's tool costs energy, and a quarantine sweeps when it ends", () => {
  const s = newRun(5, "warden"); beginDay(s);
  const e0 = s.energy;
  const w = s.worms[0];
  step(s, { ...IDLE, place: { kind: "quarantine", x: w.x, y: w.y } });
  assert.equal(Math.round((e0 + O.energy.regen / O.tps - O.cost.quarantine) * 1e6) / 1e6, s.energy);
  let swept = false;
  while (!s.dayOver) { step(s); if (s.events.some((e) => e.k === "sweep")) swept = true; }
  assert.ok(swept);
});

/* ── pinned goldens and fuzzing ─────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { mulberry32 } from "../sim/engine";
import { playRun } from "./helpers/outbreak-bot";

test("the pinned Outbreak runs still play to the same heads (any rules drift fails here)", () => {
  const g = JSON.parse(readFileSync(new URL("./outbreak-golden.json", import.meta.url), "utf8"));
  for (const side of ["worm", "warden"] as const) {
    const { s } = playRun(g[side].seed, side);
    assert.equal(s.score, g[side].score, `${side} score`);
    assert.deepEqual(s.reports.map((r) => r.head), g[side].dayHeads, `${side} day heads`);
  }
});

test("fuzz: random inputs, both sides — the live run and its replay never disagree", () => {
  for (let k = 0; k < 6; k++) {
    const rnd = mulberry32(900 + k);
    const side = k % 2 ? "warden" as const : "worm" as const;
    const kinds = ["honeypot", "quarantine", "alert", "harden"] as const;
    const chaos = (): TickInput => ({
      h: rnd() < 0.1 ? -1 : Math.floor(rnd() * 1024), burrow: rnd() < 0.3, rally: rnd() < 0.1, dash: rnd() < 0.02,
      strike: rnd() < 0.02 ? Math.floor(rnd() * 1024) : -1,
      place: rnd() < 0.01 ? { kind: kinds[Math.floor(rnd() * 4)], x: Math.round((rnd() * 1.6 - 0.8) * 1000) / 1000, y: Math.round((rnd() * 1.6 - 0.8) * 1000) / 1000 } : null
    });
    const { s, rec } = playRun(5000 + k, side, 3, chaos);
    const r = replay(JSON.parse(JSON.stringify(rec)));
    assert.equal(r.state.head, s.head, `seed ${5000 + k} ${side}`);
    assert.equal(r.state.score, s.score);
  }
});
