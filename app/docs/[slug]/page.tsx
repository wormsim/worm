import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "../../components/Markdown";
import { PageHead, SiteFooter, SiteNav } from "../../components/SiteChrome";
import { TOPICS, findTopic } from "../topics";

export function generateStaticParams() {
  return TOPICS.map((t) => ({ slug: t.slug }));
}

/** Only the nine topics exist: anything else is a 404 rather than a file read. */
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = findTopic(slug);
  if (!topic) return { title: "Not found — WORM" };
  return { title: `${topic.title} — WORM docs`, description: topic.blurb };
}

/** The document, with its own top heading dropped: the page head already shows it. */
function read(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/^# .*\n+/, "");
}

const others = (slug: string) => [
  "---",
  "",
  "**Other docs** — " + TOPICS.filter((t) => t.slug !== slug).map((t) => `[${t.title}](/docs/${t.slug})`).join(" · "),
  "",
  "[All docs](/docs) · [github.com/wormsim/worm](https://github.com/wormsim/worm)"
].join("\n");

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = findTopic(slug);
  if (!topic) notFound();
  return <main className="page">
    <SiteNav />
    <PageHead kicker={`DOCS · ${topic.file}`} title={topic.title} />
    <section className="docBody">
      <div className="doc"><Markdown text={`${read(topic.file)}\n\n${others(topic.slug)}`} /></div>
      <p className="docNote">Rendered directly from <code>{topic.file}</code> in the repository at build time. This page is a view of that file, not a copy of it. <Link href="/docs">All docs</Link>.</p>
    </section>
    <SiteFooter />
  </main>;
}
