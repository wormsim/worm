import type { MetadataRoute } from "next";
import { SITE } from "./lib/launch";
import { book } from "./lib/wormbook";
import { TOPICS } from "./docs/topics";

/* The pages worth indexing. Empty until config/launch.json names the site's URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE) return [];
  const paths = ["", "/play", "/forecast", "/essay", "/faq", "/docs", "/anchors", "/runs", "/limitations", "/governance", "/terms", "/privacy", ...TOPICS.map((t) => `/docs/${t.slug}`), ...[...book().lives.keys()].map((id) => `/worm/${id}`)];
  return paths.map((path) => ({ url: `${SITE}${path}`, changeFrequency: "daily" as const, priority: path === "" ? 1 : path.startsWith("/worm") ? 0.5 : 0.7 }));
}
