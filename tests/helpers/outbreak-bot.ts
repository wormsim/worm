/* A plain, deterministic Outbreak player for tests: chase real food, burrow when rich,
   dodge a strike drawn through you; as the warden, strike crowds and box settled groups. */

import { beginDay, cosOf, endDay, headingTo, IDLE, newRun, O, pick, Recorder, sinOf, step, type OState, type RunRecord, type Side, type TickInput } from "../../sim/outbreak";
import { NOTE_DEFAULT } from "../../sim/war";

export function botInput(s: OState): TickInput {
  if (s.side === "warden") {
    const d = s.drone;
    let tx = 0, ty = 0, bn = 0;
    for (const w of s.worms) { if (w.st === 2) continue; let n = 0; for (const o of s.worms) if (o.st !== 2 && (o.x - w.x) ** 2 + (o.y - w.y) ** 2 < 0.04) n++; if (n > bn) { bn = n; tx = w.x; ty = w.y; } }
    const i: TickInput = { ...IDLE, h: bn ? headingTo(tx - d.x, ty - d.y) : -1 };
    if (bn && d.phase === 0 && d.cd === 0 && (tx - d.x) ** 2 + (ty - d.y) ** 2 < 0.1) i.strike = headingTo(tx - d.x, ty - d.y);
    const settled = s.worms.find((w) => w.st === 2);
    if (s.tick % 40 === 0 && settled && s.energy >= 4 && !s.tools.some((t) => t.kind === "quarantine" && !t.done)) i.place = { kind: "quarantine", x: Math.round(settled.x * 1000) / 1000, y: Math.round(settled.y * 1000) / 1000 };
    return i;
  }
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

/** Play a run to the end (or `maxDays`) and return the state and the record a client would send. */
export function playRun(seed: number, side: Side, maxDays = 99, input: (s: OState) => TickInput = botInput) {
  const s = newRun(seed, side);
  const rec: RunRecord = { v: s.v, seed, side, days: [] };
  for (let d = 0; d < maxDays && !s.over; d++) {
    const note = side === "worm" ? { ...NOTE_DEFAULT, ground: d % 2 ? "hard" as const : "any" as const } : undefined;
    beginDay(s, note);
    const r = new Recorder();
    while (!s.dayOver) { const i = input(s); r.push(s.tick, i); step(s, i); }
    endDay(s);
    const day: RunRecord["days"][number] = { ...(note ? { note } : {}), inputs: r.rows };
    if (s.offers.length) { day.pick = s.offers[0]; pick(s, s.offers[0]); }
    rec.days.push(day);
  }
  void O;
  return { s, rec };
}
