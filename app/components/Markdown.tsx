/* A very small renderer for the repository's own documents. It handles exactly the
   Markdown these files use — headings, bullets, tables, paragraphs, rules, links and emphasis — so a page
   cannot drift from the document it claims to show. No dependency, no HTML input:
   the text is rendered as React nodes, never as raw markup. */

import type { ReactNode } from "react";

const safeHref = (h: string) => /^(\/|https:\/\/|#)/.test(h) ? h : null;
const inline = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) { const href = safeHref(link[2]); return href ? <a key={i} href={href} {...(href.startsWith("https") ? { target: "_blank", rel: "noreferrer" } : {})}>{link[1]}</a> : <span key={i}>{link[1]}</span>; }
    if (/^\*[^*]/.test(part) && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });

export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  let table: string[] = [];

  const flushBullets = () => { if (bullets.length) { out.push(<ul key={`u${out.length}`}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|[\s:|-]+\|$/.test(r)).map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
    const [head, ...body] = rows;
    out.push(<table key={`t${out.length}`}>
      {head && <thead><tr>{head.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead>}
      <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
    </table>);
    table = [];
  };

  // Source files are hard-wrapped, so a paragraph or a bullet can span several lines:
  // continuation lines are joined back onto the block they belong to.
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(<p key={`p${out.length}`}>{inline(para.join(" "))}</p>); para = []; } };

  for (const line of lines) {
    const l = line.trimEnd();
    if (/^\|/.test(l)) { flushPara(); flushBullets(); table.push(l); continue; }
    flushTable();
    if (/^-\s+/.test(l)) { flushPara(); bullets.push(l.replace(/^-\s+/, "")); continue; }
    if (bullets.length && /^\s+\S/.test(line)) { bullets[bullets.length - 1] += " " + l.trim(); continue; }
    flushBullets();
    if (!l.trim()) { flushPara(); continue; }
    if (/^-{3,}$/.test(l.trim())) { flushPara(); out.push(<hr key={`hr${out.length}`} />); continue; }
    if (/^#{1,3} /.test(l) || l.startsWith("```")) flushPara();
    if (l.startsWith("### ")) out.push(<h3 key={out.length}>{inline(l.slice(4))}</h3>);
    else if (l.startsWith("## ")) out.push(<h2 key={out.length}>{inline(l.slice(3))}</h2>);
    else if (l.startsWith("# ")) out.push(<h1 key={out.length}>{inline(l.slice(2))}</h1>);
    else if (!l.startsWith("```")) para.push(l.trim());
  }
  flushPara(); flushBullets(); flushTable();
  return <>{out}</>;
}
