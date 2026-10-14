import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SITE } from "./lib/launch";

const TITLE = "WORM — the AI worm, in a jar";
const DESC =
  "They built an AI worm. We made it pay rent. Worms in a sealed dish pay for compute every tick, split in two when they can afford a child, and die when they cannot. Simulation only: no real money moves and nothing leaves the dish.";

export const metadata: Metadata = {
  // Absolute URLs for share images need the public address; until it is set, localhost is honest.
  metadataBase: new URL(SITE ?? "http://localhost:3000"),
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESC, siteName: "WORM", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head /><body>{children}</body></html>;
}
