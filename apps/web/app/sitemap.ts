import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/schema";

/**
 * Auto-generated sitemap.xml at /sitemap.xml. Lists every public
 * surface that should be indexable. `/app/*`, `/api/*`,
 * `/sign-in`, `/sign-up`, and `/dev/*` are intentionally excluded
 * — they're either authenticated or developer-only and shouldn't
 * be crawled.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/cookies`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
