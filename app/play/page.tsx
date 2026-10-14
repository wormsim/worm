import type { Metadata } from "next";
import PlayTabs from "../components/play/PlayTabs";
import { SiteFooter, SiteNav } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Play OUTBREAK — WORM",
  description: "Worms spread and pass notes to their children. Wardens push R below one. Seal a move a day; the seed comes from everyone's sealed moves; every day re-runs in your browser."
};

export default function PlayPage() {
  return <main className="page">
    <SiteNav />
    <div id="playRoot"><PlayTabs /></div>
    <SiteFooter />
  </main>;
}
