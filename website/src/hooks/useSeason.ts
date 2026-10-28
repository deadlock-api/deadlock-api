import { useEffect, useSyncExternalStore } from "react";

import { HALLOWEEN_CLASS, HALLOWEEN_LOGO, HALLOWEEN_THEME_COLOR } from "~/lib/season";

const subscribe = () => () => {};

/**
 * Whether the Halloween theme is on: the class the head script set on <html> from the visitor's date. False while
 * server rendering and hydrating, so the markup matches; the theme's look comes from CSS and needs no render.
 */
export function useHalloween(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains(HALLOWEEN_CLASS),
    () => false,
  );
}

/** The browser's own chrome in the season: the tab shows the dressed logo and the toolbar color turns pumpkin. */
export function useSeasonBrowserChrome(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = HALLOWEEN_LOGO;
    document.head.append(icon);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = meta?.content;
    if (meta) meta.content = HALLOWEEN_THEME_COLOR;
    return () => {
      icon.remove();
      if (meta && color !== undefined) meta.content = color;
    };
  }, [enabled]);
}
