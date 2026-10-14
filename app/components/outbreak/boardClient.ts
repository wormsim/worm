/* The browser's side of the daily board: this site's own /api/runs and nothing else.
   On the boundary test's allowlist. Every answer is checked here, not trusted:
   a run's proof against the day's root, and the run itself by replaying it. */

import { judge, type Entry } from "../../lib/board/board";
import { verifyProof } from "../../lib/board/merkle";
import type { RunRecord, Side } from "../../../sim/outbreak";

export interface BoardView { date: string; side: Side; count: number; root: string; entries: Entry[] }
export interface Proof { leaf: string; proof: string[]; root: string; index: number }

const j = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error((b as { error?: string }).error ?? `the server answered ${r.status}`); return b; };

export const fetchBoard = async (date: string, side: Side): Promise<BoardView> => j(await fetch(`/api/runs?date=${date}&side=${side}`, { cache: "no-store" }));
export const fetchRun = async (date: string, id: string): Promise<{ record: RunRecord; entry: Entry; proof: Proof }> => j(await fetch(`/api/runs/${id}?date=${date}`));
export const submit = async (body: { date: string; record: RunRecord; name: string; address?: string; signature?: string }): Promise<{ replayed: { score: number; head: string; days: number }; entry: Entry | null; rank: number | null; proof?: Proof }> =>
  j(await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

/** Check an entry two independent ways, in this browser: its Merkle proof, and a full replay. */
export async function checkEntry(date: string, id: string, root: string) {
  const r = await fetchRun(date, id);
  const proofOk = r.proof.root === root && verifyProof(r.proof.leaf, r.proof.proof, root);
  const v = judge(r.record, date);
  const replayOk = v.ok && v.score === r.entry.score && v.head === r.entry.head;
  return { proofOk, replayOk, record: r.record, entry: r.entry, steps: r.proof.proof.length };
}
