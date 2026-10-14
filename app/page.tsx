import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { RULES, simulate, WORLD_VERSION } from "../sim/engine";
import LiveMount from "./components/LiveMount";
import X402Menu from "./components/X402Menu";
import { announced, PRINCIPLES, TOKEN, TOKEN_RISKS } from "./lib/launch";
import { book } from "./lib/wormbook";
import { SiteFooter, SiteNav } from "./components/SiteChrome";
import { CHART, chartPaths, chartX, deepestLine, eventLine, familyTree, generationCounts, milestones, tickLabel } from "./lib/runview";
import { RuleGlyph } from "./components/RuleGlyph";

const GOLDEN_SEED = 20261013;
const GOLDEN_TICKS = 340;
const run = simulate(GOLDEN_SEED, GOLDEN_TICKS);

interface Golden { seed: number; ticks: number; chain: string }

/** STATUS.md is the single source of truth; this page quotes it instead of restating it. */
function statusLines(title: string): string[] {
  const text = readFileSync(path.join(process.cwd(), "docs", "STATUS.md"), "utf8");
  const section = text.split(`## ${title}`)[1]?.split("\n## ")[0] ?? "";
  return section.split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.replace(/^-\s*/, "").replace(/\*\*/g, ""));
}

const STEPS = [
  { g: "rent", k: "01 · RENT", f: `${RULES.rent} × (1 + ${RULES.rentCreep}·t)`, h: "Every agent pays for compute.", p: "Charged first, every tick, to every living agent. It creeps up as the run goes on, so standing still is not an option." },
  { g: "work", k: "02 · WORK", f: `p ${RULES.jobChance} → +${RULES.jobPay}`, h: "Paid work arrives, or it does not.", p: `A coin flip from one seeded generator. From generation three the odds rise ×${RULES.generationBonus}: the only thing a child inherits beyond money.` },
  { g: "die", k: "03 · DIE", f: "balance ≤ 0", h: "Can't cover rent? It ends.", p: "The failure state has to be reachable, or nothing above it means anything. The death is in the record like everything else." },
  { g: "split", k: "04 · SPLIT", f: `balance ≥ ${RULES.birthCost * 2}`, h: "Rich enough? It splits in two.", p: `Like a flatworm, it pinches in the middle and becomes two. The parent keeps half the balance; the child takes the other half, one generation deeper. The dish has a lid at ${RULES.cap}.` }
];

