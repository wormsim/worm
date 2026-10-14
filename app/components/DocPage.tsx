import { readFileSync } from "node:fs";
import path from "node:path";
import Markdown from "./Markdown";
import { PageHead, SiteFooter, SiteNav } from "./SiteChrome";

/** Renders a document from the repository as-is — one source, no second copy to drift. */
export default function DocPage({ file, title, note }: { file: string; title: string; note: string }) {
  // The page head already shows the title, so the document's own top heading is dropped here.
  const text = readFileSync(path.join(process.cwd(), file), "utf8").replace(/^# .*\n+/, "");
  return <main className="page">
    <SiteNav />
    <PageHead kicker={note} title={title} />
    <section className="docBody">
      <div className="doc"><Markdown text={text} /></div>
      <p className="docNote">Rendered directly from <code>{file}</code> in the repository. This page is a view of that file, not a copy.</p>
    </section>
    <SiteFooter />
  </main>;
}
