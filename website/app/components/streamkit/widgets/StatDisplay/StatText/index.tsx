import { cn } from "~/lib/utils";

import type { StatTextProps } from "./StatText.types";

export const StatText = ({ label, value, prefix, suffix, theme }: StatTextProps) => {
  return (
    <>
      <span
        className={cn(
          "text-center text-[11px] font-medium tracking-wide text-nowrap uppercase",
          theme === "light" ? "text-gray-800" : "text-white/60",
        )}
      >
        {label}
      </span>
      <div className={cn("mt-0.5 flex items-baseline justify-center gap-1")}>
        {prefix && (
          <span className={cn("text-xs font-medium", theme === "light" ? "text-gray-500" : "text-white/60")}>
            {prefix}
          </span>
        )}
        <span className={cn("font-bold tracking-tight", theme === "light" ? "text-gray-900" : "text-white")}>
          {value ?? "-"}
        </span>
        {suffix && (
          <span className={cn("text-xs font-medium", theme === "light" ? "text-gray-500" : "text-white/60")}>
            {suffix}
          </span>
        )}
      </div>
    </>
  );
};
