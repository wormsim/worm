import type { MetadataRoute } from "next";
import { SITE } from "./lib/launch";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }], ...(SITE ? { sitemap: `${SITE}/sitemap.xml` } : {}) };
}
