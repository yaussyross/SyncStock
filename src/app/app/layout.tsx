"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export default function ShopifyAppLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const nav = document.createElement("s-app-nav");
    const home = document.createElement("s-link");

    home.setAttribute("href", "/app");
    home.setAttribute("rel", "home");
    home.textContent = "Home";
    nav.appendChild(home);
    document.body.appendChild(nav);

    return () => {
      nav.remove();
    };
  }, []);

  return <>{children}</>;
}
