# Privacy

*Last updated 2026-10-14.* What this site keeps, and what it doesn't.

## Outbreak and practice mode
Nothing leaves your browser. Outbreak keeps your best scores, wins and badges in `localStorage`. The practice season makes no network requests at all; the repository's boundary test fails the build if it ever tries.

## Live season: what the server stores
For each wallet that plays, in one file per season:

- your **wallet address** and the **side** you chose;
- for each day: your **sealed hash**, the **signature** over it, and when it arrived;
- the **time-locked copy** of your move, which nobody can open before 18:00 UTC;
- after the reveal: your **move** and its **salt**, when they arrived, and whether the time-lock revealed them;
- the **Robinhood Chain block** drawn for each day.

All of it except unrevealed moves is published, because the point of the live season is that anyone can rebuild it. A wallet address is public by nature, and playing ties your moves to it. Use a fresh wallet if you'd rather they weren't linked to your others.

## What we don't keep
No accounts, emails, names or passwords. To open time-locked moves, the server fetches public drand beacons; it sends nothing about you. No cookies. No analytics or tracking scripts. To slow down abuse, the live endpoints count requests per IP address in memory for one minute. That count isn't written to disk or logged by our code. Your host or CDN may keep its own access logs.

## In your browser
The live tab keeps your sealed move and salt in `localStorage`, so you can reveal later. The tutorial remembers that you've seen it. Clearing site data removes both. Keep your backup code if you clear it before revealing.

## Your wallet
We never ask for a transaction or a token approval. We only ask for message signatures, and the message text is shown in your wallet before you sign.

## Questions
Open an issue in the repository.
