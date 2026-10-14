/* The safety claim, enforced instead of asserted.
 *
 * This repository says, in several places, that nothing here can reach a network,
 * a key or another machine. Prose cannot hold that line — a future commit can. So
 * this test walks every tracked source file and fails if a capability that could
 * break the boundary appears anywhere outside an explicit allowlist.
 *
 * The allowlist is empty today, on purpose: there is no code in this repository
 * that needs the network. The day something legitimately does (a daily anchor
 * writer, say), it must be added here in the same commit — which makes the change
 * visible in the diff instead of silent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

/** Files allowed to touch the outside world. Keep this list tiny and justified. */
const ALLOWLIST = [
  // The daily anchor writer, its reader, and the memo helper they share. They talk
  // to Robinhood Chain RPC and read the anchor key and RPC URLs from the server's
  // environment. Nothing in sim/ or app/ imports them.
  "scripts/anchor.ts",
  "scripts/verify-anchor.ts",
  "scripts/evm-memo.ts",
  // Writes / checks a day's leaderboard Merkle root on Robinhood Chain.
  "scripts/anchor-board.ts",
  // The live season's server half: the block draw talks to a public Robinhood
  // Chain RPC (WORM_RPC_URL), and the ledger reads its data directory
  // (WORM_DATA_DIR). The engine and the replayer never import either.
  "app/lib/live/chain.ts",
  "app/lib/live/store.ts",
  // Opens time-locked moves at 18:00 UTC with the drand beacon (api.drand.sh, or DRAND_URL),
  // verifying each beacon against the pinned public key.
  "app/lib/live/drand.ts",
  // The leaderboard's files (entries per day, one record per run) in the same data directory.
  "app/lib/board/files.ts",
  // The live season's page in the browser: it calls this site's own /api/live
  // endpoints and nothing else. The practice season makes no requests at all.
  "app/components/play/LiveClient.tsx",
  // The daily post: reads the season ledger, posts to the X API with keys from
  // the environment, run by cron on the server. Its OAuth signer is pure crypto.
  "scripts/post-daily.ts",
  // Outbreak's daily board in the browser: this site's /api/runs only, every answer re-checked.
  "app/components/outbreak/boardClient.ts",
  // A player's season page: one GET to this site's own /api/live, then a replay.
  "app/player/[address]/PlayerClient.tsx"
] as const;

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\brequire\(\s*["'](node:)?(http|https|net|dgram|tls|dns|child_process|worker_threads|cluster|vm)["']\s*\)/, why: "loads a networking or process-spawning module" },
  { pattern: /\bfrom\s+["'](node:)?(http|https|net|dgram|tls|dns|child_process|worker_threads|cluster|vm)["']/, why: "imports a networking or process-spawning module" },
  { pattern: /\bfetch\s*\(/, why: "makes an HTTP request" },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b/, why: "opens a network connection" },
  { pattern: /\bprocess\.env\b/, why: "reads the environment, which is where a key would live" },
  { pattern: /\bexecSync\b|\bspawnSync\b|\bexecFileSync\b/, why: "runs another program" }
];

/**
 * Walk the source tree rather than shelling out to `git ls-files`: this test is not
 * allowed to use a subprocess, and it caught itself doing so the first time it ran —
 * which is the check working, not failing.
 */
function sourceFiles(dir = ".", acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist", "out"].includes(entry)) continue;
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx|mts|js|jsx|mjs|cjs)$/.test(entry)) acc.push(p.replace(/^\.\//, ""));
  }
  return acc;
}
const tracked = sourceFiles();

test("the boundary is enforced: no networking, no keys, no subprocesses", () => {
  const offenders: string[] = [];
  for (const file of tracked) {
    if ((ALLOWLIST as readonly string[]).includes(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const { pattern, why } of FORBIDDEN) {
      const line = source.split("\n").findIndex((l) => pattern.test(l));
      if (line >= 0) offenders.push(`${file}:${line + 1} ${why}`);
    }
  }
  assert.deepEqual(offenders, [], `code that breaks the jar's boundary:\n  ${offenders.join("\n  ")}`);
});

test("the engine and the replayer import no server or network code", () => {
  const pure = tracked.filter((f) => /^sim\//.test(f) || f === "app/lib/live/protocol.ts" || f === "app/lib/live/season.ts");
  const offenders = pure.filter((f) => /from\s+["'][^"']*(live\/(chain|store|service)|scripts\/)/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `pure files that import network or disk code: ${offenders.join(", ")}`);
});

test("nothing the site or the engine runs imports the anchor scripts", () => {
  const offenders = tracked.filter((f) => /^(sim|app)\//.test(f) && /from\s+["'][^"']*scripts\//.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `files that pull network code into the site or the engine: ${offenders.join(", ")}`);
});

test("the engine itself is imports-only: it depends on nothing but its own hash module", () => {
  const engine = readFileSync("sim/engine.ts", "utf8");
  const imports = [...engine.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["./hash"], `sim/engine.ts imports ${JSON.stringify(imports)} — the rules must not acquire a dependency`);
});
