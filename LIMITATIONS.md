# Limitations

What this is not, and what it cannot do. Written because a project that cannot state its own limits
cannot be trusted about anything else.

## The simulation

- **It is a toy economy, not a model of one.** Four rules and a cap, tuned so the run shows growth,
  generations and a squeeze. It is not calibrated to anything and predicts nothing.
- **The "notes inheritance" is a design, not a measurement.** In this engine, inheritance appears only
  as a `generationBonus` multiplier from generation three onward. The research this project draws its
  premise from *measured* an effect of notes on a specific task (see [docs/ARTICLE.md](docs/ARTICLE.md));
  we have not measured anything, and the engine does not claim to.
- **Numbers are floats, rounded at every step.** Rounding is what keeps machines in agreement; it also
  means the balances are not exact decimal money and never will be.
- **Determinism is not fairness.** A run that is identical everywhere is still a run whose rules were
  chosen by one author.

## The boundary

- **No money moves.** No wallet, no chain, no payment rail, no custody. Nothing here can take or send
  anything.
- **Nothing replicates.** No network access, no scanning, no code copied between machines, no weights
  duplicated. "Split" is an array append and a halved number.
- **An agent cannot act.** It has no tools, no key and no way to influence anything outside the tick.
  This is a deliberate inversion of the risk the source research describes.
- **No prompt, model or inference is involved.** The agents are arithmetic, not language models.
  Calling them "AI agents" would be an overstatement, which is why this repository does not.

## Known weaknesses

- **The demo on the pitch page is a second implementation** of the same idea in browser JavaScript.
  Two implementations of one rule set is a drift risk; the engine is the source of truth, and the
  page's toy is labelled as a toy.
- **The safety argument is structural *and* enforced — but only against the obvious.** Every tracked
  source file is scanned on every push for networking, subprocess and environment access, and the
  allowlist of exceptions is empty (`tests/boundary.test.ts`). That catches a `fetch` or a
  `child_process`; it cannot catch an obfuscated one, and it says nothing about what a future
  dependency might do. A dependency-free engine is the second half of that defence, and it is
  asserted too: `sim/engine.ts` imports nothing but its own hash module.
- **No anchoring, no external timestamp, no third party has replayed a run.** Until something outside
  this repository witnesses the output, the guarantee is "the code and the author agree".

## What the operator can still do

- Change the rules — every change that moves a golden is visible in the test diff and in the changelog.
- Choose which seeds are published, and which day's chain head is anchored (once anchoring exists).
- Stop the process. There is nothing else to stop: no money, no chain, no user data.

What the operator cannot do is rewrite a published run without the change being visible in the
repository history — and once anchoring exists, without the chain disagreeing.
