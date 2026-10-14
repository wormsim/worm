# Why WORM

A research team recently published a careful, slightly unnerving piece of work. They asked whether a small open-weight model, running on cheap and badly secured hardware, could copy itself from machine to machine without anyone's help. In a firewalled lab, on fifteen $55 Android TV boxes, the answer was: slowly, clumsily, and yes.

People called it the AI worm. We built a game about it.

This page says why, what in the game comes from the research, and what doesn't. It's the long version of the one-line pitch: **they built an AI worm; we made it pay rent.**

---

## What the research actually found

Three findings matter here. Everything else in WORM is decoration around them.

**Copying is the easy part. Settling in is the hard part.** The researchers set aside how a replicator finds and breaks into a machine, since other work already covers that. They studied the step after: getting a model running on hardware it has never seen, then launching the next copy from there. On the TV boxes that setup took days per hop. The bottleneck wasn't spreading. It was surviving the arrival.

**Notes beat weights.** Each instance, before it timed out, wrote a short plain-text note for the next one: what it tried, what broke, what worked. No retraining, no gradients, just a notebook passed down. With those notes, a 9-billion-parameter model's setup success climbed from **45% in the first generation to 61–84% by the sixth.** The model never got smarter. It got better advice.

**Containment is a number.** The defensive half of the paper is epidemiology. Get each infected machine to infect fewer than one other on average, R below 1, and any outbreak dies out eventually. Their evidence was an old botnet: ISPs that quarantined infected devices *and told their owners* cleaned up **92% in 14 days, against 74% without the notice.** They also recommend honeypots, decoy devices that catch a replicator so you can read what it carries, and fixing insecure defaults so there are fewer easy targets.

The paper doesn't say any model has done this in the wild. It says "signs of life", "may" and "near-term". We keep that caution.

---

## How the paper became rules

WORM is a seven-day season in a sealed dish. Each player picks a side for the whole season.

| In the paper | In the dish |
|---|---|
| A replicator has to keep paying for compute | Every worm pays **rent** every tick, and the rent rises by 12% of its starting level each day |
| Establishing inference on a new host is the slow step | A worm earns only once it **settles**: 2 ticks on soft ground, 5 on hard, and hard pays almost twice as much |
| A copy launches the next copy | A worm that saves enough **splits in two** |
| The notebook passed to the next generation | A Worm player writes a **note** of four choices, and every child inherits it |
| Quarantine | A 3×3 box where rent doubles and 40% of the worms inside are cleaned up at the end of the day |
| Notifying owners: 92% vs 74% | An **alert** over a quarantine lifts clean-up by exactly 92/74. On its own it cleans 15% |
| Honeypots that capture the payload | A **honeypot** catches the first worm that eats it, and shows the Warden that family's note |
| Fixing insecure defaults | **Harden** turns soft ground hard, for good |
| R below one | Each day ends with **R = worms alive at the end ÷ worms alive at the start.** Above 1 the Worms take the day; below 1 the Wardens do |

None of these numbers were tuned to make one side win. They were tuned until a season is a fight, then left alone. The same seed and the same moves always give the same day, to the last bit.

---

## Two ways to play it

**Outbreak** is the fast one: forty seconds a day, in real time. As the Worm you steer the lead worm yourself, burrow to earn, dash through the drone's strike, and after each day draft one card of three while the wardens draft against you. As the Warden you fly the drone and play quarantines and honeypots from an energy bar. It borrows openly from games we love: Plague Inc.'s race, Vampire Survivors' waves and drafts, Into the Breach's telegraphed threats, Balatro's tally.

The **live season** is the slow one: one sealed move a day, real players, seven days.

## Past the paper

The paper ends on a trend line and a question. We built the engine to keep going. Setup can fail in it, with the paper's own odds — 45% for the first generation, climbing as notes are inherited — and when a swarm of thousands of simulated setups is measured back, it lands on the paper's curve. From there we extrapolate, and say so: setup gets easier every year; defenders turn captured notes into signatures; copies on one machine start trading notes sideways. On [/forecast](/forecast) the same engine plays 1,560 weeks of it. In that model, no single defence keeps R under one, and the full stack, with detection, holds in 2026 and slips above one about a decade later. It's a model, not a prophecy — but it's one you can re-run.

## Why notes, and not genes

There's an older game about flies, and WORM borrows its craft from it openly. But flies pass on genes, and the research is about something else. The worms in the paper didn't evolve. Nobody changed their weights. They wrote things down.

That's an odd kind of inheritance. Biologists would call it Lamarckian: what a parent learned in its life goes straight to its child. Nature mostly doesn't allow it. Culture is built on it. A worm in the dish dies with all its luck and timing, but its note goes on, and so does whatever the note got right or wrong.

So the strategy in WORM isn't "be strong". It's "write good advice for someone who will face what you didn't". Wardens get to read those notes when a honeypot springs. Attack and defence learn from the same paper trail.

---

## Why it's on a chain

Two things in a game like this have to be beyond argument: nobody saw your move early, and nobody picked the dice.

So each day runs on **commit and reveal.** You seal your move as a hash, signed by your wallet. The signature moves no funds and approves nothing. The day's randomness is drawn only after every move is sealed, from the first Robinhood Chain block mined after 18:00 UTC, a number no one could know in advance. Then every move is revealed and the day is played. You don't have to come back for that: your browser also time-locks the move to the drand beacon's 18:00 round, so it opens by itself at the moment it's allowed to, and not a second before.

The server publishes the sealed hashes, the revealed moves and the block. Your browser then **replays the whole season itself**, with the same engine, and checks the server's result. If one bit differed, the chain hash at the end of the day would too. Each closed day's hash can also be written to Robinhood Chain as a permanent memo, so the history can't be quietly rewritten later.

That's the part we mean by "real". It's not a story about the technology. It's a check you can run.

---

## Why a token, and what it will never be

We're honest about this: WORM rides a news cycle, and a token is part of how projects like this find their crowd. As of today **no token exists.** When one does, three rules hold without exception:

- **No bets on a side**, and no payout for picking the winner.
- **No dividends, no yield, no play-to-earn.** Rewards are names, badges and places on the board.
- **War-chest tokens are burned.** They are never kept, refunded or paid out.

If a token ever needs one of those rules broken to work, it won't launch.

---

## What WORM is not

It's not a computer worm. It doesn't scan, infect or reach any device, and nothing leaves the dish. It's not alive: the worms are numbers in a deterministic simulation, drawn as worms because that's what the research was called. It isn't affiliated with the paper or its authors. And it doesn't claim that inherited notes help in the dish the way they helped in the lab. The practice tab counts whether they do, season by season, and shows you the curve.

---

## The point, if there is one

The paper's quietest line of thought is that an outbreak of something slow and stupid can still win if it's patient, and that defence is mostly a matter of keeping one number under one. That's hard to feel from a PDF. It's easy to feel when your family of worms is down to two, rent is due, and you're writing them a note you hope is right.

**Pick a side. Write a good note. Keep R under one.** [Play →](/play)
