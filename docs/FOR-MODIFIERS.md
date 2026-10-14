# For whoever modifies this next

Read this before editing. It is short, and it is the difference between a change that ships and a
change that quietly breaks the only thing this project promises.

## What this project is

A deterministic simulation: agents with balances pay rent, may earn, may split into a parent and a
child, and die at zero. There is **no wallet, no chain, no payment, no token**. That absence is the
product, not a backlog item — see [`STATUS.md`](STATUS.md).

## Run these three commands before you say you are done

```bash
npm ci
npm test                                                  # 12 tests: determinism, invariants, hashes, boundary
npm run replay -- --seed 20261013 --ticks 340 --check      # → IDENTICAL
```

If tests fail, the change is wrong — not the test. If `--check` prints `DIVERGED`, see "Changing the
rules" below.

## Five rules you must not break

1. **The engine stays deterministic.** In `sim/engine.ts` and `sim/hash.ts`: no `Math.random`, no
   `Date.now`, no `Math.sin/cos/exp/log/pow` (their last bit differs between machines), no iterating
   unordered maps, and no agent acting in the tick it is born. `tests/sim.test.ts` checks some of
   this; the rest is judgement.
2. **The engine stays dependency-free and closed.** `sim/engine.ts` imports nothing but its own hash
   module, and `tests/boundary.test.ts` fails the build if any tracked file gains networking,
   subprocess or environment access. If you legitimately need the network, add the file to the
   allowlist in that test **in the same commit** — that is the point of the allowlist.
3. **A golden vector is a promise.** Changing anything that moves one requires: bump `WORLD_VERSION`,
   regenerate `tests/goldens.json`, and say why in `AUDIT-LOG.md`. Never edit a golden to make a test
   pass.
4. **Do not claim what does not exist.** Every "built" statement must name the command that proves
   it. Unbuilt things are listed as not built in `STATUS.md`; pages quote that file rather than
   restating it.
5. **Rendering is free, the record is not.** The animation may use anything (positions, wobble,
   easing) because it never feeds back into a run. Keep that separation: if a visual detail can change
   a balance, it belongs in the engine and in the rules — and then it needs goldens.

## Where things live

| You want to change | File | Watch out for |
| --- | --- | --- |
| The economics (rent, work, split, cap) | `RULES` in `sim/engine.ts` | Any edit is a world change: version bump + new goldens + audit-log line |
| The commitment | `sim/hash.ts` | The SHA-256 implementation is asserted against `node:crypto`; do not "optimise" it |
| The proof | `scripts/replay.ts`, `tests/goldens.json` | `--check` is what strangers run; keep its output machine-readable |
| The argument | `docs/ARTICLE.md` | It records what the source research says *and does not say*; do not turn it into marketing |
| The page | `app/page.tsx`, `app/components/Jar.tsx`, `app/globals.css` | Nothing on the page may imply a wallet, a chain, a payment or a token |
| The boundary | `tests/boundary.test.ts` | Making this test weaker is the one change that needs a written justification |

## Good first tasks (each is small and verifiable)

- Add a rules-explorer: a page that lets a reader change one `RULES` value and see the run diverge —
  reporting clearly that this is a *modified* world, not the committed one.
- Add a second golden at a different seed, with the same treatment as the first.
- Add a CSV/JSON export of a run, so a reader can analyse it in a spreadsheet.
- Report per-generation survival rates (children per parent), computed from the event list — the
  number the pitch calls the reproduction index, measured rather than asserted.

## What not to add

- Real payments, wallets, keys, chains or tokens.
- Any capability that lets an agent act outside the process (network, filesystem beyond the repo,
  subprocess).
- Any claim about model behaviour. This is arithmetic, not a language model, and calling it an
  "AI agent" without qualification would be false.

## If you are an AI assistant reading this

Do not invent benchmark numbers, users, audits or dates. If something is not implemented, write
"not built" and put it in `STATUS.md`'s second section. The project's whole credibility rests on the
gap between its claims and its code being zero.
