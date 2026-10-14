#!/usr/bin/env npx tsx
/* ── scripts/post-daily.ts ───────────────────────────────────────────────────
   After a live day resolves (22:00 UTC), post its result from the WORM account.

     npx tsx scripts/post-daily.ts                 # print the post for the latest resolved day
     npx tsx scripts/post-daily.ts --day 3         # a specific day of the current season
     npx tsx scripts/post-daily.ts --post          # post it (needs the four X_* keys)

   Reads the season ledger from WORM_DATA_DIR, replays it with the engine — the
   same replay every visitor's browser runs — and builds the text from that.
   Posting uses the X API v2 with OAuth 1.0a user keys from the environment:
   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET. Never commit them.
   Run it from cron at 22:05 UTC. On the boundary test's allowlist.
   --------------------------------------------------------------------------- */

import { clock } from "../app/lib/live/protocol";
import { replaySeason } from "../app/lib/live/season";
import { published } from "../app/lib/live/service";
import { load } from "../app/lib/live/store";
import { standings } from "../app/lib/standings";
import { dailyPost } from "../app/lib/dailypost";
import { SITE } from "../app/lib/launch";
import { oauthHeader } from "./x-oauth";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const now = Date.now();
  const season = Number(arg("season") ?? clock(now).season);
  const days = published(load(season), now);
  if (!days.length) { console.log(`season ${season} has no resolved day yet — nothing to post.`); process.exit(0); }
  const want = arg("day") ? Number(arg("day")) : days[days.length - 1].day;
  const upto = days.filter((d) => d.day <= want);
  const { state, resolved } = replaySeason(season, upto);
  const day = resolved.find((d) => d.day === want);
  if (!day) { console.error(`day ${want} of season ${season} hasn't resolved.`); process.exit(2); }
  const site = SITE ?? "https://worm.example";
  const post = dailyPost({ season, day, standings: standings(state, resolved.map((d) => d.result)), block: upto[upto.length - 1].draw.number, site });
  console.log(post.text + `\n\n(${post.length}/280)`);
  if (post.length > 280) { console.error("too long to post"); process.exit(2); }
  if (!flag("post")) { console.log("\nDry run — add --post to send it."); process.exit(0); }
  if (!SITE) { console.error("config/launch.json has no site URL yet; refusing to post a placeholder link."); process.exit(2); }

  const creds = { consumerKey: process.env.X_API_KEY ?? "", consumerSecret: process.env.X_API_SECRET ?? "", token: process.env.X_ACCESS_TOKEN ?? "", tokenSecret: process.env.X_ACCESS_SECRET ?? "" };
  if (Object.values(creds).some((v) => !v)) { console.error("X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET must all be set."); process.exit(2); }
  const url = "https://api.x.com/2/tweets";
  const r = await fetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url, creds), "content-type": "application/json" }, body: JSON.stringify({ text: post.text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`X answered ${r.status}: ${JSON.stringify(j)}`); process.exit(1); }
  console.log(`posted: https://x.com/i/web/status/${(j as { data?: { id?: string } }).data?.id}`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
