/* ── app/lib/launch.ts ───────────────────────────────────────────────────────
   The site's view of config/launch.json. There is exactly one place where a
   chain, a venue, an address or a launch status is written down; pages read it
   from here and never hard-code those facts. Unset facts are {{PLACEHOLDER}}s and
   render as "to be announced".
   --------------------------------------------------------------------------- */

import launch from "../../config/launch.json";

export const isAnnounced = (value: string) => Boolean(value) && !value.startsWith("{{");
export const announced = (value: string) => (isAnnounced(value) ? value : "to be announced");

export const TOKEN = { ...launch.token, live: launch.token.status === "live" } as const;
export const X402 = launch.x402;
/** The public URL, once there is one. Until then the sitemap is empty rather than wrong. */
export const SITE = isAnnounced(launch.site) ? launch.site.replace(/\/$/, "") : null;
export const PRINCIPLES: string[] = launch.principles;

export const TOKEN_RISKS: { title: string; body: string }[] = [
  { title: "NOT A SHARE OF ANYTHING", body: "The token is not equity, not a claim on revenue, not a yield and not a promise of a price." },
  { title: "THE LAUNCHPAD KEEPS ADMIN", body: "A fair launch limits insider allocation; it does not remove the venue's control over fees. Read the venue's own documentation." },
  { title: "IT CAN GO TO ZERO", body: "A token with no team allocation can still go to zero, and a project can still be abandoned. Nothing here is audited as a financial product." },
  { title: "ONE ADDRESS, FROM THIS SITE", body: "The contract address in this section is the only one we publish. A DM, a reply or a \"first buyer\" post is impersonation. We never ask for a private key or seed phrase." }
];
