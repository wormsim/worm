/* The drand beacon, over HTTP, with signatures verified against the pinned
   public key. Used only by the server to open time-locked moves at 18:00 UTC.
   On the boundary test's allowlist: it talks to api.drand.sh (DRAND_URL). */

import { HttpCachingChain, HttpChainClient, type ChainClient } from "tlock-js";
import { QUICKNET } from "./timelock";

export function drandClient(): ChainClient {
  const url = process.env.DRAND_URL || `https://api.drand.sh/${QUICKNET.hash}`;
  const opts = { disableBeaconVerification: false, noCache: false, chainVerificationParams: { chainHash: QUICKNET.hash, publicKey: QUICKNET.public_key } };
  return new HttpChainClient(new HttpCachingChain(url, opts), opts);
}
