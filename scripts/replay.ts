#!/usr/bin/env npx tsx
/* ── scripts/replay.ts ───────────────────────────────────────────────────────
   Replay the jar and print its commitment.

     npm run replay -- --seed 20261013                 # stats + chain head
     npm run replay -- --seed 20261013 --ticks 100     # a shorter run
     npm run replay -- --seed 20261013 --json          # the full record set
     npm run replay -- --seed 20261013 --check         # compare with tests/goldens.json

   Anyone can run this on a clean checkout. If `--check` fails, either the rules
   changed (bump WORLD_VERSION and say so in AUDIT-LOG.md) or the engine stopped
   being deterministic — both are bugs, not preferences.
   --------------------------------------------------------------------------- */

import { readFileSync } from "node:fs";
import path from "node:path";
import { RULES, simulate } from "../sim/engine";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const seed = Number(arg("seed") ?? 20261013);
const ticks = Number(arg("ticks") ?? RULES.maxTicks);

if (!Number.isInteger(seed)) { console.error(`--seed must be an integer, got "${arg("seed")}"`); process.exit(2); }
if (!Number.isInteger(ticks) || ticks < 1 || ticks > 100000) { console.error("--ticks must be an integer between 1 and 100000"); process.exit(2); }

const run = simulate(seed, ticks);

if (flag("json")) {
  console.log(JSON.stringify(run, null, 2));
} else {
  console.log(`world     ${run.version}`);
  console.log(`seed      ${run.seed}`);
  console.log(`ticks     ${run.ticks}`);
  console.log(`alive     ${run.stats.alive}`);
  console.log(`max gen   ${run.stats.maxGen}`);
  console.log(`births    ${run.stats.births}`);
  console.log(`deaths    ${run.stats.deaths}`);
  console.log(`treasury  ${run.stats.treasury}`);
  console.log(`head      ${run.head}`);
  console.log(`chain     ${run.chain}`);
  if (run.stats.alive === 0) console.log(`\nextinct at tick ${run.ticks} — the record is the point, not survival.`);
}

if (flag("check")) {
  const path_ = path.join(process.cwd(), "tests", "goldens.json");
  const goldens = JSON.parse(readFileSync(path_, "utf8")) as { seed: number; ticks: number; chain: string; alive: number; maxGen: number }[];
  const golden = goldens.find((g) => g.seed === seed && g.ticks === ticks);
  if (!golden) {
    console.error(`\nno golden for seed ${seed} / ${ticks} ticks in tests/goldens.json — nothing to compare against.`);
    process.exit(2);
  }
  const problems: string[] = [];
  if (golden.chain !== run.chain) problems.push(`chain: golden ${golden.chain.slice(0, 16)}… vs replay ${run.chain.slice(0, 16)}…`);
  if (golden.alive !== run.stats.alive) problems.push(`alive: golden ${golden.alive} vs replay ${run.stats.alive}`);
  if (golden.maxGen !== run.stats.maxGen) problems.push(`maxGen: golden ${golden.maxGen} vs replay ${run.stats.maxGen}`);
  if (problems.length) { console.error(`\nDIVERGED\n  ${problems.join("\n  ")}`); process.exit(1); }
  console.log(`\nIDENTICAL — seed ${seed}, ${ticks} ticks matches the pinned golden.`);
}
