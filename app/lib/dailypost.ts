/* ── app/lib/dailypost.ts ────────────────────────────────────────────────────
   The daily post for the WORM account, built from a resolved live day. Pure.
   Every number in it comes from the replay, and it always names the block and
   the chain head so anyone can check it. Fits in one post (X counts any link
   as 23 characters).
   --------------------------------------------------------------------------- */

import type { ResolvedDay } from "./live/season";
import type { Standings } from "./standings";

const who = (p: string) => /^0x[0-9a-f]{40}$/i.test(p) ? `${p.slice(0, 6)}…${p.slice(-4)}` : p;

export function dailyPost(o: { season: number; day: ResolvedDay; standings: Standings; block: number; site: string }): { text: string; length: number } {
  const r = o.day.result;
  const verdict = r.winner === "red" ? `the swarm grew, ${r.startAlive} to ${r.endAlive}` : `contained, ${r.startAlive} to ${r.endAlive}`;
  const fam = o.standings.families[0], ward = o.standings.wardens[0];
  const opt = {
    season: `Season: Worms ${o.standings.days.red} · Wardens ${o.standings.days.blue}`,
    fam: fam ? `Top worm: ${who(fam.player)} · ${fam.alive} alive · gen ${fam.gens}` : "",
    ward: ward && ward.stopped > 0 ? `Top warden: ${who(ward.player)} · ${ward.stopped} stopped` : ""
  };
  const build = (keep: (keyof typeof opt)[]) => [
    `🪱 WORM · S${o.season} day ${r.day}/7`,
    `R = ${r.R.toFixed(2)}: ${verdict}.`,
    ...keep.map((k) => opt[k]).filter(Boolean),
    `Dice: Robinhood block #${o.block}`,
    `Head ${r.head.slice(0, 10)}. Re-run it yourself.`,
    r.day < 7 ? `Day ${r.day + 1}: seal by 18:00 UTC` : "Next season opens 00:00 UTC",
    `${o.site}/play`
  ].join("\n");
  // X's weighting: a link is 23; Latin and a few punctuation ranges are 1; everything else (…, emoji) is 2.
  const light = (c: number) => c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
  const weigh = (t: string) => [...t.replace(/https?:\/\/\S+/g, "x".repeat(23))].reduce((n, ch) => n + (light(ch.codePointAt(0)!) ? 1 : 2), 0);
  // Drop the least important lines until it fits.
  let text = "", length = Infinity;
  for (const keep of [["season", "fam", "ward"], ["season", "fam"], ["fam"], []] as (keyof typeof opt)[][]) { text = build(keep); length = weigh(text); if (length <= 280) break; }
  return { text, length };
}
