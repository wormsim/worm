/* ── scripts/x-oauth.ts ──────────────────────────────────────────────────────
   OAuth 1.0a request signing (HMAC-SHA1), enough to post as one account with
   the X API v2. No dependency; tested against the published example signature.
   --------------------------------------------------------------------------- */

import { createHmac, randomBytes } from "node:crypto";

export interface XCreds { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string }

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** The Authorization header. `params` are query or form parameters that are part of the signature (a JSON body is not). */
export function oauthHeader(method: string, url: string, creds: XCreds, params: Record<string, string> = {}, nonce = randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000).toString()): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp, oauth_token: creds.token, oauth_version: "1.0"
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all).map((k) => [enc(k), enc(all[k])]).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : 1).map(([k, v]) => `${k}=${v}`).join("&");
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join("&");
  const signature = createHmac("sha1", `${enc(creds.consumerSecret)}&${enc(creds.tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: signature }).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
}
