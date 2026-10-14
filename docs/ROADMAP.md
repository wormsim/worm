# Roadmap — what to build next

This is the development plan for what is designed but **not built**. [`STATUS.md`](STATUS.md)
says what exists today; this file says what comes next, in order, with enough detail to build
each piece and a test that proves it. When a piece ships, move it to STATUS.md and add an
AUDIT-LOG entry.

Written 2026-10-14.

---

## The rules every item below must keep

These come first because every design below is shaped by them. If an item can't be built
without breaking one, the item changes, not the rule.

1. **No bets on a side**, and no payout for picking the winner.
2. **No dividends, no yield, no play-to-earn.** Rewards are names, badges and places on a board.
3. **War-chest tokens are burned.** Never kept, refunded or paid out.
4. **Anything that changes the dish is an input to the replay.** If a token event affects a
   day, it goes into the published day record, so every browser still rebuilds the season
   bit for bit. Nothing reaches the engine except through that record.
5. **Nothing here touches a key in the repository.** Keys live in the server's environment.
6. **The attack side stays abstract.** No real scanning, exploits or infection code, ever.

---

## 0 · Before any of this: go live and prove the parts we couldn't test

These were tested only against simulated networks. They need one real run each after deploy.

| Check | How | Done when |
|---|---|---|
| Robinhood Chain block draw | After 18:00 UTC, `curl /api/live` | `today.draw.number` is set and matches the explorer |
| drand time-lock auto-reveal | Seal a move from a test wallet; wait for 18:00 UTC | The reveal shows `auto: true` in the ledger |
| Daily anchor | `npm run anchor -- --day <yesterday>` dry run, then `--send --write` | `npm run verify:anchors -- --chain` says IDENTICAL |
| Board root anchor | `npm run anchor:board -- --date <yesterday> --send`, then `--check <tx>` | IDENTICAL |
| Daily post | `npm run post:daily`, then `--post` | The post is live; length ≤ 280 |
| Chain parameters | Compare `CHAIN` in `app/lib/live/protocol.ts` with Robinhood Chain's official docs | Chain ID, RPC and explorer confirmed |

Only after the first board root is on chain may marketing say "Merkle root on-chain".

---

## 1 · War chests — burn $AIWORM to unlock a dish-wide move

**The idea.** In the live season, each side can burn $AIWORM during a day's commit window. If a
side's burned total for that day crosses a threshold, it unlocks one dish-wide move for that
day. The burned tokens are gone. Nobody receives them. Burning is open to anyone, not only
players, so a community can rally behind a side without betting on it — there is no payout
for winning.

