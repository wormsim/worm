import type { Metadata } from "next";
import DocPage from "../components/DocPage";

export const metadata: Metadata = { title: "Privacy — WORM", description: "What WORM keeps, and what it doesn't." };

export default function Page() {
  return <DocPage file="docs/PRIVACY.md" title="Privacy" note="PRIVACY · WHAT WE KEEP" />;
}
