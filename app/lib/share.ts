/* ── app/lib/share.ts ────────────────────────────────────────────────────────
   What a share card says, in one place: the card drawn in the browser, the
   image a link unfurls into on X, and the text of the post all read this.
   A card is a claim made by a player; it always carries what is needed to check
   it (season, day, seed, chain head) and says how.
   --------------------------------------------------------------------------- */

export interface ShareData {
  side: "red" | "blue";
  mode: "practice" | "live";
  season: number;
  day: number;            // the day shared, or 0 for a whole season
  R: number;
  winner: "red" | "blue";
  alive: number;          // red: worms in your family
  gens: number;           // red: generations your family reached
  caught: number;         // blue: worms caught or cleaned
  seed: number;
  head: string;
}

export function headline(d: ShareData): string {
  if (d.side === "red") return d.gens > 1 ? `My family lived ${d.gens} generations.` : `My worms held on: ${d.alive} alive.`;
  return `I caught ${d.caught} worm${d.caught === 1 ? "" : "s"}.`;
}
export function subline(d: ShareData): string {
  const when = d.day ? `Day ${d.day}` : "Season over";
  const verdict = d.winner === "red" ? "the swarm grew" : "the swarm was contained";
  return `${when} · R = ${d.R.toFixed(2)} · ${verdict}`;
}
export function postText(d: ShareData): string {
  const me = d.side === "red" ? "🪱 I played the worm." : "🛡️ I played the warden.";
  return `${me} ${headline(d)}\n${subline(d)}\n\nThey built an AI worm. We made it pay rent. Every tick re-runs in your browser.`;
}

const keys: (keyof ShareData)[] = ["side", "mode", "season", "day", "R", "winner", "alive", "gens", "caught", "seed", "head"];
export function toQuery(d: ShareData): string {
  return keys.map((k) => `${k}=${encodeURIComponent(String(k === "head" ? d.head.slice(0, 16) : d[k]))}`).join("&");
}
export function fromQuery(q: Record<string, string | string[] | undefined>): ShareData | null {
  const g = (k: string) => { const v = q[k]; return Array.isArray(v) ? v[0] : v; };
  const num = (k: string) => { const n = Number(g(k)); return Number.isFinite(n) ? n : 0; };
  const side = g("side") === "blue" ? "blue" : g("side") === "red" ? "red" : null;
  if (!side) return null;
  return {
    side, mode: g("mode") === "live" ? "live" : "practice", season: num("season"), day: num("day"), R: num("R"),
    winner: g("winner") === "red" ? "red" : "blue", alive: num("alive"), gens: num("gens"), caught: num("caught"), seed: num("seed"),
    head: (g("head") ?? "").replace(/[^0-9a-f]/g, "").slice(0, 16)
  };
}
