import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Limitations — WORM", description: "What this simulation is not, and what it cannot do." };

export default function Page() {
  return <DocPage file="LIMITATIONS.md" title="Limitations" note="WHAT THIS IS NOT" />;
}
