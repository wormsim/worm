/* ── scripts/evm-memo.ts ─────────────────────────────────────────────────────
   The Robinhood Chain half of anchoring, shared by the writer and the reader.

   An anchor is a zero-value transaction from the anchor wallet to itself whose
   calldata is the memo's UTF-8 bytes. No contract, no state, nothing to upgrade:
   the transaction *is* the record, and any explorer shows its input.
   --------------------------------------------------------------------------- */

import { defineChain, hexToString, stringToHex, type Hex } from "viem";
import { CHAIN } from "../app/lib/live/protocol";

export const robinhood = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [CHAIN.rpc] } },
  blockExplorers: { default: { name: "Blockscout", url: CHAIN.explorer } }
});

/** The transaction request for a memo: to yourself, nothing sent, the memo as data. */
export const memoRequest = (from: `0x${string}`, memo: string) => ({ to: from, value: 0n, data: stringToHex(memo) as Hex });

/** Read a memo back out of a transaction's input; "" if it is not text. */
export function memoFromInput(input: Hex | undefined): string {
  if (!input || input === "0x") return "";
  try { return hexToString(input); } catch { return ""; }
}
