import newRockerWoff2 from "@fontsource/new-rocker/files/new-rocker-latin-400-normal.woff2?url";

// "New Rocker" is declared with font-display: optional, so it only shows when it is
// already available at first paint. Routes that use it must preload it.
export const NEW_ROCKER_PRELOAD = {
  rel: "preload",
  href: newRockerWoff2,
  as: "font",
  type: "font/woff2",
  crossOrigin: "anonymous",
} as const;