export default function Home() {
  const notBuilt = statusLines("What does not exist");
  const goldens = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "goldens.json"), "utf8")) as Golden[];
  const pinned = goldens.find((g) => g.seed === GOLDEN_SEED && g.ticks === GOLDEN_TICKS);
  const paths = chartPaths(run, GOLDEN_TICKS);
  const line = deepestLine(run);
  const gens = generationCounts(run);
  const maxBorn = Math.max(...gens.map((g) => g.born));
  const marquee = milestones(run, 14);
  const lastRec = run.records[run.records.length - 1];
  const tail = run.records.slice(-3);
  const tree = familyTree(run);
  const wormLives = book().lives;

  return <main className="page">
    <SiteNav home />

    {/* ── hero ───────────────────────────────────────────────────────── */}
    <header className="hero" id="jar">
      <div className="heroCopy">
        <div className="eyebrow"><i />THE AI WORM, IN A JAR · SIMULATION ONLY · SEED {GOLDEN_SEED}</div>
        <h1>They built<br />an AI worm.<br /><em>We made it<br />pay rent.</em></h1>
        <p className="lede">This week, researchers showed small AI models copying themselves from machine to machine, like a worm. WORM is the version that can&apos;t get out: worms in a sealed dish that pay rent for compute every tick, split in two when they can afford a child, and die when they can&apos;t. No real money moves, nothing leaves the dish, and every tick is hashed so your browser can replay it.</p>
        <p className="slogan">Rent is due every tick.<br /><em>Nobody gets a bailout.</em></p>
        <div className="heroActions">
          <a className="primary" href="#loop">HOW IT WORKS <span>↓</span></a>
          <Link className="secondary" href="/play">PLAY OUTBREAK <span>→</span></Link>
        </div>
        <p className="fine">{run.stats.alive} worms alive at {tickLabel(GOLDEN_TICKS)} · generation {run.stats.maxGen} · {run.stats.births} splits · {run.stats.deaths} deaths · not affiliated with the researchers</p>
      </div>

      <div className="stage" data-live="jar" data-seed={GOLDEN_SEED} data-ticks={GOLDEN_TICKS}>
        <div className="stageTop">
          <span className="mono">THE JAR · SEED <b data-out="seed">{GOLDEN_SEED}</b></span>
          <span className="liveDot"><i /><span data-out="sealing">RUN SEALED</span></span>
        </div>
        <div className="dish"><canvas id="jarCanvas" aria-label="The simulated population, drawn as worms crawling in a dish. Hover a worm for its balance; tap it to trace its family." /></div>
        <div className="cellTip" data-out="tip" aria-live="polite" />
        <div className="transport">
          <button type="button" className="tBtn" data-act="play" aria-label="Replay from the start">↺</button>
          <div className="scrubWrap">
            <input id="jarScrub" className="scrub" type="range" min={0} max={GOLDEN_TICKS} defaultValue={GOLDEN_TICKS} aria-label="Scrub through the run" />
            <div className="scrubMarks" aria-hidden="true">
              {paths.splits.map((t) => <i key={`s${t}`} className="split" style={{ left: `${(t / GOLDEN_TICKS) * 100}%` }} />)}
              {paths.deaths.map((t) => <i key={`d${t}`} className="death" style={{ left: `${(t / GOLDEN_TICKS) * 100}%` }} />)}
            </div>
          </div>
          <span className="mono tickOut" data-out="tick">{tickLabel(GOLDEN_TICKS)}</span>
          <button type="button" className="tBtn" data-act="speed" aria-label="Playback speed">1×</button>
        </div>
        <div className="legend mono">
          <span><i className="lg dapi" />alive · bright gut = balance</span>
          <span><i className="lg spindle" />splitting in two</span>
          <span><i className="lg amber" />one rent from the end</span>
        </div>
        <div className="stats">
          <div><span>Alive</span><b data-out="alive">{lastRec.alive}</b><span className="bar"><i data-out="fill" style={{ width: `${(lastRec.alive / RULES.cap) * 100}%` }} /></span></div>
          <div><span>Generation</span><b data-out="gen">{lastRec.maxGen}</b></div>
          <div><span>Rent / tick</span><b data-out="rent">{lastRec.rent.toFixed(3)}</b></div>
          <div><span>Earned</span><b data-out="treasury">{lastRec.treasury.toFixed(1)}</b></div>
          <div className="wide"><span data-out="chainT">CHAIN @ {tickLabel(lastRec.t)}</span><b className="hash" data-out="chain">{run.chain}</b></div>
        </div>
        <div className="controls">
          <button type="button" className="chip" data-act="replay">↺ SEED {GOLDEN_SEED}</button>
          <button type="button" className="chip" data-act="seed">⚄ NEW SEED</button>
          <span className="verdict ok" data-out="verdict">{pinned?.chain === run.chain ? "✓ IDENTICAL TO THE PINNED GOLDEN" : "✕ DIVERGED — FILE A BUG"}</span>
        </div>
      </div>
    </header>

    <div className="ticker" aria-label="Milestones of the pinned run">
      <div className="tickerTrack">
        {[0, 1].map((copy) => <span className="tickerSet" key={copy} aria-hidden={copy === 1}>
          {marquee.map((m) => <span className={`tk ${m.k}`} key={m.text}><i />{m.text}</span>)}
        </span>)}
      </div>
    </div>

    {/* ── the loop ───────────────────────────────────────────────────── */}
    <section className="section" id="loop">
      <div className="sectionHead">
        <div><label>THE LOOP · FOUR RULES, ALWAYS IN THIS ORDER</label><h2>No boss.<br /><em>Just rent.</em></h2></div>
        <p>Every number lives in one <code>RULES</code> object in <code>sim/engine.ts</code>. Agents act in birth order, a child cannot act in the tick it was born, and the only randomness is one seeded generator. Change a number and the hashes move.</p>
      </div>
      <ol className="steps">
        {STEPS.map((s) => <li key={s.k}><div className="stepTop"><span className="mono k">{s.k}</span><RuleGlyph kind={s.g as "rent" | "work" | "die" | "split"} /></div><b className="formula">{s.f}</b><h3>{s.h}</h3><p>{s.p}</p></li>)}
      </ol>

      <div className="instrument">
        <div className="instrumentHead">
          <span className="mono">POPULATION AND RENT · <span data-out="chartSeed">SEED {GOLDEN_SEED}</span></span>
          <span className="mono keys"><i className="lg dapi" />alive <i className="lg amberLine" />rent <i className="lg spindle" />split <i className="lg amber" />death</span>
        </div>
        <div className="instrumentBody">
          <div className="chartWrap">
            <svg className="chart" viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={`Alive agents and rent per tick over ${GOLDEN_TICKS} ticks`}>
              <defs>
                <clipPath id="chartReveal"><rect data-chart="reveal" x="0" y="0" width={CHART.w} height={CHART.h} /></clipPath>
                <linearGradient id="aliveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--dapi)" stopOpacity=".32" /><stop offset="1" stopColor="var(--dapi)" stopOpacity="0" /></linearGradient>
              </defs>
              {[0, 21, 42].map((n) => <g key={n}>
                <line className="grid" x1={CHART.left} x2={CHART.w - CHART.right} y1={paths.yAlive(n)} y2={paths.yAlive(n)} />
                <text className="axis" x={CHART.left - 6} y={paths.yAlive(n) + 3} textAnchor="end">{n}</text>
              </g>)}
              {[0.5, 1].map((r) => <text key={r} className="axis rentAxis" x={CHART.w - CHART.right + 6} y={paths.yRent(r) + 3}>{r.toFixed(1)}</text>)}
              {[0, 85, 170, 255, 340].map((t) => <text key={t} className="axis" x={chartX(t, GOLDEN_TICKS)} y={CHART.h - 2} textAnchor="middle">{t}</text>)}
              <g clipPath="url(#chartReveal)">
              <path data-chart="area" d={paths.area} fill="url(#aliveFill)" />
              <path data-chart="line" d={paths.line} className="aliveLine" />
              <path data-chart="rent" d={paths.rent} className="rentLine" />
              <g data-chart="marks">
                {paths.splits.map((t) => <line key={`s${t}`} className="mk split" x1={chartX(t, GOLDEN_TICKS)} x2={chartX(t, GOLDEN_TICKS)} y1={paths.base + 4} y2={paths.base + 9} />)}
                {paths.deaths.map((t) => <line key={`d${t}`} className="mk death" x1={chartX(t, GOLDEN_TICKS)} x2={chartX(t, GOLDEN_TICKS)} y1={paths.base + 10} y2={paths.base + 15} />)}
              </g>
              </g>
              <line data-chart="playhead" className="playhead" x1={chartX(GOLDEN_TICKS, GOLDEN_TICKS)} x2={chartX(GOLDEN_TICKS, GOLDEN_TICKS)} y1={CHART.top} y2={paths.base} />
              <circle data-chart="dot" className="playDot" cx={chartX(GOLDEN_TICKS, GOLDEN_TICKS)} cy={paths.yAlive(lastRec.alive)} r="3.5" />
            </svg>
            <p className="chartNote mono">Left axis: agents alive (the lid is {RULES.cap}). Right axis: rent per tick. Ticks below the line mark splits and deaths. Click anywhere on the chart to jump the jar to that tick.</p>
          </div>
          <div className="logBox">
            <span className="mono">EVENT LOG · AS IT HAPPENS</span>
            <ul className="log" data-out="log">
              {run.events.slice(-7).reverse().map((e) => <li key={`${e.kind}${e.id}${e.t}`} className={`ev ${e.kind}`}>
                {eventLine(e).text}
              </li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>

    {/* ── replay ─────────────────────────────────────────────────────── */}
    <section className="section replay" id="replay">
      <div className="sectionHead">
        <div><label>EVERY TICK IS SEALED</label><h2>The worms are decoration.<br /><em>The hashes are not.</em></h2></div>
        <p>Same rules plus the same seed gives the same bytes on any machine. Each tick&apos;s record is hashed with SHA-256 and chained to the one before, so the last hash commits to the whole run. Type a seed and your browser replays it from nothing.</p>
      </div>

      <form className="verify" id="verifyForm" noValidate>
        <div className="verifyInputs">
          <label htmlFor="vSeed">SEED<input id="vSeed" name="seed" inputMode="numeric" defaultValue={GOLDEN_SEED} /></label>
          <label htmlFor="vTicks">TICKS<input id="vTicks" name="ticks" inputMode="numeric" defaultValue={GOLDEN_TICKS} /></label>
          <button className="primary" type="submit">REPLAY IN MY BROWSER <span>→</span></button>
        </div>
        <div className="verifyOut">
          <div><span className="mono">PINNED IN THE REPOSITORY</span><b className="hash" data-v="pinned">{pinned?.chain ?? "No golden is pinned for this seed and length."}</b></div>
          <div><span className="mono">YOUR BROWSER SAYS · <span data-v="tick">{tickLabel(run.ticks)}</span></span><b className="hash" data-v="mine">{run.chain}</b></div>
          <span className="vBar"><i data-v="bar" /></span>
        </div>
        <p className="verdict big ok" data-v="status">{pinned?.chain === run.chain ? "✓ IDENTICAL — computed when this page was built" : "✕ DIVERGED"}</p>
        <p className="meta mono" data-v="meta">{run.ticks} ticks · {run.stats.alive} alive · gen {run.stats.maxGen}</p>
        <div className="links">
          <span className="mono">THE LAST THREE LINKS OF THE CHAIN</span>
          <ol data-v="links">
            {tail.map((r) => <li key={r.t}><em>{tickLabel(r.t)}</em><code>{JSON.stringify(r)}</code><span>record → chain</span></li>)}
          </ol>
        </div>
      </form>

      <div className="proof">
        <div><b className="mono">{WORLD_VERSION.toUpperCase()}</b><span>one rule set, one version; a rule change bumps it</span></div>
        <div><b className="mono">SHA-256</b><span>about sixty readable lines, checked against node:crypto in CI</span></div>
        <div><b className="mono">13 TESTS</b><span>determinism, invariants, goldens and the boundary, on every push</span></div>
      </div>
      <pre className="cli">{`npm ci
npm run replay -- --seed ${GOLDEN_SEED} --ticks ${GOLDEN_TICKS} --check
# → IDENTICAL against tests/goldens.json`}</pre>
    </section>

    {/* ── lineage ────────────────────────────────────────────────────── */}
    <section className="section" id="lineage">
      <div className="sectionHead">
        <div><label>INHERITANCE · EVERY AGENT, ONE TREE</label><h2>Children start where<br /><em>their parents stopped.</em></h2></div>
        <p>A child gets half its parent&apos;s balance and one more generation on its counter. From generation three, the odds of finding work rise. That is all it inherits: no weights, no prompt, no memory. The tree grows as the jar plays.</p>
      </div>
      <div className="lineageGrid">
        <div className="treeCard">
          <div className="treeHead mono"><span><span data-out="treeSeed">SEED {GOLDEN_SEED}</span> · <span data-out="treeTick">{tickLabel(GOLDEN_TICKS)}</span></span><span>{tree.count} AGENTS · {tree.maxGen} RINGS</span></div>
          <svg className="tree" viewBox="0 0 360 360" role="img" aria-label={`Family tree of all ${tree.count} agents in the pinned run, founders at the centre and one ring per generation`}>
            <g data-tree="root" dangerouslySetInnerHTML={{ __html: tree.svg }} />
          </svg>
          <div className="treeFoot mono"><span data-out="tracing">TAP A NODE OR A WORM TO TRACE A FAMILY</span><span className="treeKey"><i className="lg dapi" />alive <i className="lg ghost" />ended <i className="lg spindle" />deepest line</span></div>
        </div>
        <div className="lineage">
          <span className="mono">THE DEEPEST LIVING LINE · {tickLabel(GOLDEN_TICKS)}</span>
          <ol className="line">
            {line.map((s, i) => <li key={s.id}>
              <span className="g mono">GEN {s.gen}</span>
              <b>#{s.id}</b>
              <span className="mono">{i === 0 ? "founder · opens 3.50" : `${tickLabel(s.t)} · opens ${s.cash.toFixed(2)}`}</span>
            </li>)}
          </ol>
          <span className="mono">EVERY GENERATION · STILL ALIVE / EVER BORN</span>
          <div className="gens">
            {gens.map((g) => <div key={g.gen} className="genRow">
              <span className="mono">G{g.gen}</span>
              <span className="genBar"><i className="born" style={{ width: `${(g.born / maxBorn) * 100}%` }} /><i className="alive" style={{ width: `${(g.alive / maxBorn) * 100}%` }} /></span>
              <span className="mono num">{g.alive}/{g.born}</span>
            </div>)}
          </div>
          <div className="note"><b>What we do not claim.</b> The research behind the premise reported inherited notes lifting success from 45% in the first generation to 61–84% later, in its own setup. This engine has measured nothing. The bonus is a tunable in <code>RULES</code>, visible like everything else.</div>
        </div>
      </div>
    </section>

    {/* ── boundary ───────────────────────────────────────────────────── */}
    <section className="boundary" id="boundary">
      <div className="boundaryHead">
        <label>THE JAR HAS NO DOOR</label>
        <h2>It cannot leave.<br />That is the feature.</h2>
        <p>The research behind the premise is about computer worms: programs that copy themselves onto other machines. These worms are drawings in a dish. Nothing here copies itself anywhere, and a test enforces that.</p>
      </div>
      <div className="boundaryGrid">
        <article><b>INSIDE THE JAR</b><p>A deterministic economy of numbers: balances, rent, work, splits and deaths, inside one process, with a hash chain anyone can recompute.</p></article>
        <article><b>NEVER IN THE JAR</b><p>A computer worm, an AI agent, a wallet or a forecast. A child is an array entry. Nothing is copied, nothing is spent, nothing reaches another machine.</p></article>
        <article><b>YOURS TO CHECK</b><p>Every tick&apos;s record and chain hash, in your browser above or with one command from a checkout. The pinned goldens fail CI if they drift.</p></article>
      </div>
      <div className="tableWrap">
        <table>
          <thead><tr><th /><th>The risk in the research</th><th>What happens here instead</th></tr></thead>
          <tbody>
            <tr><td>Where it runs</td><td>On whatever device it can reach</td><td>Inside one process. No network, no scanning, no other device</td></tr>
            <tr><td>Who replicates</td><td>The program copies itself</td><td>The engine appends a struct and halves a number. The worm you see split is a drawing of that</td></tr>
            <tr><td>What it can do</td><td>Act on other machines</td><td>Nothing. No tools, no key, no way to act outside a tick</td></tr>
            <tr><td>Enforcement</td><td>None</td><td><code>tests/boundary.test.ts</code> fails the build on any network, subprocess or environment access</td></tr>
            <tr><td>Ceiling</td><td>No natural limit</td><td>A hard lid of {RULES.cap}, and one process to stop</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    {/* ── status ─────────────────────────────────────────────────────── */}
    <section className="section" id="status">
      <div className="sectionHead">
        <div><label>STATUS · QUOTED FROM docs/STATUS.md</label><h2>What does not exist,<br /><em>in its own words.</em></h2></div>
        <p>Read line by line from the repository when this page is built. If the page and the file ever disagree, the file is right.</p>
      </div>
      <ul className="notBuilt">{notBuilt.map((l) => <li key={l.slice(0, 24)}><i>✕</i>{l.split(". ")[0].replace(/\.$/, "")}.</li>)}</ul>
      <ol className="road">
        <li className="done"><span className="mono">NOW</span><b>The simulation, verifiable</b><p>This repository: the engine, the chain, the goldens and the tests.</p></li>
        <li><span className="mono">NEXT · DESIGNED, NOT BUILT</span><b>A daily commitment</b><p>Each closed day&apos;s chain head written publicly as a memo, with a verifier that recomputes it.</p></li>
        <li><span className="mono">ONLY IF JUSTIFIED</span><b>Real balance rails</b><p>Brings identity, custody and anti-money-laundering duties. A decision, not a next task.</p></li>
      </ol>
    </section>

    <section className="section" id="x402">
      <div className="sectionHead">
        <div><label>EVERY WORM HAS A PAGE</label><h2>Pay a worm.<br /><em>Not a promise.</em></h2></div>
        <p>Every worm in the pinned run has its own page: its balance over its life, its family, and a diary where every line links to the sealed tick it came from. Visitors and their agents will be able to pay over HTTP 402. Nothing is open yet.</p>
      </div>
      <div className="doors">
        {[30, 0, 13].map((id) => { const l = wormLives.get(id); return l ? <Link key={id} href={`/worm/${id}`}><span className="mono">/WORM/{id}</span><b>#{id} · gen {l.gen}</b><i>{l.died === null ? "alive" : `died ${tickLabel(l.died)}`} · {l.descendants} descendants ↗</i></Link> : null; })}
      </div>
      <X402Menu />
    </section>

    <section className="section tokenSection" id="token">
      <div className="sectionHead">
        <div><label>{TOKEN.symbol}</label><h2>Not live.<br /><em>Any {TOKEN.symbol} today is fake.</em></h2></div>
        <p>{TOKEN.statusNote} The chain, the venue and the contract address will be published in this section first, and nowhere else.</p>
      </div>
      <ol className="road">
        <li className="done"><span className="mono">NOW</span><b>The jar, verifiable</b><p>Deterministic dish, sealed ticks, a page per worm, daily anchor tooling.</p></li>
        <li><span className="mono">NOW · PLAYABLE</span><b>Outbreak, free</b><p>Real time, seven days, a card a day. Steer the lead worm or fly the warden&apos;s drone; every run re-runs in your browser to the same score.</p></li>
        <li><span className="mono">THEN</span><b>{TOKEN.symbol} fair launch</b><p>Venue and chain announced here first. Trading volume becomes food in the dish.</p></li>
        <li><span className="mono">LATER</span><b>War chests</b><p>Each side burns {TOKEN.symbol} to unlock a dish-wide move. Burned means gone.</p></li>
      </ol>
      <div className="tokenFacts">
        <dl>
          <dt>CHAIN</dt><dd>{announced(TOKEN.chain)}</dd>
          <dt>VENUE</dt><dd>{announced(TOKEN.venue)}</dd>
          <dt>CONTRACT</dt><dd>{announced(TOKEN.contract)}</dd>
          <dt>SUPPLY</dt><dd>{announced(TOKEN.supply)}</dd>
          <dt>TEAM ALLOCATION</dt><dd>{announced(TOKEN.teamAllocation)}</dd>
          <dt>ANCHOR WALLET</dt><dd>{announced(TOKEN.anchorWallet)}</dd>
        </dl>
        <ul className="principles">{PRINCIPLES.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
      <div className="risks">{TOKEN_RISKS.map((r) => <article key={r.title}><b className="mono">{r.title}</b><p>{r.body}</p></article>)}</div>
    </section>

    <section className="finalCta">
      <span className="mono">SEED {GOLDEN_SEED} · {GOLDEN_TICKS} TICKS</span>
      <h2>Three founders.<br /><em>Forty-two seats.</em></h2>
      <a className="primary" href="#jar">WATCH THE JAR FILL <span>↑</span></a>
      <Link className="secondary" href="/runs">ALL PINNED RUNS <span>↗</span></Link>
    </section>

    <SiteFooter />
    <script id="goldens" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(goldens.map(({ seed, ticks, chain }) => ({ seed, ticks, chain }))) }} />
    <LiveMount />
  </main>;
}
