import "../globals.css";
import type { Metadata } from "next";

// Nonces must be fresh per document, never emitted from a static build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://sync-stock-six.vercel.app"),
  title: "Expansion connections | SyncStock",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// A separate ROOT layout is intentional: Next performs a full document load
// across root layouts, including Link/router navigation. Removing a script tag
// from a shared layout would not remove its already-executed JavaScript.
// Do not add App Bridge, remote fonts, analytics, or FeedbackLink here.
export default function ConnectionSetupLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
