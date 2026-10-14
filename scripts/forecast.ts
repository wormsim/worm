#!/usr/bin/env npx tsx
/* Regenerate the forecast study: npx tsx scripts/forecast.ts [--seeds 16] [--eras 9]
   Writes app/lib/forecast-data.json. Deterministic — same numbers on any machine. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { calibration, crossover, FORECAST_VERSION, PACKAGES, runCell, type Cell } from "../app/lib/forecast";
import { O, OUTBREAK_VERSION } from "../sim/outbreak";

const arg = (n: string, d: number) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const seeds = arg("seeds", 24), eras = arg("eras", 13);
const cells: Cell[] = [];
const t0 = Date.now();
for (const p of PACKAGES) for (let e = 0; e < eras; e++) { const c = runCell(p.id, e, seeds); cells.push(c); console.log(`${p.id.padEnd(10)} ${c.year}  R ${c.meanR.toFixed(3)}  held ${(c.held * 100).toFixed(0).padStart(3)}%  lid ${(c.lid * 100).toFixed(0).padStart(3)}%  alive ${c.finalAlive}`); }
const cal = calibration(seeds);
console.log("setup success by generation:", cal.map((c) => `g${c.gen} ${c.rate}`).join(" "));
const out = { v: FORECAST_VERSION, calibration: cal, engine: OUTBREAK_VERSION, seeds, setupPerYear: O.forecast.setupPerYear, cells, crossovers: Object.fromEntries(PACKAGES.map((p) => [p.id, crossover(cells, p.id)])) };
writeFileSync(path.join(process.cwd(), "app/lib/forecast-data.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`\ncrossovers ${JSON.stringify(out.crossovers)} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
