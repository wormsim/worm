import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Terms — WORM", description: "WORM's terms, in plain English." };

export default function Page() {
  return <DocPage file="docs/TERMS.md" title="Terms" note="TERMS · PLAIN ENGLISH" />;
}
