# Outbreak — rules and numbers

Outbreak is the real-time half of WORM: a roguelite on the same economy as the
Red vs Blue day, played live. No wallet, no sign-in; open `/play`. Source of truth:
[`sim/outbreak.ts`](../sim/outbreak.ts) and [`sim/outbreak-cards.ts`](../sim/outbreak-cards.ts).

What we borrowed, openly:

| From | What |
|---|---|
| Plague Inc. | spread against a response that grows with you; one number decides |
| Vampire Survivors | short real-time waves; one card of three after each |
| Into the Breach | every threat is telegraphed before it lands |
| Balatro | the end-of-day tally: chips × mult, climbing every day |
| Fruit Fly World | a lineage that carries something forward; the rival drafts too |

## The loop

```text
write a note → 40 s day (real time) → R = alive at end ÷ alive at start
   → tally → draft 1 of 3 → the other side drafts 1 → next day
seven days, a boss on day 7 ("Patch day"), then endless if you want it
```

Three strikes end a run. A strike is a day with R < 1 as the Worm, or R > 1 as the Warden.

## Worm side

- **You steer the lead worm** (mouse, WASD or drag). Hold **Space** to burrow: you stop,
  settle in that cell, and earn. **Shift** dashes (a short burst; strikes pass through you).
  Hold **E** to rally every crawling worm to you.
- Every worm pays rent each second. Rent is 0.12/s on day 1 and rises 20% of that each day.
- Settled worms earn 0.22/s on soft ground, 0.42/s on hard. Hard ground takes 2.5 s to settle
  into, soft 1 s. The lead earns half again. Crowding: each extra worm in a cell cuts income.
- Food: 0.55 a pellet. Real food grows in patches. **A lone pellet is usually a honeypot.**
- A worm with enough cash (5 / 6.5 / 9, by its note) splits in two and halves its cash.
- **Notes are inherited.** A child carries its parent's note. Your lead carries the note you
  wrote today, so only your lead's line picks up a new note — older lines keep theirs.

## The house wardens (when you play Worm)

- A drone that alternates between hunting your lead and the thickest crowd of crawlers.
  It draws its strike line first (0.8 s), then dashes down it. Settled worms are underground:
  the drone can't touch them. Day 1: it holds fire for 15 seconds.
- Tools through the day, more each day and more the bigger the swarm: quarantines on the
  densest settled ground, honeypots ahead of your lead, alerts over quarantines, hardening.
- **Quarantine**: 3×3 box, 2 s warning, then rent ×2 inside for 11 s; when it ends, 40% of the
  worms inside are cleaned (×92/74 under an alert).
- **Alert**: on its own cleans 15% inside when it ends.
- **Honeypot**: the first worm that eats it is caught, and the wardens read its note — and
  aim their next quarantines at the ground that note prefers.
- **Patch day** (day 7): half again as many tools, and at midday every worm settled on soft
  ground is knocked loose.

## Warden side

- You fly the drone (mouse) and strike with a click or **Space**: a 0.5 s warning, then a dash.
- Tools cost energy (10 max, 8 at dawn, +0.9/s): honeypot 2 · quarantine 4 · alert 3 · harden 2.
  Keys **1–4**, then click to place.
- The house swarm starts with 8 worms; every morning 1 + day new ones arrive at the rim. It
  rewrites its note after a bad day (honeypots → careful, sweeps → hard ground, strikes → anywhere).
- Take it to zero and the run ends early as **Eradicated**, with a bonus for every day left.
  Let it hit 240 and it's an **Outbreak**.

## The draft

17 cards a side, rarity 60 / 30 / 10. Some stack. The other side drafts from its own pool after
every day, and you see what it took. See `sim/outbreak-cards.ts` for every number.

## Scoring

| | chips | mult |
|---|---|---|
| Worm | alive at end + born today | max(0.5, R) × (1 + 0.5 × (day − 1)) |
| Warden | stopped today × 5 | clamp(2 − R, 0.25, 2) × (1 + 0.5 × (day − 1)) |

## Setup can fail — the paper's number

A child's setup works with probability `0.45 + 0.3 × (1 − 0.5^generation)`: 45% for the first
generation, 60% for the second, levelling near 75% — the paper's 45% → 61–84% by generation six.
Your lead always sets up. Each capability year (endless mode) removes 15% of the remaining failures.

## Past the paper (endless mode, labelled as ours)

Day 8 is 2027, day 9 is 2028, and so on. Every year setup gets 15% faster. From 2027 the wardens
turn every note a honeypot catches into a **signature** (worms carrying it are swept 50% more and
hunted first — rewrite your note!). From 2028 **notes go sideways**: worms on one machine copy the
richest one's note. From 2029 worms sense food twice as far. `/forecast` runs the same rules
AI-against-AI across 13 years.

## The daily board

Tick DAILY DISH, finish a run, submit. The server replays the record you send and ranks by its own
replay. Each day's board has one Merkle root; `/api/runs/<id>` returns a run's record and its proof;
`npx tsx scripts/verify-run.ts run.json --date YYYY-MM-DD` re-checks any run offline;
`scripts/anchor-board.ts` writes a closed day's root on Robinhood Chain.

## Why a score can be checked

The run is a pure function of (seed, side, notes, inputs, picks). The engine runs at a fixed 20
ticks a second, headings are integers (1024 to a turn), the trig is a fixed polynomial instead
of `Math.sin`, and every position and balance is rounded to 1e-6. The client records only the
inputs that change. **RE-RUN THE WHOLE RUN** replays the record from scratch and compares the
day heads and the score. Change one input and the head changes (`tests/outbreak.test.ts`).
That's what will let a daily leaderboard accept a score only after replaying it.

## Balance, as tested

`npx tsx` bot players (in the test harness, not shipped) over 16 seeds each:

| Side | Bot | Result |
|---|---|---|
| Worm | forages, settles on hard ground, dodges strikes | wins ~85% |
| Worm | forages, no dodging, eats bait | wins ~55% |
| Warden | crude: strikes crowds, boxes settled groups | wins ~30% |

People play better than these bots on the Warden side and worse on the Worm side; the numbers
will move after real players.
