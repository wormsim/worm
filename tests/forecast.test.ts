/* The forecast page draws numbers anyone can regenerate. Spot-check two cells
   against the published data, and the calibration's direction against the paper. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCell } from "../app/lib/forecast";
import { OUTBREAK_VERSION } from "../sim/outbreak";

const data = JSON.parse(readFileSync(new URL("../app/lib/forecast-data.json", import.meta.url), "utf8"));

test("the published forecast was made by this engine and re-runs to the same numbers", () => {
  assert.equal(data.engine, OUTBREAK_VERSION, "regenerate with npx tsx scripts/forecast.ts");
  for (const [pkg, era] of [["all", 0], ["notify", 6]] as const) {
    const want = data.cells.find((c: { pkg: string; era: number }) => c.pkg === pkg && c.era === era);
    assert.deepEqual(runCell(pkg, era, data.seeds), want, `${pkg} ${want.year}`);
  }
});

test("calibration: setup success starts near the paper's 45% and climbs with inherited notes", () => {
  const c = data.calibration;
  assert.ok(Math.abs(c[0].rate - 0.45) < 0.05, `generation 0: ${c[0].rate}`);
  assert.ok(c[3].rate > c[1].rate && c[1].rate > c[0].rate, "rises with generation");
  assert.ok(c[3].rate >= 0.61 && c[3].rate <= 0.84, "inside the paper's 61–84% band");
});
