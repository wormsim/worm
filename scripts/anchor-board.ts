#!/usr/bin/env npx tsx
/* ── scripts/anchor-board.ts ─────────────────────────────────────────────────
   Write a closed day's leaderboard root on Robinhood Chain, or check one.

     npx tsx scripts/anchor-board.ts --date 2026-10-14            # print the memo
     npx tsx scripts/anchor-board.ts --date 2026-10-14 --send     # send it (ANCHOR_PRIVATE_KEY)
     npx tsx scripts/anchor-board.ts --date 2026-10-14 --check 0x… # read a memo back and compare

   Memo: worm-board:1|date|entries|root. The root is a Merkle root over every
   entry (app/lib/board/merkle.ts); /api/runs/<id> hands out each entry's proof.
   On the boundary test's allowlist: RPC and the anchor key from the environment.
   --------------------------------------------------------------------------- */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { boardRoot, utcDate } from "../app/lib/board/board";
import { loadBoard } from "../app/lib/board/files";
import { memoFromInput, memoRequest, robinhood } from "./evm-memo";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const RPC = process.env.WORM_RPC_URL || robinhood.rpcUrls.default.http[0];

async function main() {
  const date = arg("date");
  if (!date) { console.error("usage: --date YYYY-MM-DD [--send | --check <tx>]"); process.exit(2); }
  if (date >= utcDate(Date.now())) { console.error(`${date} hasn't closed yet`); process.exit(2); }
  const entries = loadBoard(date), root = boardRoot(entries);
  const memo = `worm-board:1|${date}|${entries.length}|${root}`;
  console.log(`entries ${entries.length}\nroot    ${root}\nmemo    ${memo}`);
  const pub = createPublicClient({ chain: robinhood, transport: http(RPC) });
  const check = arg("check");
  if (check) {
    const tx = await pub.getTransaction({ hash: check as `0x${string}` });
    const ok = memoFromInput(tx.input) === memo;
    console.log(ok ? "IDENTICAL — the chain holds this board's root" : `DIVERGED — the chain says: ${memoFromInput(tx.input)}`);
    process.exit(ok ? 0 : 1);
  }
  if (!process.argv.includes("--send")) { console.log("\nDry run — add --send to write it."); return; }
  const key = process.env.ANCHOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) { console.error("ANCHOR_PRIVATE_KEY is not set."); process.exit(2); }
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(RPC) });
  const hash = await wallet.sendTransaction(memoRequest(account.address, memo));
  await pub.waitForTransactionReceipt({ hash });
  console.log(`sent    ${hash}\n${robinhood.blockExplorers.default.url}/tx/${hash}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
