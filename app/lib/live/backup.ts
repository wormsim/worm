/* ── app/lib/live/backup.ts ──────────────────────────────────────────────────
   Two small things that keep a sealed move from being lost. Pure and browser-safe.

   1. A backup code. After you seal, the move and its salt exist only in your
      browser. Clear storage or switch device and you could not reveal. The code
      packs season, day, address, move and salt into one copyable line; pasting
      it back reveals from anywhere. It carries its own commitment, so a typo or
      a code from another day is caught before anything is sent.
      Anyone holding the code can reveal for you, but only the move you already
      sealed: the server accepts nothing that doesn't hash to your signed seal.

   2. A calendar file (.ics) with a reminder before every 18:00 UTC seal deadline
      left in the season. Reveals happen by themselves (app/lib/live/timelock.ts).
   --------------------------------------------------------------------------- */

import type { Move } from "../../../sim/war";
import { CHAIN, commitmentFor, SEASON_DAYS, windowsOf } from "./protocol";

const PREFIX = "WORM1-";

export interface Backup { season: number; day: number; address: string; move: Move; salt: string; commitment: string }

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export function encodeBackup(b: Backup): string {
  return PREFIX + b64url(JSON.stringify({ v: 1, s: b.season, d: b.day, a: b.address, m: b.move, x: b.salt, c: b.commitment }));
}

/** Decode and check a pasted code. Returns the backup, or a plain-English reason it can't be used. */
export function decodeBackup(code: string, expect?: { season: number; day: number; address: string }): Backup | { error: string } {
  const raw = code.replace(/\s+/g, "");
  if (!raw.startsWith(PREFIX)) return { error: "That isn't a WORM backup code. It starts with WORM1-." };
  let j: { v?: number; s?: number; d?: number; a?: string; m?: Move; x?: string; c?: string };
  try { j = JSON.parse(unb64url(raw.slice(PREFIX.length))); } catch { return { error: "The code is damaged — copy it again in full." }; }
  if (j.v !== 1 || typeof j.s !== "number" || typeof j.d !== "number" || typeof j.a !== "string" || !j.m || typeof j.x !== "string" || typeof j.c !== "string")
    return { error: "The code is damaged — copy it again in full." };
  if (commitmentFor(j.m, j.x) !== j.c) return { error: "The code doesn't match its own seal. It was edited or cut short." };
  const b: Backup = { season: j.s, day: j.d, address: j.a.toLowerCase(), move: j.m, salt: j.x, commitment: j.c };
  if (expect) {
    if (b.address !== expect.address.toLowerCase()) return { error: "This code belongs to a different wallet." };
    if (b.season !== expect.season || b.day !== expect.day) return { error: `This code is for season ${b.season}, day ${b.day}. Today is season ${expect.season}, day ${expect.day}.` };
  }
  return b;
}

const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join("\r\n ");

/** A calendar for the rest of a season: a seal reminder for each remaining day. */
export function seasonIcs(season: number, fromDay: number, site: string, side: "red" | "blue" | null): string {
  const stamp = icsTime(windowsOf(season, Math.max(1, fromDay)).start);
  const who = side === "blue" ? "your tools" : side === "red" ? "your note" : "your move";
  const ev: string[] = [];
  for (let d = Math.max(1, fromDay); d <= SEASON_DAYS; d++) {
    const w = windowsOf(season, d);
    ev.push(
      "BEGIN:VEVENT", `UID:worm-s${season}-d${d}-seal@worm`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(w.commitEnd - 2 * 3600_000)}`, `DTEND:${icsTime(w.commitEnd)}`,
      `SUMMARY:WORM day ${d} — seal ${who} before 18:00 UTC`,
      fold(`DESCRIPTION:Sign and seal today's move. It is time-locked and reveals itself at 18:00 UTC. ${site}/play`),
      `URL:${site}/play`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:WORM — seal closes in 30 minutes", "TRIGGER:PT90M", "END:VALARM",
      "END:VEVENT"
    );
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WORM//live season//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:WORM season ${season}`, ...ev, "END:VCALENDAR", ""].join("\r\n");
}
