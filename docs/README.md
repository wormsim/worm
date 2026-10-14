# Documentation index

Everything written down about WORM, and — first — which parts describe something that actually runs.

[`STATUS.md`](STATUS.md) is the single source of truth for what exists; this page only routes you to
the right file. The same list, rendered and linked, is on the site at `/docs`.

## The live system

What the deployed site does today.

| Doc | Read it for |
| --- | --- |
| [`STATUS.md`](STATUS.md) | What exists, what does not, what is next — the page every other document must agree with |
| [`architecture.md`](architecture.md) | The system map: what runs where, the one-way dependency rule, what is on disk, where the chain enters |
| [`determinism.md`](determinism.md) | How one seed produces the same bytes, what enforces it, and what would break it |
| [`live-season.md`](live-season.md) | The day in UTC: commit, the block draw, the drand time-lock, reveal, resolve, the board |
| [`DESIGN.md`](DESIGN.md) | Why the engine is written the way it is, and the boundary it keeps |

## The games

Both live on `/play`, and both replay: a run's score is the replay's score, not a claim.

| Doc | Read it for |
| --- | --- |
| [`OUTBREAK.md`](OUTBREAK.md) | The roguelite: the seven days, the draft, the cards, the scoring, the badges |
| [`FOR-MODIFIERS.md`](FOR-MODIFIERS.md) | The rules for changing any of this without breaking the promise |

## Reference

| Doc | Read it for |
| --- | --- |
| [`glossary.md`](glossary.md) | Every word the project uses, defined once: tick, lid, seal, draw, R, anchor |
| [`ROADMAP.md`](ROADMAP.md) | What is designed but not built, in order, and the rules every item has to keep |
| [`../deploy/README.md`](../deploy/README.md) | How it runs on a server: releases, timers, UTC cron, backups, and what is not covered |

## Written, tested, and deliberately unused

The code exists and is tested; nothing here has been switched on, and the site says so.

| Code | Read it for |
| --- | --- |
| `scripts/anchor.ts`, `scripts/verify-anchor.ts` | The daily commitment: one memo per closed day, and the verifier that recomputes it. No anchor wallet is funded, so the list is empty |
| `scripts/post-daily.ts` | The daily post to X, built from the replayed day. It runs in dry-run mode |
| `scripts/anchor-board.ts` | Writing a day's leaderboard root on chain, once there is a reason to |

## On the site rather than here

These are pages rather than files, because they are what a visitor needs before anything else:

- `/essay` — why this exists, and what it refuses to claim (source: `docs/ESSAY.md`)
- `/faq` — the obvious questions, answered plainly (source: `docs/FAQ.md`)
- `/terms` and `/privacy` — what the operator commits to, and what is stored (`docs/TERMS.md`, `docs/PRIVACY.md`)
- `/limitations` and `/governance` — the edges, and who decides what (`LIMITATIONS.md`, `GOVERNANCE.md`)
- `/anchors`, `/runs`, `/forecast` — the public lists and the study, each read from this repository when the page is built

## Records and readings

| Doc | Read it for |
| --- | --- |
| [`../AUDIT-LOG.md`](../AUDIT-LOG.md) | Every world change, in order, with its reason and its verification. Append-only |
| [`ARTICLE.md`](ARTICLE.md) | The reading of the source research, with the numbers cited and the things it does not claim |
| [`legacy/pitch-mitosis.html`](legacy/pitch-mitosis.html) | The earlier pitch, kept so links and history survive. It describes a different project |

## Conventions

- **Docs describe what exists.** A capability with no route, no test and no page belongs under
  "written, tested, and deliberately unused" — never in the present tense beside something live.
- **Numbers carry their source.** If a document quotes a measurement (a chain head, a test count, a
  block number), the file, test or endpoint that produced it is named in the same sentence.
- **Marketing material is not in this repository.** Announcement drafts, outreach lists and dated
  review snapshots would tell a reader exactly which claims are choreography. If a document here ever
  links to one, the link is a bug.
- **The prose is checked.** `npm test` fails if a tracked file gains a capability the boundary does
  not allow, and `npm run replay --check` fails if a published number stops reproducing.
