import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RULES } from "../../../sim/engine";
import X402Menu from "../../components/X402Menu";
import { PageHead, SiteFooter, SiteNav } from "../../components/SiteChrome";
import { tickLabel } from "../../lib/runview";
import { BOOK_SEED, BOOK_TICKS, book, cashPath } from "../../lib/wormbook";

export function generateStaticParams() {
  return [...book().lives.keys()].map((id) => ({ id: String(id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const l = book().lives.get(Number(id));
  if (!l) return { title: "Not found — WORM" };
  return {
    title: `Worm #${l.id} — WORM`,
    description: `Generation ${l.gen}. ${l.died === null ? `Alive at ${tickLabel(BOOK_TICKS)}` : `Died at ${tickLabel(l.died)}`}, ${l.children.length} children, ${l.descendants} descendants. Every line of its diary links to a sealed tick.`
  };
}

const KIND_LABEL: Record<string, string> = { born: "BORN", split: "SPLIT", starving: "HUNGRY", crowded: "DISH FULL", rich: "FLUSH", died: "DIED", survived: "STILL HERE" };

export default async function WormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lives } = book();
  const l = lives.get(Number(id));
  if (!l) notFound();
  const W = 640, H = 150, p = cashPath(l, W, H);
  const status = l.died === null ? `ALIVE AT ${tickLabel(BOOK_TICKS)}` : `DIED AT ${tickLabel(l.died)}`;

  return <main className="page">
    <SiteNav />
    <PageHead kicker={`WORM #${l.id} · GENERATION ${l.gen} · SEED ${BOOK_SEED}`} title={<>#{l.id}<br /><em className={l.died === null ? "alive" : "gone"}>{l.died === null ? "Still crawling." : "Gone, on the record."}</em></>}>
      <p>{l.parent === null ? "One of the three founders of the pinned run." : <>Split off from <Link href={`/worm/${l.parent}`}>#{l.parent}</Link> at {tickLabel(l.born)}.</>} {l.children.length ? `It split ${l.children.length} time${l.children.length > 1 ? "s" : ""}; ${l.descendants} worms descend from it.` : "It never split."} Everything on this page is read from the sealed record; nothing is written by hand.</p>
    </PageHead>

    <section className="docBody wormBody">
      <div className="stats wormStats">
        <div><span>Status</span><b className={l.died === null ? "ok" : "gone"}>{status}</b></div>
        <div><span>Born</span><b>{tickLabel(l.born)}</b></div>
        <div><span>Opening balance</span><b>{l.opening.toFixed(2)}</b></div>
        <div><span>Peak balance</span><b>{l.peak.toFixed(2)}</b></div>
        <div><span>Children</span><b>{l.children.length}</b></div>
        <div><span>Descendants</span><b>{l.descendants}</b></div>
      </div>

      <div className="instrument wormChart">
        <div className="instrumentHead"><span className="mono">BALANCE OVER ITS LIFE · ONE POINT PER TICK</span><span className="mono keys"><i className="lg spindle" />split threshold {RULES.birthCost * 2}</span></div>
        <div className="chartWrap" style={{ borderRight: 0 }}>
          <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Balance of worm ${l.id} from ${tickLabel(l.born)} to ${l.died === null ? "the end" : tickLabel(l.died)}`}>
            <line className="grid" x1="0" x2={W} y1={H} y2={H} />
            <line className="mk split" x1="0" x2={W} y1={p.splitY} y2={p.splitY} strokeDasharray="3 4" />
            <path d={p.d} className="aliveLine" />
            {l.children.map((c) => <circle key={c.id} cx={p.x(c.t)} cy={p.y(c.cash)} r="3.5" fill="var(--spindle)" />)}
            {l.died !== null && <circle cx={p.x(l.died)} cy={H} r="4" fill="var(--amber)" />}
            {[0, 85, 170, 255, 340].map((t) => <text key={t} className="axis" x={p.x(t)} y={H + 14} textAnchor={t === 0 ? "start" : t === 340 ? "end" : "middle"}>{t}</text>)}
          </svg>
        </div>
      </div>

      <div className="wormGrid">
        <div>
          <h2 className="docH">Its diary</h2>
          <p className="muted">Loud, never made up. Each line is generated from a sealed event and carries the hash of that tick&apos;s record.</p>
          <ol className="diary">
            {l.diary.map((d, i) => <li key={i} className={d.kind}>
              <span className="mono when">{tickLabel(d.t)} · {KIND_LABEL[d.kind]}</span>
              <p>{d.text}</p>
              <code>record {d.record === "genesis" ? "genesis" : `${d.record.slice(0, 12)}…`}</code>
            </li>)}
          </ol>
        </div>
        <aside className="family">
          <h2 className="docH">Family</h2>
          <span className="mono">ANCESTORS</span>
          <p className="chain">{l.ancestors.length ? l.ancestors.map((a) => <Link key={a} href={`/worm/${a}`}>#{a}</Link>) : <span className="muted">none — a founder</span>}<b>#{l.id}</b></p>
          <span className="mono">CHILDREN</span>
          <ul className="kids">{l.children.length ? l.children.map((c) => { const k = lives.get(c.id)!; return <li key={c.id}><Link href={`/worm/${c.id}`}>#{c.id}</Link><span className="mono">{tickLabel(c.t)} · {k.died === null ? "alive" : `died ${tickLabel(k.died)}`}</span></li>; }) : <li className="muted">none</li>}</ul>
          <Link className="secondary" href={`/#trace-${l.id}`}>WATCH IT IN THE JAR <span>↗</span></Link>
        </aside>
      </div>

      <h2 className="docH">Pay this worm</h2>
      <X402Menu />
    </section>
    <SiteFooter />
  </main>;
}
