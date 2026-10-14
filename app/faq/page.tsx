import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Questions — WORM", description: "How to play WORM, how fairness is checked, the live season, and the token." };

export default function Page() {
  return <DocPage file="docs/FAQ.md" title="Questions" note="FAQ" />;
}
