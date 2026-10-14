/* ── app/docs/topics.ts ──────────────────────────────────────────────────────
   One list, used by the docs index and by the router that renders each file.
   A topic names a file in the repository; the page shows that file, verbatim.
   --------------------------------------------------------------------------- */

export type Group = "Start here" | "The games" | "Reference" | "Records";

export interface Topic {
  slug: string;
  group: Group;
  title: string;
  /** The file this page is a view of, relative to the repository root. */
  file: string;
  blurb: string;
}

export const GROUPS: Group[] = ["Start here", "The games", "Reference", "Records"];

export const TOPICS: Topic[] = [
  { slug: "status", group: "Start here", title: "Status", file: "docs/STATUS.md",
    blurb: "What exists, what does not, and what is next — the page every other document must agree with." },
  { slug: "architecture", group: "Start here", title: "Architecture", file: "docs/architecture.md",
    blurb: "What runs where, the one-way dependency rule, what is on disk, and the two places a chain enters." },
  { slug: "determinism", group: "Start here", title: "Determinism", file: "docs/determinism.md",
    blurb: "How one seed produces the same bytes everywhere, what enforces it, and what would break it." },
  { slug: "live-season", group: "Start here", title: "The live season", file: "docs/live-season.md",
    blurb: "The day in UTC: a signature that moves nothing, a block nobody could know, a move that opens itself." },
  { slug: "design", group: "Start here", title: "Design", file: "docs/DESIGN.md",
    blurb: "Why the engine is written the paranoid way it is, and the boundary it keeps." },
  { slug: "outbreak", group: "The games", title: "Outbreak", file: "docs/OUTBREAK.md",
    blurb: "The roguelite: seven days, a card a day, and a score that is the replay's score." },
  { slug: "for-modifiers", group: "The games", title: "For modifiers", file: "docs/FOR-MODIFIERS.md",
    blurb: "The rules for changing any of this without quietly breaking the one thing it promises." },
  { slug: "glossary", group: "Reference", title: "Glossary", file: "docs/glossary.md",
    blurb: "Every word this project uses, defined once: tick, lid, seal, draw, R, anchor." },
  { slug: "roadmap", group: "Reference", title: "Roadmap", file: "docs/ROADMAP.md",
    blurb: "What is designed but not built, in order, with the rules every item has to keep." },
  { slug: "deploy", group: "Reference", title: "Deploy and ops", file: "deploy/README.md",
    blurb: "How this runs on a server: releases, the timers, the UTC cron, the backups, and what is not covered." },
  { slug: "article", group: "Records", title: "The source reading", file: "docs/ARTICLE.md",
    blurb: "The research this draws its premise from, with its numbers cited and the things it does not claim." },
  { slug: "audit-log", group: "Records", title: "Audit log", file: "AUDIT-LOG.md",
    blurb: "Every world change, in order, with its reason and its verification. Append-only." }
];

export const findTopic = (slug: string) => TOPICS.find((t) => t.slug === slug);
