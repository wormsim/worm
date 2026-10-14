# Determinism

Determinism is not a quality goal here, it is the product. A simulation whose output you cannot
recompute is a screenshot; a simulation you can recompute is a commitment. Everything below exists
to make the second thing true, and the honest part is at the end: what would break it.

## The five rules the engine keeps

`sim/engine.ts` is written in a deliberately narrow subset of JavaScript:

1. **One source of variation.** A single seeded generator (`mulberry32`, seeds as 32-bit ints) is
   drawn in a fixed order. There is no `Math.random`, no `Date.now`, no clock anywhere in `sim/`.
2. **Fixed order.** A tick walks the agent array as it stood at the start of the tick, in birth
   order. New agents are appended and cannot act in the tick they were born — otherwise birth order
   would leak into the outcome and two machines could disagree.
3. **Integers and rounded floats only.** Balances are rounded to six decimals after every operation
   (`r6`). There is no transcendental function in the engine: `Math.sin/cos/exp/log/pow` differ in
   their last bit between engines, so they are simply absent.
4. **No iteration over unordered structures.** No `Object.keys` walk feeds a decision; the only
   order is array order.
5. **Canonical hashing.** Records are hashed as canonical JSON — `stableStringify` sorts keys
   recursively — so a record's hash does not depend on field insertion order.

## The chain

Each tick produces a record (`v`, `t`, `alive`, `maxGen`, `births`, `deaths`, `treasury`, `rent`).
The head of tick *t* is `sha256(stableStringify(record))`, and the chain is
`sha256(stableStringify({ p: previousChain, r: head }))`, seeded from `GENESIS` — sixty-four zeros.
One hash at any tick therefore commits to the whole run before it.

SHA-256 is implemented in `sim/hash.ts` in about sixty readable lines rather than taken from
`node:crypto` or `crypto.subtle`. That is not reinvention for its own sake: the two built-ins behave
differently — one is Node-only, one is async and runtime-dependent — and the engine has to produce
byte-identical output in a browser, in Node and in CI. The implementation is asserted against
`node:crypto` in `tests/sim.test.ts`, including an empty string, an emoji and a 1000-character input.

## The observer cannot move the run

`simulate()` accepts an optional observer so the homepage can draw each agent's balance. The observer
is called *after* the record is hashed, and receives copies. `tests/sim.test.ts` proves the contract
by vandalising those copies (`cash = -1` on every agent it is handed) and asserting the chain hash is
unchanged. Drawing is allowed; influencing is not.

## The goldens are the contract

`tests/goldens.json` pins the commitment for a seed and a tick count. Two commands enforce it:

```bash
npm test                                                 # replays every pinned vector
npm run replay -- --seed 20261013 --ticks 340 --check     # → IDENTICAL
```

The pinned head for seed `20261013` over 340 ticks:

```
0a8a5a6b5727073eaddda6bc59cfce156d19ed5aafdf59c620a0090f46d9c02d
```

If `--check` prints `DIVERGED`, one of two things happened: the rules changed without the version
being bumped, or the engine stopped being deterministic. Both are bugs, and neither is fixed by
editing the golden.

## Changing the rules on purpose

`WORLD_VERSION` is part of every hashed record, which makes a version bump a **world change**: every
commitment in the project moves. The order is fixed, and `AUDIT-LOG.md` records each one:

1. change the number in `RULES`,
2. bump `WORLD_VERSION`,
3. regenerate `tests/goldens.json`,
4. regenerate any published head, and say why in `AUDIT-LOG.md`.

This has already happened once, for a rename: entry 17 records moving `mitosis/1` to `worm/1` with no
rule changed, which moved the pinned chain head because the version string is inside the record. It
was done while `anchors/anchors.json` was still empty, so no published commitment was invalidated.

## What would break it

- **A new rule that reads the clock, the locale, the environment or a file.** The boundary test
  catches the network, the subprocess and the environment; it cannot catch a clever one.
- **A dependency inside the engine.** `sim/` has none today, which is half the defence.
- **A floating-point input that was not rounded first.** Rounding is what keeps machines in
  agreement; skipping it in one new rule is enough to move a hash on one machine only.
- **Reaching for `Math` beyond `round`, `max` and `imul`.** The engine uses exactly those three.
- **Deriving a published number by hand instead of reading it.** Not a hash risk, but the same class
  of mistake: it is how `13 TESTS` survived on the homepage long after the suite had 56.

## What determinism does not buy

It does not make the rules fair, correct or interesting. A run that is identical on every machine is
still a run whose numbers were chosen by one author. See [LIMITATIONS.md](../LIMITATIONS.md).
