import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { simulate } from "../../sim/engine";
import { PageHead, SiteFooter, SiteNav } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Pinned runs — WORM",
  description: "The runs whose chain heads are pinned in the repository, with the command that reproduces each one."
};

interface Golden { seed: number; ticks: number; chain: string; note: string }

export default function Runs() {
  const goldens = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "goldens.json"), "utf8")) as Golden[];
  const live = goldens.map((g) => ({ ...g, replay: simulate(g.seed, g.ticks) }));

  return <main className="page">
    <SiteNav />
    <PageHead kicker="EVIDENCE" title="Pinned runs">
      <p>Each row is a chain head pinned in <code>tests/goldens.json</code>. This page recomputes every one of them at build time and compares. If a run stopped replaying, the site would not build. Check it yourself from a checkout with the command in the last column.</p>
    </PageHead>

    <section className="docBody">
      <div className="tableWrap">
        <table className="runsTable">
          <thead><tr><th>Seed</th><th>Ticks</th><th>Chain head (recomputed here)</th><th>Record</th><th>Reproduce</th></tr></thead>
          <tbody>
            {live.map((g) => <tr key={`${g.seed}-${g.ticks}`}>
              <td><code>{g.seed}</code></td>
              <td><code>{g.ticks}</code></td>
              <td style={{ overflowWrap: "anywhere" }}>
                {g.replay.chain === g.chain
                  ? <span className="ok"><code>{g.chain.slice(0, 24)}…</code> IDENTICAL</span>
                  : <span className="bad">DIVERGED — the repository golden disagrees with the engine</span>}
              </td>
              <td>{g.replay.stats.alive} alive · gen {g.replay.stats.maxGen} · {g.replay.stats.births} splits · {g.replay.stats.deaths} deaths</td>
              <td><code>npm run replay -- --seed {g.seed} --ticks {g.ticks} --check</code></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="docNote">{goldens.length} pinned run{goldens.length === 1 ? "" : "s"} · {live[0]?.note ?? ""}. Nothing here is anchored on a chain yet: the writer is built and tested, and stays unused until an anchor wallet is funded — see <Link href="/limitations">Limitations</Link>.</p>
    </section>
    <SiteFooter />
  </main>;
}
