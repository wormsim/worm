# Status

The single page that answers "what exists, what does not, and what is next". Every other document
must agree with this one.

Last reviewed: 2026-10-14 (Outbreak).

## What exists

| Piece | State | Where | Verified by |
| --- | --- | --- | --- |
| Deterministic engine | **Built** | `sim/engine.ts` | `npm run replay -- --seed 20261013 --ticks 340 --check` → IDENTICAL |
| Hash chain over every tick | **Built** (SHA-256) | `sim/hash.ts` | `tests/sim.test.ts` cross-checks SHA-256 against `node:crypto` |
| Pinned goldens | **Built** | `tests/goldens.json` | `npm test` replays them and fails on any drift |
| Replay CLI | **Built** | `scripts/replay.ts` | `npm run replay -- …` |
| CI | **Built** | `.github/workflows/ci.yml` | typecheck + tests + golden replay on every push |
| Public repository and deployed site | **Live** — the repository is public and the site runs on one server, one Node process | `github.com/wormsim/worm`, `https://wormsim.xyz` | open them |
| Boundary enforcement | **Built** | `tests/boundary.test.ts` | `npm test` fails if any tracked file gains network, subprocess or environment access |
| Pitch page | **Built**, states the simulation-only status | `pitch/index.html` | open it |
| Homepage dish (worms) and per-worm pages | **Built** — one page per agent of the pinned run, with a diary generated from sealed events | `app/page.tsx`, `app/worm/[id]`, `app/lib/wormbook.ts` | open `/worm/30`; every diary line carries its tick's record hash |
| Daily dish | **Built** — one seed per UTC day from day 0 (2026-10-13) | `app/lib/daily.ts` | `npm test` (anchors suite) |
| Daily anchor writer and verifier | **Built, not used** — a zero-value memo transaction on Robinhood Chain (chain ID 4663); no anchor wallet exists yet, so nothing has been written | `scripts/anchor.ts`, `scripts/verify-anchor.ts`, `anchors/` | `npm run anchor -- --day <closed day>` prints the exact memo; `npm run verify:anchors` |
| Red vs Blue rules | **Built** — settling, notes inherited at birth, honeypot / quarantine / alert (92/74) / harden, R per day, sealed moves, seed from all commitments, chained ticks | `sim/war.ts`, `sim/warbots.ts` | `npm test` (war suite) |
| Live season (server) | **Built and deployed**, no day played by a player yet — wallet-signed commits (EIP-191), reveals checked against the seal, the seed drawn from the first Robinhood Chain block after 18:00 UTC by binary search, days published in the form the browser replays | `app/lib/live/`, `app/api/live/` | `npm test` (live suite, real signatures, simulated chain); the deployed ledger's day-1 draw |
| Red vs Blue prototype | **Built, single-player** — you against 40 rule-following bots, entirely in the browser; every day re-runs to the same head | `app/play`, `app/components/play` | open `/play`, press RE-RUN |
| Outbreak (real-time roguelite) | **Built** — both sides, 7 days + boss + endless, 32-card draft, house AI that escalates and drafts, badges, daily seed; any run replays from its input record to the same heads | `sim/outbreak.ts`, `sim/outbreak-cards.ts`, `app/components/outbreak/`, `docs/OUTBREAK.md` | `npm test` (outbreak suite); press RE-RUN at the end of a run |
| Outbreak daily board | **Built and deployed, no entries yet** — the server replays every submitted run and ranks by the replay; one Merkle root per day over both sides, a proof per entry; optional wallet signature; anyone can watch any run | `app/lib/board/`, `app/api/runs/`, `scripts/verify-run.ts`, `scripts/anchor-board.ts` | `npm test` (board suite: forged runs refused, proofs verify, signatures bind) |
| Forecast study | **Built** — 1,560 simulated weeks (5 defences × 13 capability years × 24 dishes); setup-failure rule reproduces the paper's 45% → 61–84% curve; all numbers regenerate bit for bit | `app/lib/forecast.ts`, `scripts/forecast.ts`, `/forecast` | `npm test` (forecast suite re-runs two cells) |
| One-step live moves (timelock) | **Built and deployed** — the move is time-locked to the first drand round after 18:00 UTC and the server reveals it; manual reveal stays as a fallback | `app/lib/live/timelock.ts`, `app/lib/live/drand.ts` | `npm test` (timelock suite, offline with our own BLS beacon) |
| Reveal backup code and reminders | **Built** — a `WORM1-` code carrying move, salt and its own seal check; paste it to reveal from any device; an .ics file with every remaining window | `app/lib/live/backup.ts` | `npm test` (backup suite) |
| Season standings and player pages | **Built** — ranked in the browser from the replayed season, nothing stored server-side | `app/lib/standings.ts`, `app/player/[address]` | `npm test` (standings suite) |
| 60-second tutorial | **Built** — five animated cards, opens once on first visit to `/play` | `app/components/play/Tutorial.tsx` | open `/play` in a fresh browser |
| Essay, FAQ, terms, privacy | **Built** — rendered from `docs/` | `/essay`, `/faq`, `/terms`, `/privacy` | open them |
| Daily post | **Built, not used** — post text built from the replayed day; posts with X API v2 when the four `X_*` keys are set | `scripts/post-daily.ts`, `app/lib/dailypost.ts` | `npm run post:daily` prints it; `npm test` checks the OAuth signer against the published example |
| Launch facts | **Single source, all undecided** — rendered as "to be announced" | `config/launch.json`, `app/lib/launch.ts` | read the file |

## What does not exist

Stated so that no reader has to infer it, and so no future commit can quietly imply otherwise:

- **No custody, no payment.** Wallets only sign a readable message that seals a move; the
  signature moves no funds and approves nothing. There is no x402 endpoint, no USDC, and no money
  moves anywhere in the dish.
- **No token, no sale, no airdrop, no date.** Nothing is on offer, and no allocation has been
  decided because nothing has been issued.
- **No live season day has been played by a player yet.** The server is deployed and day 1's draw came
  from a real Robinhood Chain block, but the season ledger holds no commits: nothing has been sealed
  and nothing has been revealed by anyone but the bots.
- **No anchor on chain yet.** The writer is built and tested; there is no anchor wallet, so `anchors/anchors.json` is empty.
- **No payments.** The x402 menu on the site is a list of what will open after launch; nothing can take a payment.
- **No real agents.** An agent is a value in an array inside one process. It cannot act, spend, or
  reach anything.
- **No independent review yet.** Everything here was written and verified by the same author.

## What a daily commitment would look like

Built, **not yet used**: each closed UTC day's chain head goes on Robinhood Chain as a memo, so the
record cannot be edited afterwards — the same pattern the fly project uses, with its own verifier and
its own public list. The writer is `scripts/anchor.ts`, the manifest is
[anchors/anchors.json](../anchors/anchors.json), and it is still empty because no anchor wallet has
been funded. It is described in [DESIGN.md](DESIGN.md) §5.

## How to keep this page true

1. Change the rules in `sim/engine.ts`, not in prose.
2. If a claim here cannot be reproduced by a command in this repository, delete the claim.
3. Every change gets a line in [AUDIT-LOG.md](../AUDIT-LOG.md) with its commit and its verification.
