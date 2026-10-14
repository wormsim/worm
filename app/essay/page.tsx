import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Why WORM — WORM", description: "Why a game about the AI worm paper, how the paper became rules, and what WORM will never be." };

export default function Page() {
  return <DocPage file="docs/ESSAY.md" title="Why WORM" note="THE LONG VERSION" />;
}
