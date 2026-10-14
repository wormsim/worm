# Audit log

One line per change that matters: what changed, the commit that carries it, and how a reader checks
it. Newest first.

## 2026-10-13 — L1: a verifiable simulation

| # | Change | Where | Verify |
| --- | --- | --- | --- |
| 1 | Deterministic engine: one seeded PRNG, fixed tick order, integer-only arithmetic, new agents cannot act in the tick they are born | `sim/engine.ts` | `npm test` — the same seed twice must produce identical records, events and chain |
| 2 | SHA-256 in plain JS + canonical JSON, asserted against `node:crypto` string by string | `sim/hash.ts`, `tests/sim.test.ts` | `npm test` — the `node:crypto` cross-check |
| 3 | Hash chain over every tick, so one head commits to the whole history | `sim/engine.ts` | `tests/sim.test.ts` recomputes the chain and shows a different preceding head cannot reproduce it |
| 4 | Invariants under test: no living agent above the cap, positive rent, unique child ids, generations descend by exactly one | `tests/sim.test.ts` | `npm test` |
| 5 | Pinned goldens + a one-command replay that fails on any drift | `tests/goldens.json`, `scripts/replay.ts` | `npm run replay -- --seed 20261013 --ticks 340 --check` → IDENTICAL |
| 6 | CI: typecheck, tests, golden replay, no environment file, no secrets | `.github/workflows/ci.yml` | push, then watch the job |
| 7 | Documents: STATUS (single source of truth), LIMITATIONS, GOVERNANCE, this log, and the source reading | `docs/`, `*.md` | read them; every "built" claim names the command that proves it |
| 8 | Pitch page states simulation-only and lists what does not exist | `pitch/index.html` | open it; `rg -i 'usdc\|x402' pitch/` finds no present-tense claim |
| 9 | **The boundary is enforced by a test, not by prose**: every tracked source file is scanned, and any networking, key-reading or subprocess call fails the build unless the file is added to an explicit allowlist (empty today) | `tests/boundary.test.ts` | `npm test` — the test lists the offending file and line |
| 10 | `simulate()` takes an optional read-only observer so the homepage can draw each agent's balance; it receives copies after the tick is hashed, and a test vandalises those copies to prove the chain cannot move. No rule changed, so `WORLD_VERSION` stays `mitosis/1` and the goldens are untouched | `sim/engine.ts`, `tests/sim.test.ts` | `npm test` — "an observer sees every tick and cannot change the run" |
| 11 | The homepage draws agents as worms in a dish that split in two (fission), at the maintainer's request. `docs/ARTICLE.md` was narrowed to match: the drawing is allowed; calling Mitosis alive or a computer worm is still a red line, and the boundary section says the research is about computer worms and this is not one | `app/components/live.ts`, `app/page.tsx`, `docs/ARTICLE.md` | open the homepage |
| 12 | The public name is now **WORM**, riding the AI-worm news; the homepage opens with that hook and says it is not affiliated with the researchers. The engine id stays `mitosis/1` so every pinned hash still replays; renaming it is a WORLD change and would move the goldens | `app/`, `docs/ARTICLE.md` | `npm test` — goldens unchanged |
| 13 | Red vs Blue rules (`war/1`) and a practice season against 40 bots in the browser; every day re-runs to the same chain head | `sim/war.ts`, `sim/warbots.ts`, `app/play` | `npm test` (war suite); press RE-RUN on `/play` |
| 14 | Live season server: EIP-191 signed commits, reveals checked against the seal, the seed from the first Robinhood Chain block after 18:00 UTC (binary search), days published in the exact form the browser replays. Three files join the boundary allowlist, each with its reason | `app/lib/live`, `app/api/live`, `tests/boundary.test.ts` | `npm test` (live suite: real signatures, simulated chain) |
| 15 | Share cards: drawn in the browser and as the image a shared link unfurls into, carrying season, seed and chain head | `app/lib/share.ts`, `app/s` | open `/s?side=red&…` |
| 16 | Brand kit (avatar, banner, wordmark) and favicon | `media/brand`, `app/icon.svg` | open the files |
| 17 | **World change:** `WORLD_VERSION` is now `worm/1` (was `mitosis/1`). No rule moved; the version string is part of every hashed record, so the pinned chain head changed to `0a8a5a6b…9c02d`. Done before any anchor existed, so no published commitment is affected | `sim/engine.ts`, `tests/goldens.json` | `npm run replay -- --seed 20261013 --ticks 340 --check` → IDENTICAL |

