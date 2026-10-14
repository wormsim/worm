import type { Metadata } from "next";
import PlayerClient from "./PlayerClient";
import { SiteFooter, SiteNav } from "../../components/SiteChrome";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const short = /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Player";
  return { title: `${short} — WORM live season`, description: "One player's live season, rebuilt in the browser from published moves and Robinhood Chain blocks." };
}

export default async function PlayerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <main className="page">
    <SiteNav />
    <section className="docBody playerPage"><div className="doc"><PlayerClient address={address.toLowerCase()} /></div></section>
    <SiteFooter />
  </main>;
}
