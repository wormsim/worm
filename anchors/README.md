# Anchors

The point of this directory: make "every tick replays" a claim a stranger can check against
something this project cannot edit afterwards — a public chain.

## What an anchor is

Every UTC day gets its own dish (`app/lib/daily.ts`: day 0 is 2026-10-13, the seed is derived from
the date). Once the day is over, the dish's final chain head is written on **Robinhood Chain** (chain ID 4663) as a memo: a zero-value transaction from the anchor wallet to itself whose input is the memo text.

```
worm:1|<day>|<YYYY-MM-DD>|<seed>|<ticks>|<chainHash>
```

One transaction per day, signed by the project's anchor wallet; any explorer shows its input. Anyone can recompute the head
from this repository and compare.

**Honest limit.** A date-derived seed is known in advance, so today an anchor proves one thing: the
code that produced a day's head was not changed afterwards. When players' moves enter the dish, the
seed will come from a block mined after the moves lock, and the anchor will also commit to the moves.

## Status

**No anchor has been written yet.** No anchor wallet exists; `anchors.json` is empty on purpose.

## Write one

```bash
npm run anchor -- --day 2026-10-13                  # prints the memo, sends nothing
npm run anchor -- --day 2026-10-13 --send --write   # sends it and appends it to anchors.json
```

`--send` needs `ANCHOR_PRIVATE_KEY` (a 0x private key holding a little ETH for gas) in the server's environment — never in this
repository. Without it the command refuses to send and says so.

## Check them

```bash
npm run verify:anchors              # recompute every day in the manifest, locally
npm run verify:anchors -- --chain   # also read each memo back from Robinhood Chain
```

These two scripts and `scripts/evm-memo.ts` are the only files on the boundary test's allowlist:
the simulation itself still cannot reach a network.
