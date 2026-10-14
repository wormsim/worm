# Glossary

The words this project uses, defined once, so a page can use them without explaining them again.
Where a term is a number, the number lives in `RULES` in [`sim/engine.ts`](../sim/engine.ts) or
`WAR` in [`sim/war.ts`](../sim/war.ts) and is quoted here only to be readable.

## The dish

| Term | What it is |
| --- | --- |
| **Agent** (or **worm**) | A struct in an array inside one process: id, parent, generation, balance, birth tick. It cannot act, spend or reach anything. |
| **Founder** | One of the three agents a run opens with, each at `startCash` (3.5 — below the split threshold on purpose). In Red vs Blue each family starts with two. |
| **Tick** | One application of the four rules to every living agent, in birth order. |
| **Rent** | `rent × (1 + rentCreep × t)` deducted from every living agent, every tick, before anything else. Compute is never free. |
| **Rent creep** | The per-tick multiplier that makes compute dearer as a run goes on, so standing still is not a strategy. |
| **Work** | The tick's coin flip: `jobChance` to earn `jobPay`. |
| **Generation bonus** | The multiplier on job chance from generation 3 up. It is the only thing a child inherits beyond money. |
| **Death** | A balance at or below zero. The lineage loses that agent, and the death stays in the record. |
| **Split** | At twice the birth cost, the parent keeps half its balance and a child takes the other half, one generation deeper. |
| **The lid** | `cap` — the hard ceiling of 42 living agents. The jar has no door, but it does have a lid. |
| **Treasury** | Everything earned by work so far, carried in each tick's record. |
| **Dish** | The whole simulation: the agents, the rules and the lid. |
| **Seed** | The integer that makes a run. A daily dish derives it from the date; a live day derives it from a block and the players' seals. |

## The commitment

| Term | What it is |
| --- | --- |
| **Record** | What a tick writes down: version, tick, alive, max generation, births, deaths, treasury, rent. |
| **Head** | `sha256(canonical(record))` for one tick. |
| **Chain** | `sha256({p: previous chain, r: head})`, starting from sixty-four zeros. One head commits to every tick before it. |
| **Canonical JSON** | `stableStringify`: JSON with keys sorted recursively, so a record's hash does not depend on field order. |
| **Golden** | A pinned commitment (seed plus tick count to chain head) in [`tests/goldens.json`](../tests/goldens.json). `npm test` replays them and fails on any drift. |
| **WORLD change** | A change that moves a golden: a rule, or the version string. It requires bumping `WORLD_VERSION`, regenerating the goldens, and a line in [`AUDIT-LOG.md`](../AUDIT-LOG.md). |
| **Boundary** | The rule that nothing in `sim/` can reach a network, a subprocess or the environment. Enforced, not asserted: [`tests/boundary.test.ts`](../tests/boundary.test.ts). |

## The live season

| Term | What it is |
| --- | --- |
| **Day** | One UTC day. Day 0 is 2026-10-13. |
| **Season** | Seven days. |
| **Side** | Red (the Worm) or blue (the Warden), picked on a wallet's first commit and kept for the season. |
| **Commit** | The sealed half of a move: a wallet signature over the hash of the move and its salt. The move itself is not sent. |
| **Seal** (or **commitment**) | `sha256(canonical({move, salt}))`. |
| **Salt** | The random string that stops a seal from being guessable. |
| **Draw** | The first Robinhood Chain block mined after the 18:00 UTC cutoff. Its hash is the part of the day's seed that could not be known while commits were open. |
| **Reveal** | Publishing the move and its salt. It has to hash back to the seal that is already standing. |
| **Time-lock** | The browser also encrypts the move to the first drand quicknet round after 18:00, so the move opens itself at the cutoff. Nobody can open it early, including the operator. |
| **Resolve** | 22:00 UTC: the day is replayed from its seed, with the revealed moves and the bots. |
| **R** | The day's verdict in Red vs Blue: did the swarm grow (R > 1) or shrink (R < 1)? |
| **Note** | A red move's four values (ground, split, food, avoid). It is the only thing that passes from a parent worm to its child. |
| **Tools** | A blue move's warden actions: honeypot, quarantine, alert, harden. |
| **Alert boost** | `92 / 74` — the source paper's notified versus un-notified clean-up ratio, used to lift clean-up for a day. |
| **Bot** | A rule-following participant that fills a side, so a dish is lively even with few players. |
| **Backup code** | `WORM1-...`: a move, its salt and its own seal check, so a move sealed on a phone can be revealed from a laptop. |

## The record

| Term | What it is |
| --- | --- |
| **Board** | One day's leaderboard. The server replays every submitted run and ranks by the replay, so a claimed score is never taken on trust. |
| **Run record** | The input record of one Outbreak run, stored so anyone can replay it to the same score. |
| **Merkle root** | One hash committing to every entry on a day's board. |
| **Proof** | The sibling hashes that show one entry belongs to a root, without publishing the whole board. |
| **Anchor** | One zero-value Robinhood Chain transaction per closed day, carrying the day's chain head as a memo. |
| **Memo** | The exact string on chain: `worm:1\|day\|date\|seed\|ticks\|chainHash`. |
| **Manifest** | [`anchors/anchors.json`](../anchors/anchors.json) — the anchors that actually confirmed. It is empty: no anchor wallet has been funded. |
| **x402** | The HTTP 402 menu on the site. Not open, and nothing on the site can take a payment. |
