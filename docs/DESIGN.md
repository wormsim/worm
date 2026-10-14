# Design

The rules, the reason each one is shaped this way, and where the boundary sits. Numbers live in
`RULES` in [`sim/engine.ts`](../sim/engine.ts); this document explains them.

## 1. One tick

Applied to every living agent, in birth order, once per tick:

| Step | Rule | Why this shape |
| --- | --- | --- |
| Rent | `rent × (1 + rentCreep × t)` deducted | Compute is never free, and the pressure has to grow or the jar only ever expands |
| Work | `jobChance` to earn `jobPay` | Income is probabilistic on purpose: a lineage that gets lucky is not the same as one that is viable |
| Death | balance ≤ 0 | The failure state has to be reachable, or nothing above it means anything |
| Split | balance ≥ `2 × birthCost` → parent keeps half, child gets half | A child costs a parent half of what it has; that is the whole economics of reproduction here |

New agents are appended and **cannot act until the next tick**. Without that rule, birth order would
leak into the outcome and two machines could disagree about a run.

## 2. Determinism

The engine uses only `+ − × ÷` and `Math.round`, one seeded PRNG drawn in a fixed order, arrays
iterated in a fixed order, and no clock. This is what lets a run be *committed to* rather than just
reported: the same seed must produce the same bytes on a laptop, in Node, in CI and in a browser.

The corresponding discipline for anyone editing it: a change that can move a golden is a WORLD change
— bump `WORLD_VERSION`, regenerate `tests/goldens.json`, and record why in `AUDIT-LOG.md`.

## 3. The commitment

Each tick produces a record; `recordHash = SHA-256(canonical(record))` and
`chain = SHA-256({p: previousChain, r: recordHash})`, starting from 64 zeros. One head therefore
commits to every tick before it, and any edit to an earlier tick changes the head.

`npm run replay -- --seed … --ticks … --check` recomputes all of that from the seed and compares it
with a value pinned in the tests.

## 4. What the simulation deliberately leaves out

- No model, no prompt, no inference: the agents are arithmetic. Calling them "AI agents" in code or
  docs would be an overstatement.
- No network, no keys, no tool use. An agent cannot act on anything.
- No real money, even in the "simulated wallet" sense of a ledger that later becomes real. The
  balances are numbers in a struct.

## 5. The daily commitment (designed, not built)

Once the simulation is the artefact being shown, each closed day's chain head should be written to a
public chain as a memo — one transaction a day, signed by a dedicated wallet whose address is
published, with a verifier that recomputes the day locally and compares it with the memo. The shape
is known and small; it is listed as **not built** in [`STATUS.md`](STATUS.md) because no wallet
exists and no chain has been chosen.

## 6. Order of work

1. **The simulation, verifiable** (this repository, today).
2. **The daily commitment** — anchoring, verifier, a public list.
3. **Only then**, and only if it can be justified: real balance rails. That step brings identity,
   anti-money-laundering and custody obligations. It is a decision, not a next task, and nothing in
   this repository depends on it happening.

## 7. The inversion

The research this project takes its premise from is about the risk of systems that copy themselves
through a network. This project is the same loop with the dangerous half removed: the population is
capped, the split is performed by the platform, nothing leaves the process, and there is nothing to
escape to. The safety argument is structural, and it is written down in
[`LIMITATIONS.md`](../LIMITATIONS.md) rather than only asserted here.
