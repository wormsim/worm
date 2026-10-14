import type { Metadata } from "next";
import data from "../lib/forecast-data.json";
import { PACKAGES } from "../lib/forecast";
import { Calibration, RByYear } from "../components/ForecastCharts";
import { PageHead, SiteFooter, SiteNav } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Forecast — WORM",
  description: "Where the AI worm paper stops, we run the engine forward: which defences still hold R under one as small models get better at setting up?"
};

type Cell = (typeof data.cells)[number];
const row = (pkg: string) => (data.cells as Cell[]).filter((c) => c.pkg === pkg).sort((a, b) => a.year - b.year);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ForecastPage() {
  const first = (pkg: string) => row(pkg)[0], last = (pkg: string) => row(pkg)[row(pkg).length - 1];
  const singles = ["quarantine", "notify", "honeypot"];
  const neverUnder = singles.every((p) => row(p).every((c) => c.meanR > 1));
  const cross = data.crossovers as Record<string, number | null>;
  const years = row("all").map((c) => c.year);
  const runs = data.cells.length * data.seeds;
  const cal = data.calibration.filter((c) => c.rate !== null);
  return <main className="page">
    <SiteNav />
    <PageHead kicker="BEYOND THE PAPER · A MODEL, NOT A PROPHECY" title={<>Forecast.</>}>
      <p>The paper shows small models can copy themselves across cheap hardware, that setting up is the slow step, that notes passed down make setup work more often, and that defence is a matter of keeping R under one. It stops there. We run the same engine you play, AI against AI, {runs.toLocaleString("en-US")} simulated weeks, to ask the next question: <b>as setup gets easier, which defences still hold?</b></p>
    </PageHead>
    <section className="docBody fc">
      <div className="doc">
        <h2>First, does the engine say what the paper measured?</h2>
        <p>In the engine a child&apos;s setup can fail. The chance it works starts at 45% and rises with every generation of inherited notes, levelling near 75%. That rule is written from the paper&apos;s numbers — but whether a whole swarm, with rent, crowding and defenders, then <i>measures</i> like the paper is a separate question. It does:</p>
      </div>
      <Calibration rows={data.calibration} />
      <div className="doc">
        <p className="muted small">Measured over {cal.reduce((a, c) => a + c.tries, 0).toLocaleString("en-US")} setups in {data.seeds} undefended weeks. Generation 1 is the founders' children. Lines past generation 6 are too thin to show: few get that deep in seven days.</p>

        <h2>Three steps past the paper</h2>
        <p>Every step below is our extrapolation, not a finding of the paper. In Outbreak they switch on in endless mode (day 8 is 2027); here they switch on by year.</p>
        <table>
          <thead><tr><th>From</th><th>Side</th><th>What changes</th><th>Why we expect it</th></tr></thead>
          <tbody>
            <tr><td>every year</td><td>Replicators</td><td>Setup 15% faster, 15% fewer failures</td><td>The paper&apos;s bottleneck is setup, and it puts small models on a capability trend (+13.7 ECI a year).</td></tr>
            <tr><td>2027</td><td>Defenders</td><td>Signatures: a note a honeypot catches is swept 50% more and hunted first</td><td>The paper&apos;s honeypots capture the payload for analysis. Detection is what analysis becomes.</td></tr>
            <tr><td>2028</td><td>Replicators</td><td>Gossip: worms on one machine copy the richest one&apos;s note</td><td>The paper&apos;s notes only go down a line. Copies sharing a host have every reason to share them sideways.</td></tr>
            <tr><td>2029</td><td>Replicators</td><td>Finding targets: food sensed twice as far</td><td>The paper set target-finding aside as already shown elsewhere.</td></tr>
          </tbody>
        </table>

        <h2>Typical R per day, by defence and year</h2>
        <p>Each panel is one defence package, stacked on the one before it: quarantine; then an alert over every quarantine (the paper&apos;s 92/74); then honeypots and signatures; then a detection drone that strikes crawlers in transit. Each point is the geometric mean of daily R over {data.seeds} dishes and seven days. New infections arrive at the rim every morning, as they would from outside.</p>
      </div>
      <RByYear cells={data.cells as Cell[]} packages={PACKAGES.map((p) => ({ ...p }))} crossovers={cross} />
      <div className="doc">
        <h2>What the model says</h2>
        <ul>
          <li><b>{neverUnder ? "No single layer gets R under one, in any year." : "Single layers rarely get R under one."}</b> Quarantine alone: R {first("quarantine").meanR.toFixed(2)} in {years[0]}. Adding the paper&apos;s notification lift moves it to {first("notify").meanR.toFixed(2)}: real, and small. Honeypots with signatures: {first("honeypot").meanR.toFixed(2)}.</li>
          <li><b>Only the full stack holds — and it&apos;s detection that tips it.</b> With the drone, typical R is {first("all").meanR.toFixed(2)} in {years[0]} and the week ends contained in {pct(first("all").held)} of dishes.</li>
          <li><b>Capability erodes the margin.</b> By {years[years.length - 1]} the full stack&apos;s R is {last("all").meanR.toFixed(2)} and it holds in {pct(last("all").held)} of dishes. {cross.all ? <>From <b>{cross.all}</b> on, its typical R never comes back under one in this model.</> : <>Within {years[years.length - 1]} it still hovers near one.</>}</li>
          <li><b>Undefended, the dish fills.</b> With no defence the swarm hits the lid in {pct(first("none").lid)} of weeks already in {years[0]}.</li>
        </ul>
        <p>The shape of the answer is the paper&apos;s own: no tool wins on its own; it&apos;s the product of layers that keeps R under one, and every year of capability takes a little of that margin away. What the model adds is a way to see <i>how much</i>, and to argue about it with numbers anyone can re-run.</p>

        <h2>Limits — read these before quoting a year</h2>
        <ul>
          <li>It&apos;s a game engine, not a network simulator. Machines are cells, compute is rent, time is ticks.</li>
          <li>One capability knob (15% a year) stands in for a whole trend line. Change it and the years move.</li>
          <li>Defenders here don&apos;t improve with time except through signatures. Real defenders would.</li>
          <li>The scripted defender is simple; a better policy could hold longer. The swarm&apos;s notes are simple too.</li>
          <li>Twenty-four dishes per point: differences under about 0.05 in R are noise.</li>
          <li>The years are labels on a model, not dates in the world. We make no claim about when, or whether, any of this happens.</li>
        </ul>

        <h2>Re-run it</h2>
        <pre className="cli">{`npx tsx scripts/forecast.ts            # ${data.cells.length} cells × ${data.seeds} dishes, deterministic\ncat app/lib/forecast-data.json          # what this page draws`}</pre>
        <p className="muted small">Engine {data.engine} · study {data.v} · same seeds, same numbers, on any machine. The study and the game share one engine (<code>sim/outbreak.ts</code>); its tests pin the rules.</p>

        <details className="fcTable"><summary className="mono">ALL {data.cells.length} CELLS AS A TABLE</summary>
          <table><thead><tr><th>Defence</th><th>Year</th><th>Typical R</th><th>Held</th><th>Hit the lid</th><th>Worms at the end</th></tr></thead>
            <tbody>{(data.cells as Cell[]).map((c) => <tr key={c.pkg + c.year}><td>{PACKAGES.find((p) => p.id === c.pkg)!.name}</td><td>{c.year}</td><td>{c.meanR.toFixed(3)}</td><td>{pct(c.held)}</td><td>{pct(c.lid)}</td><td>{c.finalAlive}</td></tr>)}</tbody></table>
        </details>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
