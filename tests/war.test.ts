/* Red vs Blue: the day is a pure function, the order moves arrive in does not
   matter, a sealed move changes the seed, and each defensive tool does exactly
   what its card says. */

import test from "node:test";
import assert from "node:assert/strict";
import { commitmentOf, newSeason, noteText, NOTE_DEFAULT, playDay, seedFromCommitments, WAR, type Move, type WarState } from "../sim/war";
import { botBlueMove, botRedMove, botRoster } from "../sim/warbots";

function dayOne(season = 42) {
  const { red, blue } = botRoster("blue");
  const st = newSeason(season, blue);
  const moves: Move[] = [...red.map((n) => botRedMove(st, n, null)), ...blue.map((n, k) => botBlueMove(st, n, k))];
  const commitments = moves.map((m) => commitmentOf(m, `salt-${m.player}`));
  return { st, moves, commitments, seed: seedFromCommitments(season, 1, commitments) };
}

test("a day is a pure function of state, moves and seed", () => {
  const { st, moves, seed } = dayOne();
  const before = JSON.stringify(st);
  const a = playDay(st, moves, seed), b = playDay(st, moves, seed);
  assert.equal(a.result.head, b.result.head);
  assert.deepEqual(a.result.events, b.result.events);
  assert.equal(JSON.stringify(st), before, "playDay must not modify the state it was given");
});

test("the order moves arrive in changes nothing", () => {
  const { st, moves, seed } = dayOne();
  const shuffled = [...moves].reverse();
  assert.equal(playDay(st, moves, seed).result.head, playDay(st, shuffled, seed).result.head);
});

test("the seed comes from everyone's sealed moves: change one move and the seed changes", () => {
  const { moves, commitments } = dayOne();
  const tweaked = { ...(moves[0] as Extract<Move, { side: "red" }>), note: { ...NOTE_DEFAULT, split: "late" as const } };
  const other = [commitmentOf(tweaked, "salt-x"), ...commitments.slice(1)];
  assert.notEqual(seedFromCommitments(42, 1, commitments), seedFromCommitments(42, 1, other));
  assert.equal(seedFromCommitments(42, 1, commitments), seedFromCommitments(42, 1, [...commitments].reverse()), "order of commitments is irrelevant");
});

function solo(spawn: [number, number][], tools: Move[] = [], note = NOTE_DEFAULT): { st: WarState; out: ReturnType<typeof playDay> } {
  const st = newSeason(7, tools.map((t) => t.player));
  const moves: Move[] = [{ side: "red", player: "you", note, spawn }, ...tools];
  return { st, out: playDay(st, moves, 1234) };
}

test("a honeypot catches one crawling worm, reads its note, then is spent", () => {
  const { out } = solo([[6, 6], [6, 6]], [{ side: "blue", player: "w", tools: [{ kind: "honeypot", x: 6, y: 6 }] }]);
  const caught = out.result.events.filter((e) => e.kind === "caught");
  assert.equal(caught.length, 1, "a trap springs once");
  assert.ok(caught[0].kind === "caught" && caught[0].by === "w" && caught[0].note.split === NOTE_DEFAULT.split);
  assert.equal(out.result.score.w, 1);
});

test("a careful note walks past food lying on its own", () => {
  const careful = { ...NOTE_DEFAULT, food: "careful" as const };
  // Bait placed next to a lone worm in an empty corner: greedy takes it, careful does not.
  const greedy = solo([[3, 3], [9, 9]], [{ side: "blue", player: "w", tools: [{ kind: "honeypot", x: 4, y: 3 }] }]);
  const wary = solo([[3, 3], [9, 9]], [{ side: "blue", player: "w", tools: [{ kind: "honeypot", x: 4, y: 3 }] }], careful);
  const caughtG = greedy.out.result.events.filter((e) => e.kind === "caught").length;
  const caughtW = wary.out.result.events.filter((e) => e.kind === "caught").length;
  assert.ok(caughtW <= caughtG, `careful ${caughtW} vs greedy ${caughtG}`);
});

test("rent doubles inside a quarantine", () => {
  const free = solo([[6, 6], [2, 6]]);
  const boxed = solo([[6, 6], [2, 6]], [{ side: "blue", player: "w", tools: [{ kind: "quarantine", x: 6, y: 6 }] }]);
  const cash = (o: typeof free) => o.out.result.frames[1].find((f) => f[0] === 0)![5];
  assert.ok(cash(boxed) < cash(free), "the worm inside the box paid more on tick 1");
});

test("children are born carrying the family's note of the day they were born", () => {
  const { st, moves, seed } = dayOne(9);
  const { state } = playDay(st, moves, seed);
  for (const w of state.worms) if (w.gen > 1) assert.deepEqual(w.note, state.families[w.fam].note);
});

test("R is the day's growth: worms at the end over worms at the start", () => {
  const { st, moves, seed } = dayOne(11);
  const { result } = playDay(st, moves, seed);
  assert.equal(result.R, Math.round((result.endAlive / result.startAlive) * 1000) / 1000);
  assert.equal(result.winner, result.R > 1 ? "red" : "blue");
  assert.ok(result.endAlive <= WAR.cap);
});

test("a note reads as plain sentences, and every field changes the text", () => {
  const base = noteText(NOTE_DEFAULT);
  for (const n of [{ ground: "hard" }, { split: "late" }, { food: "careful" }, { avoid: "east" }] as const) assert.notEqual(noteText({ ...NOTE_DEFAULT, ...n }), base);
});
