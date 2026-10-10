import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function isWindows(): boolean {
  const nav = navigator as NavigatorWithUAData;
  return nav.userAgentData?.platform === "Windows" || /\bWindows\b/.test(nav.userAgent);
}

/** True when the visitor is on Windows. False during server rendering and hydration, so the markup matches. */
export function useIsWindows(): boolean {
  return useSyncExternalStore(subscribe, isWindows, () => false);
}
