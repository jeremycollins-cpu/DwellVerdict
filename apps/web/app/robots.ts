import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/schema";

/**
 * Auto-generated robots.txt at /robots.txt. Allows crawling of
 * public pages, blocks the authenticated app, internal API
 * routes, auth pages (which would just redirect crawlers), and
 * the developer-only `/dev/*` surface.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/sign-in", "/sign-up", "/dev/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
