/* ── app/lib/live/timelock.ts ────────────────────────────────────────────────
   One-step moves: your sealed move opens itself at 18:00 UTC.

   When you seal, the browser also time-lock encrypts {move, salt} to a drand
   round — the public randomness beacon run by the League of Entropy, a new
   round every 3 seconds. Timelock encryption (identity-based encryption on
   BLS12-381) means the ciphertext can only be opened with that round's
   signature, and the signature does not exist until the network produces it
   at 18:00:0x UTC. Nobody — not you, not the server, not other players — can
   open it early. After it exists, anyone can.

   So the server stores the ciphertext with your seal, and at 18:00 opens it
   and reveals for you. If anything fails, the manual reveal still works.
   The move still has to hash to the commitment your wallet signed.

   No network here: encryption needs only the chain's public key, pinned below.
   Opening needs a beacon, which the caller supplies (app/lib/live/drand.ts).
   --------------------------------------------------------------------------- */

import { Buffer, defaultChainInfo, roundAt, timelockDecrypt, timelockEncrypt, type ChainClient, type ChainInfo } from "tlock-js";
import type { Move } from "../../../sim/war";
import { windowsOf } from "./protocol";

/** drand quicknet (bls-unchained-g1-rfc9380), pinned. */
export const QUICKNET: ChainInfo = defaultChainInfo;

/** A client that knows the chain but cannot fetch anything: enough to encrypt. */
export function offlineClient(info: ChainInfo = QUICKNET, get?: ChainClient["get"]): ChainClient {
  return {
    options: { disableBeaconVerification: !get ? false : true, noCache: true },
    chain: () => ({ baseUrl: "", info: async () => info }),
    latest: async () => { throw new Error("offline"); },
    get: get ?? (async () => { throw new Error("offline: no beacon source"); })
  };
}

/** The first drand round after a day's commit window closes. */
export function revealRound(season: number, day: number, info: ChainInfo = QUICKNET): number {
  return roundAt(windowsOf(season, day).commitEnd, info) + 1;
}

export interface Sealed { move: Move; salt: string }

export async function sealForReveal(payload: Sealed, round: number, client: ChainClient = offlineClient()): Promise<string> {
  return timelockEncrypt(round, Buffer.from(JSON.stringify(payload), "utf8"), client);
}

export async function openSealed(ciphertext: string, client: ChainClient): Promise<Sealed> {
  const log = console.log; console.log = () => undefined;     // the library logs every beacon it fetches
  try {
    const out = JSON.parse((await timelockDecrypt(ciphertext, client)).toString("utf8"));
    if (!out || typeof out.salt !== "string" || !out.move) throw new Error("not a sealed move");
    return out as Sealed;
  } finally { console.log = log; }
}

/** The drand round named inside a ciphertext (the age "tlock" stanza), without opening it. */
export function roundOf(ciphertext: string): number | null {
  try {
    const b64 = ciphertext.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const head = Buffer.from(b64, "base64").toString("latin1");
    const m = /-> tlock (\d+) [0-9a-f]+/.exec(head);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
