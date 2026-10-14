/* The reveal backup code and the season calendar. */

import test from "node:test";
import assert from "node:assert/strict";
import { decodeBackup, encodeBackup, seasonIcs } from "../app/lib/live/backup";
import { commitmentFor, windowsOf } from "../app/lib/live/protocol";
import { NOTE_DEFAULT, type Move } from "../sim/war";

const address = "0x1111111111111111111111111111111111111111";
const move: Move = { side: "red", player: address, note: { ...NOTE_DEFAULT }, spawn: [[3, 4], [8, 9]] };
const salt = "ab".repeat(16);
const b = { season: 0, day: 2, address, move, salt, commitment: commitmentFor(move, salt) };

test("a backup code round-trips and reproduces the same seal", () => {
  const code = encodeBackup(b);
  assert.match(code, /^WORM1-[A-Za-z0-9_-]+$/);
  const back = decodeBackup(`  ${code.slice(0, 20)}\n${code.slice(20)} `, { season: 0, day: 2, address: address.toUpperCase().replace("0X", "0x") });
  assert.ok(!("error" in back));
  assert.deepEqual(back, b);
  assert.equal(commitmentFor((back as typeof b).move, (back as typeof b).salt), b.commitment);
});

test("a backup code refuses the wrong wallet, the wrong day, and edits", () => {
  const code = encodeBackup(b);
  assert.match((decodeBackup(code, { season: 0, day: 2, address: "0x" + "2".repeat(40) }) as { error: string }).error, /different wallet/);
  assert.match((decodeBackup(code, { season: 0, day: 3, address }) as { error: string }).error, /day 2/);
  assert.match((decodeBackup("hello") as { error: string }).error, /WORM1-/);
  assert.match((decodeBackup(code.slice(0, -6)) as { error: string }).error, /damaged|seal/);
  const tampered = encodeBackup({ ...b, salt: "cd".repeat(16) });
  assert.match((decodeBackup(tampered) as { error: string }).error, /own seal/);
});

test("the calendar has a seal reminder for every remaining day, in UTC", () => {
  const ics = seasonIcs(0, 5, "https://example.org", "red");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3, "days 5–7");
  const w = windowsOf(0, 5);
  assert.ok(ics.includes(`DTEND:${new Date(w.commitEnd).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`));
  assert.ok(ics.includes("SUMMARY:WORM day 7 — seal your note before 18:00 UTC"));
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75), "lines folded");
});
