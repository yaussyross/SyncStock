import "./globals.css";
import "./launch.css";
import "./fab.css";
import FeedbackLink from "@/components/FeedbackLink";

export const metadata = {
  title: "SyncStock — Shopify orders into clean QuickBooks",
  description: "Sync paid Shopify orders to QuickBooks Online with explicit product mapping, reconciliation checks, duplicate protection, and visible sync history.",
  openGraph: {
    title: "SyncStock — Shopify orders into clean QuickBooks",
    description: "Focused Shopify → QuickBooks automation with mapping, reconciliation checks, retry safety, and visible sync history.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncStock — Shopify orders into clean QuickBooks",
    description: "Focused Shopify → QuickBooks automation for merchants who want less manual entry and more control.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY || ""} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <FeedbackLink />
      </body>
    </html>
  );
}
