/* ── app/lib/board/files.ts ──────────────────────────────────────────────────
   Where the leaderboard lives on the server: one JSON file per day for the
   entries, one file per run for its record (so anyone can fetch and replay it).
   Same discipline as the live ledger: serialised writes, atomic rename.
   On the boundary test's allowlist (filesystem, via the live data directory).
   --------------------------------------------------------------------------- */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunRecord } from "../../../sim/outbreak";
import { dataDir } from "../live/store";
import type { Entry } from "./board";

const boardFile = (date: string) => path.join(dataDir(), "board", `${date}.json`);
const runFile = (id: string) => path.join(dataDir(), "runs", `${id}.json`);
const write = (file: string, data: unknown) => { mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, file); };

export function loadBoard(date: string): Entry[] { try { return JSON.parse(readFileSync(boardFile(date), "utf8")).entries as Entry[]; } catch { return []; } }
export function loadRun(id: string): RunRecord | null { if (!/^[0-9a-f]{64}$/.test(id)) return null; try { return JSON.parse(readFileSync(runFile(id), "utf8")) as RunRecord; } catch { return null; } }

let queue: Promise<unknown> = Promise.resolve();
export function updateBoard<T>(date: string, fn: (entries: Entry[]) => T): Promise<T> {
  const run = queue.then(() => { const entries = loadBoard(date); const out = fn(entries); write(boardFile(date), { v: "board/1", date, entries }); return out; });
  queue = run.catch(() => undefined);
  return run;
}
export function saveRun(id: string, rec: RunRecord) { write(runFile(id), rec); }
