import "./globals.css";
import "./launch.css";

export const metadata = {
  title: "SyncStock — Shopify orders into clean QuickBooks",
  description: "Founding beta for Shopify merchants who want paid orders mapped, checked, and recorded in QuickBooks Online without silent accounting errors.",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
