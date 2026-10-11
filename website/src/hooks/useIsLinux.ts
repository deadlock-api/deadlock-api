import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function isLinux(): boolean {
  const nav = navigator as NavigatorWithUAData;
  if (nav.userAgentData?.platform) return nav.userAgentData.platform === "Linux";
  return /\bLinux\b/.test(nav.userAgent) && !/\bAndroid\b/.test(nav.userAgent);
}

/** True when the visitor is on desktop Linux. False during server rendering and hydration, so the markup matches. */
export function useIsLinux(): boolean {
  return useSyncExternalStore(subscribe, isLinux, () => false);
}
