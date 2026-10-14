/* What happened to your family today, and the one change most likely to help.
   Pure: read straight off the day's events. Used by the practice and live tabs. */

import type { DayResult, Note } from "../../sim/war";

export interface Recap { born: number; starved: number; caught: number; cleaned: number; settledHard: number; settledSoft: number; advice: string }

export function recapRed(r: DayResult, fam: number | null, note: Note | null): Recap | null {
  if (fam === null) return null;
  const ev = r.events.filter((e) => e.fam === fam);
  const n = (k: string) => ev.filter((e) => e.kind === k).length;
  const born = n("birth"), starved = n("starve"), caught = n("caught"), cleaned = n("cleaned");
  const settled = ev.filter((e) => e.kind === "settle") as Extract<DayResult["events"][number], { kind: "settle" }>[];
  const settledHard = settled.filter((e) => e.hard).length, settledSoft = settled.length - settledHard;
  const worst = Math.max(starved, caught, cleaned);
  let advice = "A good day. Keep the note, or push it: split earlier to grow faster.";
  if (worst === 0 && born === 0) advice = "Nothing grew. Your worms never earned enough to split — try splitting earlier, or settling anywhere.";
  else if (worst > 0 && worst === starved) advice = note?.ground === "soft" ? "Rent outran income. Soft ground pays too little as rent climbs — try hard ground." : note?.split === "early" ? "Rent outran income. Early splits leave children too poor to settle — try splitting at 6.5." : "Rent outran income: too much crawling, not enough settling. Try settling anywhere close.";
  else if (worst > 0 && worst === caught) advice = note?.food === "careful" ? "Honeypots still got you — they also bait the crowd. Stay away from where the Wardens set them." : "A honeypot caught your worm and the Wardens read your note. Try “Never eat food lying on its own.”";
  else if (worst > 0 && worst === cleaned) advice = "Quarantines swept your settled worms. Spread out: tell your children to stay away from the crowded side.";
  return { born, starved, caught, cleaned, settledHard, settledSoft, advice };
}
