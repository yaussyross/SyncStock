import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/app", "/shopify/", "/login", "/feedback"],
    },
    sitemap: "https://sync-stock-six.vercel.app/sitemap.xml",
  };
}
