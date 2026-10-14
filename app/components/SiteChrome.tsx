import Link from "next/link";
import type { ReactNode } from "react";
import { TOKEN } from "../lib/launch";

/** The mark: one worm, splitting in two. */
export function Mark() {
  return <svg className="mark" viewBox="0 0 44 24" aria-hidden="true">
    <path className="half l" d="M3 13 C6 7, 10 7, 13 12 S 19 17, 21 12" />
    <path className="half r" d="M23 12 C25 7, 29 7, 32 12 S 37 17, 41 11" />
    <circle className="head" cx="41" cy="11" r="2.4" />
    <circle className="head l" cx="3" cy="13" r="2.4" />
  </svg>;
}

export function SiteNav({ home = false }: { home?: boolean }) {
  const h = (id: string) => (home ? `#${id}` : `/#${id}`);
  return <nav className="siteNav">
    <Link className="brand" href="/" aria-label="WORM, home"><Mark /><span>WORM</span></Link>
    <div className="navLinks">
      <a href={h("jar")}>The jar</a>
      <a href={h("replay")}>Replay</a>
      <a href={h("token")}>{TOKEN.symbol}</a>
      <Link href="/forecast">Forecast</Link>
      <Link href="/essay">Why WORM</Link>
      <Link href="/faq">FAQ</Link>
      <Link href="/docs">Docs</Link>
    </div>
    <Link className="navCta" href="/play">PLAY OUTBREAK <span>→</span></Link>
  </nav>;
}

export function SiteFooter() {
  return <footer className="siteFooter">
    <div className="footTop">
      <Link className="brand" href="/"><Mark /><span>WORM</span></Link>
      <div className="footLinks">
        <Link href="/play">Play</Link>
        <Link href="/forecast">Forecast</Link>
        <Link href="/essay">Why WORM</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/runs">Pinned runs</Link>
        <Link href="/anchors">Anchors</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/worm/30">A worm&apos;s page</Link>
        <Link href="/limitations">Limitations</Link>
        <Link href="/governance">Governance</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </div>
    </div>
    <p>Simulation only. No real money moves and nothing leaves the dish. Wallets only sign sealed moves; the chain only supplies randomness and daily anchors. {TOKEN.live ? `${TOKEN.symbol} is not a share of anything; the only contract address is the one in the token section.` : "No token exists yet."}</p>
    <p className="fine">The premise is drawn from published research on self-replicating models. This project is independent, is not affiliated with its authors, and implements none of the capability it describes. The reading, with its numbers and caveats, is filed in <code>docs/ARTICLE.md</code>. MIT licence.</p>
  </footer>;
}

export function PageHead({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return <header className="pageHead">
    <div className="eyebrow"><i />{kicker}</div>
    <h1>{title}</h1>
    {children}
  </header>;
}
