/* ── app/lib/board/merkle.ts ─────────────────────────────────────────────────
   A Merkle tree over the day's leaderboard, so one 32-byte root — written on
   chain — commits to every entry, and any player can prove their own entry
   against it with a handful of hashes, without trusting this site.

   Pairs are hashed in sorted order (the OpenZeppelin convention), so a proof is
   just the list of siblings: no left/right bits to get wrong. Leaves and inner
   nodes use different prefixes, so a leaf can never pass for a node.
   Pure; SHA-256 from sim/hash.ts.
   --------------------------------------------------------------------------- */

import { sha256Hex, stableStringify } from "../../../sim/hash";

export const leafHash = (data: unknown) => sha256Hex(`worm-leaf|${stableStringify(data)}`);
const node = (a: string, b: string) => sha256Hex(`worm-node|${a < b ? a + b : b + a}`);
export const EMPTY_ROOT = sha256Hex("worm-empty");

/** Every level of the tree, leaves first. An odd node is carried up unchanged. */
function levels(leaves: string[]): string[][] {
  const out = [leaves];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1], next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? node(cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return EMPTY_ROOT;
  const l = levels(leaves);
  return l[l.length - 1][0];
}

export function merkleProof(leaves: string[], index: number): string[] {
  if (index < 0 || index >= leaves.length) throw new Error("no such leaf");
  const proof: string[] = [];
  let i = index;
  for (const level of levels(leaves).slice(0, -1)) {
    const sib = i % 2 === 0 ? i + 1 : i - 1;
    if (sib < level.length) proof.push(level[sib]);
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf: string, proof: string[], root: string): boolean {
  return proof.reduce((h, sib) => node(h, sib), leaf) === root;
}
