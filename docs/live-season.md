# The live season

The dish is a simulation. The live season is the same simulation with **people in it**, which means it
needs one thing the dish does not: randomness nobody can predict while the moves are still open.

`app/lib/live/protocol.ts` is the shared half — the browser and the server import the same file, so
the clock and the rules of engagement cannot disagree.

## A day, in UTC

Day 0 is 2026-10-13 and a season is seven days. Every day has three windows:

| Window | Phase | What happens |
| --- | --- | --- |
| 00:00 → 18:00 | **commit** | a player signs and sends only the *hash* of their move, plus a time-lock of the move itself |
| 18:00 | **draw** | the seed's randomness is fixed: the first Robinhood Chain block mined after the cutoff |
| 18:00 → 22:00 | **reveal** | the move and its salt are published and re-hashed against the seal |
| 22:00 | **resolve** | the day is played: revealed moves plus bots, replayed by the server |

A wallet picks a side on its first commit — `red` (the Worm) or `blue` (the Warden) — and keeps it
for the season.

## Commit: a signature that moves nothing

The wallet signs a human-readable message (`commitMessage` in `protocol.ts`), not a transaction:

```text
WORM · Red vs Blue
I seal my move for season 0, day 1.
Side: Worm
Wallet: 0x...
Commitment: <sha256 of the move and its salt>
Rules: war/1 · live/1
This signature moves no funds and approves nothing.
```

The move itself is neither in the message nor in the request. The server stores the commitment, the
signature and the side, and `POST /api/live/commit` refuses anything that does not verify against the
recovered signer. Nothing here can spend, approve or transfer: there is no transaction to sign.

## The draw: a block nobody could know

At 18:00 UTC the server looks for the **first Robinhood Chain block with a timestamp after the
cutoff**. Blocks there arrive roughly ten a second, so walking back from the tip is useless; the
server steps back exponentially and then bisects, about thirty RPC calls in total
(`app/lib/live/chain.ts`). That block hash is the part of the seed that was unknowable while commits
were open.

The day's seed is derived from the block hash **and every committed seal**, sorted, so the players'
own commitments are mixed in:

```text
seed = sha256("war/1|live/1|<season>|<day>|<block hash>|<sorted commitments>")
```

## Reveal: the move opens itself

When a player seals a move, the browser also encrypts `{ move, salt }` to the **first drand quicknet
round after 18:00 UTC** (`app/lib/live/timelock.ts`, using `tlock-js`, against a pinned public key).
At 18:00 the beacon publishes the round and the ciphertext becomes readable — by anyone, with no
player action. The server opens it on its next tick and publishes the move. The honest consequence
is that a player cannot choose to withhold a move, and cannot reveal a different one either: the
opened text has to hash to the commitment already standing.

Two fallbacks exist for things that will happen in practice:

- **Manual reveal.** A player who closed the tab can paste the move and salt during the reveal window.
- **A backup code.** `WORM1-...` carries the move, the salt and its own seal check
  (`app/lib/live/backup.ts`), so a move sealed on a phone can be revealed from a laptop — the thing
  that otherwise breaks the moment someone clears their browser storage. The site also offers an
  `.ics` file with the remaining windows.

## Resolve: the day is played, not claimed

At 22:00 the server replays the day from its seed with the revealed moves, and fills both sides with
bots (`botCounts` keeps a dish lively even with few players). Because the seed came from a block
mined *after* the commits, and every commitment is inside the seed, the outcome was not knowable when
the moves were sealed. It is the same engine the dish uses: the season is a rules layer on top, not a
second implementation.

`/api/live` is the browser's view of all of this — the clock, the phase, your status, and every
published day in the form the browser replays.

## The daily board

Outbreak runs are submitted, and the server **replays each one** before ranking it
(`app/lib/board/`). A claimed score is never taken on trust: the score on the board is the score the
replay produced. One Merkle root per day commits to every entry, and `/api/runs/<id>` hands out that
entry with its proof — so a player can check their place against a root that can be written on chain
without publishing the whole board (`scripts/anchor-board.ts`).

## What is stored, and what is not

On the server, under `WORM_DATA_DIR`: the season ledger (`season-<n>.json` — sides, commits, reveals,
the drawn block), the day's board, and the submitted run records. Nothing else. No email, no account,
no profile: an identity here is a wallet address, and a wallet address is a public key.

Nothing about a live day goes on chain except, optionally, the day's board root — the anchors are a
separate, deliberate act described in [architecture.md](architecture.md).

## Where this stands today

The server is deployed and day 1's draw came from a real block. **No player has sealed a move yet**,
so the ledger holds no commits and no reveals. That is stated on the site too, quoted from
[STATUS.md](STATUS.md) rather than retyped.
