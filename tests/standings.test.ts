/* Standings are a pure reading of the season: they must add up to the season. */

import test from "node:test";
import assert from "node:assert/strict";
import { newSeason, playDay, type DayResult, type Move, type WarState } from "../sim/war";
import { botBlueMove, botRedMove, botRoster } from "../sim/warbots";
import { playerDays, rankOf, standings } from "../app/lib/standings";

function season(days: number) {
  let st: WarState = newSeason(77);
  const { red, blue } = botRoster("blue");
  const out: { day: number; moves: Move[]; result: DayResult }[] = [];
  let last: DayResult | null = null;
  for (let d = 0; d < days; d++) {
    const moves: Move[] = [...red.map((n) => botRedMove(st, n, last)), ...blue.map((n, k) => botBlueMove(st, n, k))];
    const r = playDay(st, moves, 1000 + d);
    st = r.state; last = r.result; out.push({ day: r.result.day, moves, result: r.result });
  }
  return { st, out };
}

test("standings add up to the season they were read from", () => {
  const { st, out } = season(4);
  const s = standings(st, out.map((d) => d.result));
  assert.equal(s.families.reduce((a, f) => a + f.alive, 0), st.worms.length, "every living worm is in exactly one family row");
  const stops = out.flatMap((d) => d.result.events).filter((e) => e.kind === "caught" || e.kind === "cleaned").length;
  assert.equal(s.wardens.reduce((a, w) => a + w.stopped, 0), stops);
  assert.equal(s.days.red + s.days.blue, 4);
  for (let i = 1; i < s.families.length; i++) assert.ok(s.families[i - 1].alive >= s.families[i].alive, "sorted by alive");
  const top = s.families[0];
  assert.deepEqual(rankOf(s, top.player), { side: "red", rank: 1, of: s.families.length });
  const pd = playerDays(top.player, st, out);
  assert.equal(pd.length, 4);
  assert.equal(pd[3].score, out[3].result.score[top.player] ?? 0);
  assert.ok(pd.every((d) => d.side === "red"));
});
