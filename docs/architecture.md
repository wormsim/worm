# Architecture

What runs where, what depends on what, and the one rule that keeps the site honest: **the engine is
the product, and everything else is a consumer of it.** If a number on a page disagrees with
`sim/engine.ts`, that is a bug — not a preference, and not a tuning exercise.

## The pieces

| Piece | Where | Runs in | Reaches outside? |
| --- | --- | --- | --- |
| The engine | `sim/engine.ts`, `sim/hash.ts` | a browser, Node, CI | **no** |
| The games | `sim/war.ts`, `sim/warbots.ts`, `sim/outbreak.ts` | a browser, Node, CI | **no** |
| The site | `app/` | one Node process, plus the visitor's browser | only the three live-season routes below |
| The live season | `app/lib/live/`, `app/api/live/` | the server | Robinhood Chain RPC, the drand beacon |
| The daily board | `app/lib/board/`, `app/api/runs/` | the server | the data directory only |
| The daily anchors | `scripts/anchor.ts`, `scripts/verify-anchor.ts`, `app/lib/anchors.ts` | cron | Robinhood Chain RPC |
| The daily post | `scripts/post-daily.ts` | cron | the X API |
| The proof | `scripts/replay.ts`, `tests/` | any checkout, CI | **no** |

## The dependency rule

Dependencies point one way: `sim/` → `app/` → `scripts/`. Nothing in `sim/` imports anything but its
own hash module, and nothing in `sim/` can reach a network, a subprocess or the environment.

That is not a convention, it is a test. [`tests/boundary.test.ts`](../tests/boundary.test.ts) walks
every tracked source file and fails the build if a capability that could break the boundary appears
outside a twelve-entry allowlist — the anchor writers and their memo helper, the daily poster, the
live season's chain, store and drand client, the board's files, and the three browser clients that
call this site's own API. Each entry carries its reason beside it, so adding one is visible in the
diff instead of silent.

## One engine, three runtimes

The same module is loaded three times, and the point of the design is that all three agree:

| Runtime | Who runs the engine | Why it matters |
| --- | --- | --- |
| The visitor's browser | the homepage dish, `/play`, `/worm/[id]`, `/player/[address]` | the page can be recomputed by the reader instead of believed |
| The server | `/api/run`, `app/lib/daily.ts`, the live season's resolver | the commitment the server publishes is the one the browser checks |
| CI | `npm test`, `npm run replay -- --check` | a drift fails the build, not the site |

There is no second implementation to keep in step. A page that needs a number imports the engine;
a page that quotes a fact reads it from a file ([`app/page.tsx`](../app/page.tsx) reads
`docs/STATUS.md`, and counts the tests in `tests/` rather than printing a number someone has to
remember to update).

## The process

One Node process, no cluster, no worker pool: `next start -H 127.0.0.1 -p 3230` under a systemd unit
with `ProtectSystem=strict` and `ReadWritePaths` limited to the data directory. Nginx terminates TLS
and forwards `X-Real-IP`. There is no queue, no cron inside the app and no second service to keep in
sync — the cron jobs are three shell entries, and they are listed in the [README](../README.md#deployment).

## What is on disk

Everything the server remembers lives under `WORM_DATA_DIR`, outside the release tree so a deploy
cannot take it with it:

```text
season-<n>.json          the live ledger: sides, commits, reveals, the day's drawn block
board/<YYYY-MM-DD>.json  one day's leaderboard entries
runs/<id>.json           one submitted run's input record, so anyone can replay it
```

Writes are serialised in process and land with a rename, so a crash cannot leave half a file. One
process is assumed; a second one writing the same directory is unsupported, and says so in
`app/lib/live/store.ts`.

## Where the chain enters

Exactly two things touch a chain, and neither can move money:

1. **The draw.** At 18:00 UTC the server reads Robinhood Chain (chain ID 4663) for the first block
   mined after the cutoff, and that block's hash becomes part of the day's seed. It is a read.
2. **The anchors.** `scripts/anchor.ts` writes one zero-value memo per closed day — `worm:1|day|date|seed|ticks|chainHash` —
   signed by a dedicated wallet that only pays its own gas. The verifier recomputes the day locally
   and compares.

Everything else about the chain is a reader: `/anchors` lists the manifest, `/api/live` reports the
draw, and `scripts/verify-anchor.ts` checks a memo back.

## Why the numbers on the site cannot drift silently

| Claim on a page | Where it comes from |
| --- | --- |
| The dish, the chain head, the event log | computed from the engine at build time |
| The test count | counted from `tests/*.test.ts` at build time |
| "What does not exist" | quoted from `docs/STATUS.md` at build time |
| Launch facts (token, venue, contract) | read from `config/launch.json`; undecided values render as "to be announced" |

The pattern is the same in each case: one source, read rather than restated.
