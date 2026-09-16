import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/signup", "/login", "/privacy", "/terms"],
      disallow: ["/api/", "/dashboard/", "/feedback"],
    },
    sitemap: "https://sync-stock-six.vercel.app/sitemap.xml",
  };
}