### Not done, and why

| Item | State | Why |
| --- | --- | --- |
| Daily on-chain anchoring of the chain head | **Not built** | Needs a funded wallet and a decision about the chain; the design is in `docs/DESIGN.md` §5 |
| ~~A CI check that asserts the absence of network access~~ | **Built** | `tests/boundary.test.ts` runs on every push; the allowlist is empty, so the whole repository is held to the rule |
| Independent review | **Not done** | Requires a reader who did not write this |
| Any wallet, payment, x402 or token work | **Not started** | Out of scope until the simulation itself is reviewed (see `docs/DESIGN.md` §6) |

## #18 — 2026-10-14 · Anchors move to Robinhood Chain

- Anchors are now a zero-value transaction from the anchor wallet to itself on Robinhood Chain (chain ID 4663), with the memo as calldata. Same memo format (`worm:1|day|date|seed|ticks|chainHash`); the season draws and the anchors now live on one chain.
- `scripts/solana-memo.ts` replaced by `scripts/evm-memo.ts` (viem). `@solana/web3.js` removed. Key variable is `ANCHOR_PRIVATE_KEY`.
- Test: a locally signed anchor transaction parses back to chain 4663, value 0, to-self, the exact memo, and recovers to the anchor address. No anchors existed before the move, so nothing is rewritten.

## #19 — 2026-10-14 · Things a real season needs

- Reveal backup code (`WORM1-…`) and a season calendar (.ics). A move sealed in one browser can now be revealed from another; the code checks its own seal before anything is sent.
- Season standings in both tabs and `/player/[address]`, computed from the replayed season in the browser. No new server state.
- A 60-second tutorial on `/play`.
- `/essay`, `/faq`, `/terms`, `/privacy`, rendered from `docs/`. The privacy page lists exactly what `app/lib/live/store.ts` keeps.
- `scripts/post-daily.ts` for the account's daily result post; added to the boundary allowlist (ledger read, X API, env keys).
- No rule, constant or golden changed.

## #20 — 2026-10-14 · Outbreak, and moves that reveal themselves

- New mode, `outbreak/1` (`sim/outbreak.ts`): the WORM economy in real time. Same determinism rules as the rest of the repository, plus integer headings and a polynomial trig so no engine's `Math.sin` can make two replays differ. Balanced with bot players over many seeds; numbers in `docs/OUTBREAK.md`.
- `/play` opens on Outbreak. The live season and its practice mode are the other two tabs.
- Live season: the browser now also time-locks `{move, salt}` to the first drand quicknet round after 18:00 UTC (`tlock-js` 0.9.0, pinned). The server opens it with the verified beacon and reveals it, only inside the reveal window, only if it hashes to the signed seal. Manual reveal and the backup code remain. Calendar reminders are now seal-only.
- Practice reports now say why a family did badly and suggest one change (`app/lib/recap.ts`). Replays default to ×3.
- No `war/1` rule, constant or golden changed.

## #21 — 2026-10-14 · outbreak/2: the paper's measurement in the engine; a verified board; a forecast

- **Setup can fail** (`O.setup`). A child's setup works with probability 45% in the first generation, rising with each inherited generation towards ~75% — the paper's 45% → 61–84%. Measured back out of 1,000s of simulated setups it lands at 45 / 59 / 67 / 73%. The lead (the player's worm) is exempt.
- **Past the paper, labelled as ours** (`O.forecast`): each endless day is a year; setup 15% faster and 15% fewer failures a year; signatures for defenders from 2027 (also a warden card); gossip — notes copied sideways between worms on one machine — from 2028 (also a worm card); wider target-finding from 2029.
- Version bumped to `outbreak/2`; goldens re-pinned. A pinned golden run per side and a fuzz test (random inputs, both sides) now guard determinism.
- **Daily board**: `POST /api/runs` replays the whole record and ranks by the replay; claimed scores are ignored. A day's entries are committed to by a sorted-pair SHA-256 Merkle root (`app/lib/board/merkle.ts`) that `scripts/anchor-board.ts` can write on Robinhood Chain; every entry gets a proof. Wallets can sign to bind an address. The menu shows the board; VERIFY checks the proof and replays the run in the browser; WATCH plays it back.
- **/forecast**: 1,560 AI-vs-AI weeks. In this model no single defence gets R under one; the full stack (with detection) holds at R ≈ 0.85 in 2026 and stays above one from 2036. Limits are listed on the page.
