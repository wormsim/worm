#!/usr/bin/env npx tsx
/* ── scripts/anchor.ts ───────────────────────────────────────────────────────
   Write one closed UTC day's chain head on Robinhood Chain, as a memo.

     npx tsx scripts/anchor.ts --day 2026-10-13           # print, send nothing
     npx tsx scripts/anchor.ts --day 0 --send --write     # send and record it in the manifest

   It refuses three things on purpose:
     - anchoring a day that has not closed yet,
     - anchoring a day twice (an anchor is a fact, not a habit),
     - sending without ANCHOR_PRIVATE_KEY (which lives in the server's env, never here).

   On the boundary test's allowlist: it reaches an RPC and reads the environment.
   --------------------------------------------------------------------------- */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { memoFromInput, memoRequest, robinhood } from "./evm-memo";
import { ANCHORS, memoFor, recomputeDay, type Anchor } from "../app/lib/anchors";
import { currentDay, dayOf } from "../app/lib/daily";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const MANIFEST = arg("manifest") || path.join(process.cwd(), "anchors", "anchors.json");
const RPC = process.env.WORM_RPC_URL || robinhood.rpcUrls.default.http[0];

async function main() {
  const input = arg("day");
  if (!input) { console.error("usage: npx tsx scripts/anchor.ts --day <YYYY-MM-DD|day> [--send] [--write]"); process.exit(2); }
  const day = dayOf(input);
  if (day >= currentDay(Date.now())) { console.error(`day ${day} has not closed yet. Wait until 00:00 UTC.`); process.exit(2); }
  const existing: Anchor[] = (() => { try { return (JSON.parse(readFileSync(MANIFEST, "utf8")).anchors ?? []) as Anchor[]; } catch { return ANCHORS; } })();
  const already = existing.find((a) => a.day === day);
  if (already) { console.error(`day ${day} is already anchored (${already.tx}). Anchors are never rewritten.`); process.exit(2); }

  const head = recomputeDay(day);
  const memo = memoFor(day, head.seed, head.ticks, head.chainHash);
  console.log(`day     ${head.day}  (${head.date})\nseed    ${head.seed} · ${head.ticks} ticks · ${head.worldVersion}\nhead    ${head.chainHash}\nmemo    ${memo}\nchain   ${robinhood.name} (${robinhood.id}) via ${RPC}`);
  if (!flag("send")) { console.log("\nDry run — nothing was sent. Add --send to write it on chain."); process.exit(0); }

  const key = process.env.ANCHOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) { console.error("\nANCHOR_PRIVATE_KEY is not set. Refusing to send: the key lives in the server's environment, never in this repository."); process.exit(2); }
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: robinhood, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(RPC) });
  const balance = await pub.getBalance({ address: account.address });
  console.log(`\nwallet  ${account.address} · ${Number(balance) / 1e18} ETH`);
  if (balance === 0n) { console.error("no balance: a memo transaction needs a little ETH for gas."); process.exit(2); }

  const hash = await wallet.sendTransaction(memoRequest(account.address, memo));
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const tx = await pub.getTransaction({ hash });
  if (memoFromInput(tx.input) !== memo || receipt.status !== "success") throw new Error("the confirmed transaction does not carry the memo");
  console.log(`sent    ${hash} (block ${receipt.blockNumber})\nexplorer ${robinhood.blockExplorers.default.url}/tx/${hash}`);

  if (flag("write")) {
    const entry: Anchor = { day, date: head.date, seed: head.seed, ticks: head.ticks, chainHash: head.chainHash, worldVersion: head.worldVersion, tx: hash, chain: "robinhood", anchoredAt: new Date().toISOString() };
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    manifest.anchors.push(entry);
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`recorded in ${MANIFEST} (${manifest.anchors.length} anchors)`);
  } else console.log("not recorded — add --write to append it to anchors/anchors.json");
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
