import { useMemo } from "react";

import { OPAQUE_ENOUGH, THEME_STYLES } from "~/constants/streamkit/widget";
import { cn } from "~/lib/utils";
import type { Theme } from "~/types/streamkit/widget";

export const useWidgetTheme = (theme: Theme, opacity = 100, showOutline = true) => {
  const styles = THEME_STYLES[theme];
  // Text over a see-through surface sits on the game video: it gets the theme's halo. `text-shadow` is inherited.
  const halo = theme === "glass" || opacity < OPAQUE_ENOUGH;
  const themeStyles = useMemo(
    () => ({
      containerClasses: (showMatchHistory?: boolean) =>
        cn(
          "inline-flex flex-col",
          "rounded-b-xl",
          styles.surface,
          showOutline && styles.outline,
          showMatchHistory ? "border-t-0" : "rounded-t-xl",
          showOutline && "shadow-lg",
          halo && styles.halo,
        ),
      headerClasses: (showMatchHistory?: boolean) =>
        cn(!showMatchHistory && "rounded-t-xl", "px-4 py-3", styles.headerSurface, "relative", styles.header),
      brandingLinkClasses: "flex flex-nowrap items-center gap-1.5 rounded-full",
      brandingTextClasses: {
        primary: cn("text-xs font-medium", theme === "light" ? "text-gray-500" : "text-white/50"),
        secondary: cn("text-xs font-semibold", theme === "light" ? "text-black/80" : "text-white/80"),
      },
      userNameClasses: cn("text-sm font-medium tracking-wide", theme === "light" ? "text-gray-900" : "text-white/90"),
    }),
    [theme, styles, showOutline, halo],
  );

  const cssVariables = useMemo(() => ({ "--bg-opacity": opacity / 100 }) as React.CSSProperties, [opacity]);

  return { ...themeStyles, cssVariables };
};
