"use client";

import { usePathname } from "next/navigation";

export default function FeedbackLink() {
  const pathname = usePathname();
  if (pathname === "/feedback" || pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;
  return <a className="feedback-fab" href="/feedback" aria-label="Send SyncStock feedback">Feedback</a>;
}
