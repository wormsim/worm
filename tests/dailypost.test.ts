/* The daily post and the OAuth signer it posts with. */

import test from "node:test";
import assert from "node:assert/strict";
import { oauthHeader } from "../scripts/x-oauth";
import { dailyPost } from "../app/lib/dailypost";
import { replaySeason, type PublishedDay } from "../app/lib/live/season";
import { standings } from "../app/lib/standings";

test("OAuth 1.0a signing matches the published example", () => {
  const h = oauthHeader("POST", "https://api.twitter.com/1.1/statuses/update.json",
    { consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
    { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" }, "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});

test("the daily post is built from the replay and fits in one post", () => {
  const days: PublishedDay[] = [1, 2].map((day) => ({ day, moves: [], humanCommitments: [], humans: { red: 0, blue: 0 }, draw: { number: 1000 + day, hash: "0x" + String(day).repeat(64), timestamp: 0 } }));
  const { state, resolved } = replaySeason(0, days);
  const p = dailyPost({ season: 0, day: resolved[1], standings: standings(state, resolved.map((d) => d.result)), block: 1002, site: "https://example.org" });
  assert.ok(p.length <= 280, `${p.length} chars`);
  assert.ok(p.text.includes(`R = ${resolved[1].result.R.toFixed(2)}`));
  assert.ok(p.text.includes("block #1002"));
  assert.ok(p.text.includes(resolved[1].result.head.slice(0, 10)));
  assert.ok(p.text.endsWith("https://example.org/play"));
  console.log("\n" + p.text);
});
