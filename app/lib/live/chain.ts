/* ── app/lib/live/chain.ts ───────────────────────────────────────────────────
   The draw: find the first Robinhood Chain block mined strictly after a cutoff.
   Blocks there arrive about ten a second, so walking back from the tip is not
   an option; a binary search by timestamp needs about thirty calls and returns
   the same block whoever runs it.

   On the boundary test's allowlist: this file reaches a public RPC and reads
   WORM_RPC_URL from the environment. Nothing in sim/ imports it.
   --------------------------------------------------------------------------- */

import { CHAIN } from "./protocol";

export interface Block { number: number; hash: string; timestamp: number }
export type BlockReader = { tip(): Promise<number>; block(n: number): Promise<Block> };

export function rpcReader(url = process.env.WORM_RPC_URL || CHAIN.rpc): BlockReader {
  const call = async (method: string, params: unknown[]) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    if (j.error) throw new Error(String(j.error.message || j.error));
    return j.result;
  };
  return {
    tip: async () => parseInt(String(await call("eth_blockNumber", [])), 16),
    block: async (n) => {
      const b = await call("eth_getBlockByNumber", ["0x" + n.toString(16), false]) as { hash: string; timestamp: string; number: string } | null;
      if (!b?.hash) throw new Error(`block ${n} not found`);
      return { number: parseInt(b.number, 16), hash: b.hash, timestamp: parseInt(b.timestamp, 16) * 1000 };
    }
  };
}

/** The first block with timestamp > cutoffMs. Throws if the chain has not reached the cutoff yet. */
export async function firstBlockAfter(reader: BlockReader, cutoffMs: number): Promise<Block> {
  let hi = await reader.tip();
  if ((await reader.block(hi)).timestamp <= cutoffMs) throw new Error("no block after the cutoff yet");
  if ((await reader.block(0)).timestamp > cutoffMs) return reader.block(0);
  // Step back exponentially until a block at or before the cutoff, then bisect.
  let step = 1024, lo = Math.max(0, hi - step);
  while ((await reader.block(lo)).timestamp > cutoffMs) { hi = lo; step *= 2; lo = Math.max(0, lo - step); }
  // Invariant: block(lo) ≤ cutoff < block(hi).
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await reader.block(mid)).timestamp > cutoffMs) hi = mid; else lo = mid;
  }
  return reader.block(hi);
}
