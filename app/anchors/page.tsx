import type { Metadata } from "next";
import Link from "next/link";
import { ANCHORS, explorerUrl, memoFor } from "../lib/anchors";
import { currentDay, runDay } from "../lib/daily";
import { PageHead, SiteFooter, SiteNav } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Daily anchors — WORM",
  description: "One closed UTC day, one dish, one chain head written on chain as a memo. Anyone can recompute it from the code."
};

/* Rebuilt hourly so a new day appears without a deploy; every head is recomputed here from the code. */
export const revalidate = 3600;

export default function AnchorsPage() {
  const today = Math.max(0, currentDay(Date.now()));
  const byDay = new Map(ANCHORS.map((a) => [a.day, a]));
  const days = Array.from({ length: today + 1 }, (_, i) => today - i).map((d) => ({ ...runDay(d), anchor: byDay.get(d) }));

  return <main className="page">
    <SiteNav />
    <PageHead kicker="ANCHORS · ONE DAY, ONE DISH, ONE HEAD ON CHAIN" title={<>A record we<br />can&apos;t edit later.</>}>
      <p>Every UTC day gets its own dish, seeded from the date. When the day closes, the dish&apos;s final chain head is written on Robinhood Chain as a memo. Recompute the day from the code and you get the same hash, or you have caught us.</p>
    </PageHead>
    <section className="docBody">
      <div className="anchorFacts mono">
        <span>{ANCHORS.length} ANCHORED DAY{ANCHORS.length === 1 ? "" : "S"}</span>
        <span>FORMAT worm:1 · SHA-256</span>
        <span>DAY 0 = 2026-10-13</span>
      </div>
      {ANCHORS.length === 0 && <div className="note"><b>No anchor has been written yet.</b> The writer and the verifier are built and tested, but no anchor wallet exists, so nothing has gone on chain. The heads below are computed by this page from the code; the column on the right will hold the transaction once one exists.</div>}
      <div className="tableWrap">
        <table className="runsTable">
          <thead><tr><th>Day</th><th>Seed</th><th>Final head (recomputed here)</th><th>Dish at the end</th><th>On chain</th></tr></thead>
          <tbody>
            {days.map((d) => <tr key={d.day}>
              <td><code>{d.day}</code> · {d.date}</td>
              <td><code>{d.seed}</code></td>
              <td><code>{d.run.chain.slice(0, 20)}…</code></td>
              <td>{d.run.stats.alive} alive · gen {d.run.stats.maxGen} · {d.run.stats.births} splits · {d.run.stats.deaths} deaths</td>
              <td>{d.day === today
                ? <span className="mono">RUNNING · CLOSES 00:00 UTC</span>
                : d.anchor
                  ? <a className="ok" href={explorerUrl(d.anchor.chain, d.anchor.tx)}>{d.anchor.tx.slice(0, 12)}… ↗</a>
                  : <span className="mono">NOT ANCHORED</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <h2 className="docH">The memo, exactly</h2>
      <pre className="cli">{memoFor(days[days.length - 1].day, days[days.length - 1].seed, days[days.length - 1].ticks, days[days.length - 1].run.chain)}</pre>
      <h2 className="docH">Check it yourself</h2>
      <pre className="cli">{`npm run verify:anchors              # recompute every anchored day from the code
npm run verify:anchors -- --chain   # also read each memo back from Robinhood Chain`}</pre>
      <p className="docNote">A date-derived seed is known in advance, so today an anchor proves that the code which produced a day was not changed afterwards. When players&apos; moves enter the dish, the seed will come from a block mined after the moves lock. See <Link href="/limitations">Limitations</Link>.</p>
    </section>
    <SiteFooter />
  </main>;
}