**The two moves** (each is a rule already in `sim/outbreak.ts`, so it's tested in Outbreak first):

| Side | Move | Effect for that day | Paper link |
|---|---|---|---|
| Worms | **Gossip day** | Worms on one cell copy the richest one's note (the `gossip` rule) | Beyond the paper: notes spread sideways |
| Wardens | **Notify everyone** | An alert on its own cleans 25% instead of 15% (the `notify-all` rule) | The paper's notification result |

**How a burn is counted.**
- A burn is an ERC-20 `Transfer` of $AIWORM from any address to the burn address
  `0x000000000000000000000000000000000000dEaD`. The transaction carries calldata or a memo
  `worm-chest:1|season|day|red` or `…|blue`, so the side is explicit. A burn without a valid
  memo counts for nobody, and it's still burned.
- The window is the same as the commit window: blocks with timestamp in `[00:00, 18:00)` UTC
  of that day. The draw block (first block after 18:00) closes it, so the total is fixed
  before anyone reveals.
- The server reads `Transfer` logs to the burn address over that block range
  (`eth_getLogs`, paged), sums per side, and writes the result into the published day.

**Engine and replay.**
- `PublishedDay` gains `chest: { red: string; blue: string; unlocked: ("gossip" | "notify")[]; fromBlock: number; toBlock: number }`.
  Amounts are decimal strings (token units); `unlocked` is what the engine reads.
- `playDay` in `sim/war.ts` takes `unlocked` and switches the rule on for that day. Bump
  `WAR_VERSION` to `war/2`; keep `war/1` replay for old seasons.
- The browser can re-check the totals itself by reading the same logs. That's an optional
  "VERIFY THE CHEST" button, the same pattern as the board's VERIFY.

**Threshold.** One number in `config/launch.json` (`chest.threshold`), set at launch from the
supply. Start conservative. It applies equally to both sides.

**UI.** A meter per side on the live tab: "Worms 62% to Gossip day", with a link to the burn
transactions on the explorer. Show it after the token exists, never before.

**Tests (must exist before shipping).**
- A day with `unlocked: ["gossip"]` replays to a different head than the same day without it,
  and to the same head every time.
- Log parsing: burns outside the window, to other addresses, with a bad memo, or of another
  token are all ignored. A threshold reached exactly unlocks; one unit short doesn't.
- Both sides can unlock the same day; neither unlocks twice.

**Not allowed.** Refunds if the threshold isn't reached. Any reward to burners. Any odds or
"your side will win" language.

---

## 2 · Trading volume becomes food

**The idea.** The token's on-chain activity feeds the dish. More trading on a day → more food
patches in the next live day. It ties the token to the world without promising anyone money.

**Rule.**
- Volume = sum of $AIWORM `Transfer` amounts over the previous UTC day's block range,
  excluding transfers to or from the burn address and the liquidity pool's own internal moves
  (list the pool address in `config/launch.json`).
- Extra food patches = `clamp(round(log10(1 + volume / unit)), 0, 6)` on top of the base 7.
  `unit` lives in config. Log scale and a cap keep whales from flooding the dish.
- Written into the published day as `food: { volume: string; extraPatches: number; fromBlock; toBlock }`.
  The engine only reads `extraPatches`.

**Tests.** Same volume → same patches; the cap holds; a published day with extra patches
replays identically in the browser.

---

## 3 · Pay a worm — x402 services

Paid features, each one a small service, never a stake in anything. Prices in USDC over
HTTP 402. They're listed on the homepage today as "not open".

| Item | What you get | Changes the dish? |
|---|---|---|
| Drop food | A food patch next to a family you choose, in tomorrow's live dish, labelled with who paid | Yes, as a published input (`paidFood[]`) |
| Name a family | The longest-living family of the week takes a name you choose (moderated) | No; it's a label |
| Sealed-moment card | One famous tick as a card anyone can re-run | No |
| Ask a dead worm | The full diary a worm left, every line linked to its sealed tick | No |

**Build notes.**
- `app/api/x402/<item>` returns 402 with the price and pay-to address until a valid payment
  proof is attached. Verify payment on chain server-side before acting.
- "Drop food" goes through the same published-day record as everything else, capped per day
  and per payer, and shown on the replay with the payer's address.
- Flip `x402.open` in `config/launch.json` only when all four pass their tests.

---

## 4 · Rewards: names, badges, places

- **Season badges** from the live season and Outbreak's daily board, bound to wallets that
  signed their entries (`boardMessage` already exists). Start as an off-chain list with a
  Merkle root anchored daily (same as the board). A soulbound token is optional and later.
- **Hall of names.** Top family per week and top warden per week are written into
  `anchors/` with the week's root.
- **Never** convert badges into tokens or payouts.

---

## 5 · $AIWORM fair launch — checklist

- Venue, contract, supply, team allocation and anchor wallet filled in `config/launch.json`
  (the homepage shows them automatically). The contract address is published there first.
- The homepage's "No token exists" lines flip only when the contract is live.
- War chests (§1) and volume-as-food (§2) ship **after** launch, each behind a config flag.
- Before launch, have someone outside the team read the three rules at the top of this file
  against every page and post.

---

## 6 · Game and growth

| Item | Why | Size |
|---|---|---|
| Sound in trailers | The game's sounds are synthesised live and don't reach screen recordings; render them offline from the event stream | S |
| Outbreak: more synergies between cards | Build variety is the main depth gap | M |
| Outbreak: smarter house wardens per difficulty | Good players win ~85% today | M |
| Live-season "chest" UI | Depends on §1 | S |
| Real-player balance pass | Bots balanced it; people will play differently | after launch |
| Forecast: defenders that improve too | Today only attackers improve with years; a fairer race | M |
| Forecast: sensitivity sweep on the capability knob | So no one quotes "2036" as a date | S |

---

## Order

1. §0 go-live checks → 2. §5 launch checklist → 3. §1 war chests → 4. §2 volume as food →
5. §4 rewards → 6. §3 x402. §6 runs alongside.
