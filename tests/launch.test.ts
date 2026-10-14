/* Launch guard. config/launch.json is the one place the ticker and the launch facts live.
   These tests stop two mistakes: a ticker hard-coded somewhere the config can't reach, and a
   launch where the site or the docs still say "no token exists" (or the reverse). */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import launch from "../config/launch.json";

const isSet = (v: string) => Boolean(v) && !v.startsWith("{{");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : [];
});

test("the ticker is written only in config/launch.json", () => {
  assert.match(launch.token.symbol, /^\$[A-Z0-9]{2,10}$/);
  const hits = ["app", "scripts", "sim"].filter(existsSync).flatMap(walk)
    .filter((f) => readFileSync(f, "utf8").includes(launch.token.symbol) || /\$WORM\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, [], "read the symbol from app/lib/launch.ts instead");
});

const NO_TOKEN = /no token exists|no token today|no token, no sale|as of today no token|token allocation: none/i;
const DOCS = ["README.md", "GOVERNANCE.md", "docs/STATUS.md", "docs/FAQ.md", "docs/ESSAY.md", "docs/TERMS.md", "docs/FOR-MODIFIERS.md"].filter(existsSync);

test("launch facts agree with the launch status", () => {
  const t = launch.token;
  if (t.status === "live") {
    for (const k of ["chain", "venue", "contract", "supply", "teamAllocation", "anchorWallet"] as const) assert.ok(isSet(t[k]), `${k} must be filled before going live`);
    assert.match(t.contract, /^0x[0-9a-fA-F]{40}$/);
    for (const f of DOCS) assert.doesNotMatch(readFileSync(f, "utf8"), NO_TOKEN, `${f} still says there is no token`);
  } else {
    assert.equal(t.status, "not-live");
    assert.ok(!isSet(t.contract), "a contract address is filled in while the status says not-live");
  }
});
