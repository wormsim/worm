import type { Metadata } from "next";
import Markdown from "../components/Markdown";
import { PageHead, SiteFooter, SiteNav } from "../components/SiteChrome";
import { GROUPS, TOPICS } from "./topics";

export const metadata: Metadata = {
  title: "Docs — WORM",
  description: "The engine, the determinism, the live season and the records — each page rendered from the file it names in the repository."
};

/* The index is Markdown rendered by the same component the documents use, and it is
   built from `topics.ts`, so a page cannot be listed here without existing there. */
const index = [
  "Nine pages, each one a view of a file in the repository rather than a second copy of it. If a",
  "page and its file ever disagree, the file is right.",
  "",
  ...GROUPS.flatMap((group) => [
    `## ${group}`,
    "",
    ...TOPICS.filter((t) => t.group === group).map((t) => `- [**${t.title}**](/docs/${t.slug}) — ${t.blurb}`),
    ""
  ]),
  "## Elsewhere on the site",
  "",
  "- [Why WORM](/essay) · [Forecast](/forecast) · [FAQ](/faq) · [Pinned runs](/runs) · [Anchors](/anchors)",
  "- [A worm's page](/worm/30) · [Limitations](/limitations) · [Governance](/governance) · [Terms](/terms) · [Privacy](/privacy)",
  "",
  "## The other half of the documentation",
  "",
  "The repository is public: [github.com/wormsim/worm](https://github.com/wormsim/worm). Anything quoted",
  "on this site — the status page, the test count, the pinned chain head — is recomputable from a",
  "checkout with `npm test` and `npm run replay -- --seed 20261013 --ticks 340 --check`."
].join("\n");

export default function DocsIndex() {
  return <main className="page">
    <SiteNav />
    <PageHead kicker="DOCS · READ FROM THE REPOSITORY" title={<>The whole thing,<br /><em>written down.</em></>} />
    <section className="docBody">
      <div className="doc"><Markdown text={index} /></div>
    </section>
    <SiteFooter />
  </main>;
}
