#!/usr/bin/env npx tsx
/* ── scripts/verify-anchor.ts ────────────────────────────────────────────────
   Check the anchors. Two levels, and the second one is the point:

     npx tsx scripts/verify-anchor.ts                   # manifest vs this code
     npx tsx scripts/verify-anchor.ts --chain           # also read each memo back from Robinhood Chain

   Exit 0 means every checked day is IDENTICAL. On the boundary test's allowlist.
   --------------------------------------------------------------------------- */

import { createPublicClient, http } from "viem";
import { memoFromInput, robinhood } from "./evm-memo";
import { ANCHORS, checkManifest, parseMemo } from "../app/lib/anchors";
import { dayOf } from "../app/lib/daily";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const input = arg("day");
  const selected = input ? ANCHORS.filter((a) => a.day === dayOf(input)) : ANCHORS;
  if (!selected.length) { console.log(input ? `no anchor recorded for ${input}.` : "no anchors recorded yet — nothing to verify."); process.exit(0); }
  const pub = createPublicClient({ chain: robinhood, transport: http(process.env.WORM_RPC_URL || robinhood.rpcUrls.default.http[0]) });
  let failures = 0;
  for (const c of checkManifest(selected)) {
    const label = `day ${c.day} · ${c.date}`;
    if (!c.ok) { failures++; console.log(`DIVERGED  ${label}\n  manifest   ${c.chainHash}\n  recomputed ${c.recomputed}\n  problem    ${c.problem}`); continue; }
    console.log(`IDENTICAL ${label}  ${c.chainHash}`);
    if (flag("chain")) {
      try {
        const tx = await pub.getTransaction({ hash: c.tx as `0x${string}` });
        const memo = parseMemo(memoFromInput(tx.input));
        if (!memo || memo.chainHash !== c.chainHash || memo.day !== c.day) { failures++; console.log(`  on-chain   DIVERGED — the memo in ${c.tx} does not match`); }
        else console.log(`  on-chain   IDENTICAL — memo matches (${c.tx.slice(0, 18)}…, from ${tx.from})`);
      } catch (err) { failures++; console.log(`  on-chain   UNREADABLE — ${(err as Error).message}`); }
    }
  }
  console.log(`\n${failures === 0 ? "all checked days replay identically" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
