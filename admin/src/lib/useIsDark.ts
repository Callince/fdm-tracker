"use client";

import { useEffect, useState } from "react";

/**
 * Observes `html.dark` so SVG fills + canvas colors that can't use Tailwind
 * `dark:` variants can still swap on theme toggle.
 */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
