import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function isMac(): boolean {
  const nav = navigator as NavigatorWithUAData;
  if (nav.userAgentData?.platform) return nav.userAgentData.platform === "macOS";
  // iPadOS Safari also says Macintosh, but has a touch screen.
  return /\bMacintosh\b/.test(nav.userAgent) && nav.maxTouchPoints <= 1;
}

/** True when the visitor is on a Mac. False during server rendering and hydration, so the markup matches. */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribe, isMac, () => false);
}
