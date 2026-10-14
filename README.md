<div align="center">
  <h1>WORM</h1>
  <p><strong>They built an AI worm. We made it pay rent — in a jar, on purpose.</strong></p>
  <p>A deterministic simulation of an economy: agents with balances, a rent they must cover, work they may or may not find, a split when they can afford a child, and a death when they cannot.</p>
  <p>
    <a href="STATUS.md"><img src="https://img.shields.io/badge/status-simulation%20only-baff35" alt="simulation only"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
    <img src="https://img.shields.io/badge/engine%20dependencies-0-brightgreen" alt="the engine has no runtime dependencies">
  </p>
</div>

## What is here, and what is not

Read this before anything else. The gap between the two columns is the whole project.

| Exists today, in this repository | Does **not** exist anywhere |
| --- | --- |
| A deterministic engine: `sim/engine.ts` (one seeded PRNG, fixed tick order, integer arithmetic) | Custody or payment — a wallet only signs a message that seals a move, and nothing here can move or approve funds |
| A SHA-256 record hash and hash chain over every tick, recomputable by anyone | x402, USDC, any real money moving |
| 56 tests, run in CI, including golden vectors and a cross-check of SHA-256 against `node:crypto` | An agent that can act outside this process |
| A CLI that replays a seed and prints the commitment: `npm run replay` | A token, a sale, an airdrop, a date |
| A pitch page ([`pitch/index.html`](pitch/index.html)) that states all of the above | An anchor on chain yet — the writer is built and tested, and `anchors/anchors.json` is still empty |

**[docs/STATUS.md](docs/STATUS.md) is the single source of truth.** If this README ever disagrees
with it, STATUS.md is right and the README is a bug.

## Verify it in one command

```bash
npm ci
npm test                                              # 56 tests: determinism, invariants, hashes
npm run replay -- --seed 20261013 --ticks 340 --check  # → IDENTICAL against the pinned golden
```

The `--check` run recomputes the whole run from the seed and compares it with a hash pinned in
`tests/goldens.json`. If it prints `DIVERGED`, either the rules changed without the version being
bumped, or the engine stopped being deterministic. Both are bugs, and neither is fixed by editing
the golden.

## The rules

One tick, applied to every living agent in birth order:

1. **Rent** — `0.45 × (1 + 0.003 × t)` is deducted. Compute is never free, and it gets dearer.
2. **Work** — with probability `0.5` (×1.25 from generation 3 up) the agent earns `1.2`.
3. **Death** — a balance at or below zero ends the agent; the lineage loses that one.
4. **Split** — at `2 × birthCost`, the parent keeps half and a child is created with the other half,
   one generation deeper. The jar has a lid of 42 living agents.

Everything that changes a run lives in the `RULES` object in `sim/engine.ts`. Changing one of those
numbers is a **WORLD change**: bump `WORLD_VERSION`, regenerate the goldens, and say why in
[AUDIT-LOG.md](AUDIT-LOG.md).

## Why the engine looks paranoid

`sim/engine.ts` uses only `+ − × ÷` and `Math.round`; no `Math.random`, no `Date.now`, no
`Math.sin/cos/exp/log/pow` (their last bit differs between machines), no iteration over unordered
structures, and no new agent acting in the tick it was born. That is not style — it is what makes the
printed chain a *commitment* rather than a checksum. See [docs/DESIGN.md](docs/DESIGN.md).

## Repository layout

```text
sim/            the engine: hash.ts (SHA-256 + canonical JSON), engine.ts (the rules)
app/            the site: the dish, /play, /forecast, the live season and its API routes
tests/          56 tests + the pinned goldens
scripts/        replay.ts (the one-command proof), anchor.ts and anchor-board.ts (daily commitments), post-daily.ts
docs/           STATUS, DESIGN, OUTBREAK, ESSAY, FAQ, TERMS, PRIVACY, ARTICLE (the source reading), LIMITATIONS, GOVERNANCE
pitch/          the pitch page, honest about the current state
.github/        CI: typecheck, tests, golden replay
```

## Boundaries

- **No money moves.** The engine connects to nothing; the site reads a public RPC and a public
  randomness beacon, and the anchor wallet writes a zero-value memo that costs only its own gas.
  Nothing here can take a payment.
- **No replication, in any sense of the word.** No network, no scanning, no code copied between
  machines, no model weights duplicated. An agent is a struct in an array.
- **The economics is a toy**, tuned to show growth, generations and a squeeze. It is not a forecast
  and not a market.
- This project is **an independent work** and is not affiliated with, endorsed by, or a reproduction
  of the research it draws its premise from; that reading is filed in [docs/ARTICLE.md](docs/ARTICLE.md)
  with the numbers cited and the things the source does *not* claim.

## License

MIT.
