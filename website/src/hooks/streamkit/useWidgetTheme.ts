import { useMemo } from "react";

import { THEME_STYLES } from "~/constants/streamkit/widget";
import { cn } from "~/lib/utils";
import type { Theme } from "~/types/streamkit/widget";

function backgroundStyle(theme: Theme) {
  if (theme === "glass") return "bg-black/10 backdrop-blur-md";
  if (theme === "light") return cn("[background:rgba(255,255,255,var(--bg-opacity))]", "border-gray-100/5");
  return cn("[background:rgba(26,27,30,var(--bg-opacity))]", "border-hairline");
}

function headerStyle(theme: Theme) {
  if (theme === "glass") return "bg-white/5";
  if (theme === "light") {
    return cn(
      "[background:linear-gradient(to_right,rgba(255,255,255,var(--bg-opacity)),rgba(249,250,251,var(--bg-opacity)))]",
      "border-b border-gray-900/5",
    );
  }
  return cn(
    "[background:linear-gradient(to_right,rgba(26,27,30,var(--bg-opacity)),rgba(37,38,43,var(--bg-opacity)))]",
    "border-b border-hairline",
  );
}

export const useWidgetTheme = (theme: Theme, opacity = 100, showOutline = true) => {
  const themeStyles = useMemo(
    () => ({
      containerClasses: (showMatchHistory?: boolean) =>
        cn(
          "inline-flex flex-col",
          "rounded-b-xl",
          backgroundStyle(theme),
          theme !== "glass" && showOutline && "border",
          showMatchHistory ? "border-t-0" : "rounded-t-xl",
          showOutline && "shadow-lg",
          THEME_STYLES[theme].container,
        ),
      headerClasses: (showMatchHistory?: boolean) =>
        cn(
          !showMatchHistory && "rounded-t-xl",
          "px-4 py-3",
          headerStyle(theme),
          "relative",
          THEME_STYLES[theme].header,
        ),
      brandingLinkClasses: "group flex flex-nowrap items-center gap-1.5 rounded-full transition-all",
      brandingTextClasses: {
        primary: cn("text-xs font-medium transition-all", theme === "light" ? "text-gray-500" : "text-white/50"),
        secondary: cn("text-xs font-semibold transition-all", theme === "light" ? "text-black/80" : "text-white/80"),
      },
      userNameClasses: cn(
        "text-[13px] font-medium tracking-wide",
        theme === "light" ? "text-gray-900" : "text-white/90",
      ),
    }),
    [theme, showOutline],
  );

  const cssVariables = useMemo(() => ({ "--bg-opacity": opacity / 100 }) as React.CSSProperties, [opacity]);

  return { ...themeStyles, cssVariables };
};
