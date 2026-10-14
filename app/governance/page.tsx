import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Governance — WORM", description: "Who runs this, who holds what, and how changes happen." };

export default function Page() {
  return <DocPage file="GOVERNANCE.md" title="Governance" note="WHO DECIDES WHAT" />;
}
