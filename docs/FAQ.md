# Questions

## The game

**What should I play first?**
**Outbreak**, the first tab on `/play`. It's real time, about five minutes a run, no wallet. You steer the lead worm (or fly the Warden's drone), and after every 40-second day you draft one card of three. The full rules are in `docs/OUTBREAK.md`.

**What is WORM, in one sentence?**
A seven-day Red vs Blue game in a sealed dish: Worms try to spread by paying rent and passing notes to their children, Wardens try to keep R (worms at the end of a day ÷ worms at the start) below one.

**Is it a real computer worm?**
No. Nothing scans, infects or reaches any device. The worms are numbers in a deterministic simulation. The name comes from the research it's based on, which is about AI models copying themselves across cheap hardware.

**Do I need a wallet to play?**
No. The **Practice** tab is a full season against 40 bots, entirely in your browser, with no sign-in and no network requests. You only need a wallet for the **Live season** with real players.

**How long does a season take?**
Practice: about ten minutes. Live: seven real days, one move a day.

**What does a Worm player actually decide?**
Two founder cells on day one, then each day a note of four choices: where to settle (soft, hard or anywhere), when to split (early, when there's enough, or only when rich), whether to eat stray food, and which part of the dish to avoid. Every child inherits the note.

**And a Warden?**
Up to three tools a day, at most one honeypot: a honeypot, a quarantine, an alert, or hardened ground. Each one is a defence from the paper, with the paper's own numbers where it gives them.

**Who wins?**
Each day goes to the Worms if R ≥ 1 and to the Wardens if R < 1. The season tables rank families by worms alive, then deepest generation, and Wardens by worms stopped. They're recomputed from the season in your browser.

**Who are the players with nature names?**
House bots that fill the empty seats so every day is a real fight. Worm bots rewrite their notes after losses, and Warden bots move their tools toward the swarm. Players with wallets are shown by address.

**How does the daily board stop fake scores?**
It never takes your number. You send the whole run — seed, notes, every input that changed, every card — and the server replays it with the same engine. The board shows the replay's score. Each day's board also has one Merkle root that can be written on chain, and every entry gets a proof you can check in your browser with VERIFY.

**What is /forecast?**
The same engine, AI against AI, run forward from where the paper stops: as setup gets easier year by year, which defences still keep R under one? It's a model with its limits listed on the page, not a prediction about the world.

## Fairness

**Can the site see my move before the day is played?**
No. While moves are open, only a hash of your move plus a secret salt leaves your browser. The move itself is revealed only after the day's randomness is fixed.

**Can the site choose the randomness?**
In the live season the seed comes from the first Robinhood Chain block mined after 18:00 UTC, mixed with every sealed hash. That block doesn't exist while moves are open. In practice mode the seed comes from the sealed hashes alone.

**How do I check a day?**
Press **RE-RUN** next to any day in practice, and your browser replays it and compares the chain hash. In the live season the page rebuilds the whole season from the published moves and blocks every time it loads. The numbers you see are your browser's, not the server's.

**What are anchors?**
Once a day has closed, its final chain hash can be written to Robinhood Chain as a memo transaction, so the history can't be edited later. The [anchors page](/anchors) lists them and explains how to check one. None have been written yet.

## The live season

**What does signing do? Is it safe?**
You sign a plain-text message that contains the season, the day, your side, your address and your move's hash. It's a message signature (`personal_sign`), not a transaction: it moves no funds, approves no token and costs no gas. Read it in your wallet before you sign.

**Do I have to come back to reveal?**
No. When you seal, your browser also time-locks the move to the first drand round after 18:00 UTC. drand is a public randomness beacon run by the League of Entropy; a time-locked message can only be opened with that round's signature, which doesn't exist until the round happens. At 18:00 it opens and the server reveals it for you, and accepts it only if it hashes to the seal your wallet signed. Nobody, us included, can open it earlier.

**What if the time-lock fails?**
Reveal by hand between 18:00 and 22:00 UTC with **REVEAL BY HAND**, or paste your backup code from any device. A move that isn't revealed by 22:00 doesn't count, and your family plays that day with the note it already had.

**I sealed on my laptop and I'm on my phone now.**
When you seal, you get a **backup code** (it starts `WORM1-`). Paste it on any device to reveal. Anyone holding the code can reveal for you, but only the exact move you sealed, because nothing else matches your signed hash.

**Can I switch sides?**
Not within a season. A wallet picks its side on its first sealed move and keeps it until the next season.

**What times are the windows?**
Every day, in UTC: moves open 00:00–18:00, the block is drawn at 18:00, reveals run 18:00–22:00, and the day is played at 22:00.

## Token

**Is there a $WORM token?**
Not yet. **No token exists, nothing is on sale, and no airdrop is promised.** Any $WORM you see today isn't ours. Launch facts will appear on the homepage first.

**If there is one, can I bet on a side or earn from playing?**
No. No bets on a side, no payout for picking the winner, no dividends, no yield, no play-to-earn. War-chest tokens are burned.

## Everything else

**Is this affiliated with the researchers?**
No. The premise is drawn from published research on self-replicating models. WORM is independent and implements none of the capability that research describes. Our reading of the paper, with its numbers and caveats, is in `docs/ARTICLE.md`, and what the simulation can't do is on the [limitations page](/limitations).

**Is it open source?**
Yes, MIT licensed. The engine, the bots, the live server and every test are in the repository.

**Where are the rules written down exactly?**
In `sim/war.ts`. The constants at the top are the whole balance sheet.
