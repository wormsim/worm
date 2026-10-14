import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { fromQuery, headline, subline, toQuery } from "../lib/share";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* A shared result. The page exists so the link unfurls into a card on X. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const d = fromQuery(await searchParams);
  const title = d ? `${headline(d)} — WORM` : "WORM";
  const image = d ? `/s/card?${toQuery(d)}` : "/opengraph-image";
  return { title, description: d ? subline(d) : "They built an AI worm. We made it pay rent.", openGraph: { title, images: [image] }, twitter: { card: "summary_large_image", title, images: [image] } };
}

export default async function SharePage({ searchParams }: Props) {
  const d = fromQuery(await searchParams);
  return <main className="page">
    <SiteNav />
    <section className="docBody shareLanding">
      <div className="eyebrow"><i />A SHARED RESULT · {d?.mode === "live" ? "LIVE SEASON" : "PRACTICE SEASON"}</div>
      <h1>{d ? headline(d) : "Nothing to show."}</h1>
      {d && <p className="lede">{subline(d)}. This card is the player&apos;s claim; season {d.season}, seed {d.seed} and chain head <code>{d.head}…</code> are what you need to check it.</p>}
      {d && <img className="shareImg" src={`/s/card?${toQuery(d)}`} alt={`${headline(d)} ${subline(d)}`} width={1200} height={675} />}
      <div className="heroActions"><Link className="primary" href="/play">PLAY A SEASON <span>→</span></Link><Link className="secondary" href="/">WHAT IS THIS <span>↗</span></Link></div>
    </section>
    <SiteFooter />
  </main>;
}
