/* ── app/lib/forecast.ts ─────────────────────────────────────────────────────
   The forecast study: where the paper stops, run the engine forward.

   Question: as small models get better at the paper's bottleneck (setting up on
   new hardware), and as both sides adopt the next tricks (signatures for the
   defenders, notes shared sideways for the replicators), which defences still
   hold R under one — and from which year don't they?

   Method: the Outbreak engine, house swarm against a scripted defender, seven
   days per run, no strikes and no drafts (newRun's `study` option) so every
   scenario plays the same week. One capability year = setup 15% faster, plus
   the extrapolations switched on in O.forecast. Pure and deterministic:
   `npx tsx scripts/forecast.ts` regenerates app/lib/forecast-data.json bit for bit.
   --------------------------------------------------------------------------- */

import { beginDay, endDay, headingTo, IDLE, newRun, O, step, type OState, type TickInput } from "../../sim/outbreak";

export const FORECAST_VERSION = "forecast/1";
export const PACKAGES = [
  { id: "none", name: "Nothing", text: "No defence at all. The baseline." },
  { id: "quarantine", name: "Quarantine", text: "Box the densest settled group; 40% cleaned when it ends." },
  { id: "notify", name: "+ Notification", text: "An alert over every quarantine: clean-up ×92/74, the paper's Mirai number." },
  { id: "honeypot", name: "+ Honeypots & signatures", text: "Bait ahead of the crawlers; every note caught becomes a signature (swept 50% more)." },
  { id: "all", name: "+ Detection drone", text: "Everything, plus a drone that strikes crowds of crawlers." }
] as const;
export type PackageId = (typeof PACKAGES)[number]["id"];

const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const q3 = (x: number) => Math.round(x * 1000) / 1000;

/** The scripted defender for one package. Deterministic: a function of the state only. */
export function defender(pkg: PackageId) {
  const lvl = PACKAGES.findIndex((p) => p.id === pkg);
  return (s: OState): TickInput => {
    if (lvl === 0) return IDLE;
    const i: TickInput = { ...IDLE };
    const qLive = s.tools.find((t) => t.kind === "quarantine" && !t.done);
    if (s.tick % 10 === 0) {
      if (!qLive && s.energy >= O.cost.quarantine) {
        let best = -1, bestN = 0;
        for (const w of s.worms) { if (w.st < 1) continue; let n = 0; for (const o of s.worms) if (o.st >= 1 && d2(o.x, o.y, w.x, w.y) < 0.03) n++; if (n > bestN) { bestN = n; best = s.worms.indexOf(w); } }
        if (best >= 0) i.place = { kind: "quarantine", x: q3(s.worms[best].x), y: q3(s.worms[best].y) };
      } else if (lvl >= 2 && qLive && s.energy >= O.cost.alert && !s.tools.some((t) => t.kind === "alert" && !t.done)) i.place = { kind: "alert", x: qLive.x, y: qLive.y };
      else if (lvl >= 3 && s.tick % 120 === 0 && s.energy >= O.cost.quarantine + O.cost.honeypot) {
        const c = s.worms.find((w) => w.st === 0);
        if (c) i.place = { kind: "honeypot", x: q3(c.x + Math.cos((c.h / 1024) * 2 * Math.PI) * 0.15), y: q3(c.y + Math.sin((c.h / 1024) * 2 * Math.PI) * 0.15) };
      }
    }
    if (lvl >= 4) {
      const d = s.drone;
      let tx = 0, ty = 0, bn = 0;
      for (const w of s.worms) { if (w.st === 2) continue; let n = 0; for (const o of s.worms) if (o.st !== 2 && d2(o.x, o.y, w.x, w.y) < 0.04) n++; if (n > bn) { bn = n; tx = w.x; ty = w.y; } }
      if (bn) { i.h = headingTo(q3(tx - d.x), q3(ty - d.y)); if (d.phase === 0 && d.cd === 0 && d2(tx, ty, d.x, d.y) < 0.1) i.strike = i.h; }
    }
    return i;
  };
}

export interface Cell { pkg: PackageId; era: number; year: number; meanR: number; held: number; lid: number; finalAlive: number }

/** One week under one package at one capability year, over `seeds` dishes. */
export function runCell(pkg: PackageId, era: number, seeds: number): Cell {
  const play = defender(pkg);
  let sumLogR = 0, nR = 0, held = 0, lid = 0, alive = 0;
  for (let k = 0; k < seeds; k++) {
    const s = newRun(7000 + k * 101, "warden", { era, study: true });
    if (pkg === "honeypot" || pkg === "all") s.warden.signature = true;
    while (!s.over) {
      beginDay(s);
      while (!s.dayOver) step(s, play(s));
      const r = endDay(s);
      if (r.startAlive > 0) { sumLogR += Math.log(Math.max(0.05, r.R)); nR++; }
    }
    if (s.over === "outbreak") lid++;
    if (s.over === "eradicated" || (s.over === "won" && s.reports.filter((r) => r.R <= 1).length >= 4)) held++;
    alive += s.worms.length;
  }
  return { pkg, era, year: O.forecast.firstYear + era, meanR: Math.round(Math.exp(sumLogR / Math.max(1, nR)) * 1000) / 1000, held: Math.round((held / seeds) * 1000) / 1000, lid: Math.round((lid / seeds) * 1000) / 1000, finalAlive: Math.round(alive / seeds) };
}

/** The first year a package's typical R stays above one from then on; null if it never does in range. */
export function crossover(cells: Cell[], pkg: PackageId): number | null {
  const row = cells.filter((c) => c.pkg === pkg).sort((a, b) => a.era - b.era);
  for (let i = 0; i < row.length; i++) if (row.slice(i).every((c) => c.meanR > 1)) return row[i].year;
  return null;
}

/** Calibration: the engine's setup success by generation, measured the way the paper measured it. */
export function calibration(seeds: number, era = 0) {
  const tries: number[] = [], ok: number[] = [];
  const play = defender("none");
  for (let k = 0; k < seeds; k++) {
    const s = newRun(9000 + k * 37, "warden", { era, study: true });
    while (!s.over) { beginDay(s); while (!s.dayOver) step(s, play(s)); endDay(s); }
    s.setupTries.forEach((t, g) => { tries[g] = (tries[g] ?? 0) + (t ?? 0); ok[g] = (ok[g] ?? 0) + (s.setupOk[g] ?? 0); });
  }
  return tries.map((t, g) => ({ gen: g, tries: t ?? 0, rate: t ? Math.round(((ok[g] ?? 0) / t) * 1000) / 1000 : null })).filter((r) => r.gen <= 8);
}
