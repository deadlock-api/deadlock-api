import type { FC } from "react";

import { cn } from "~/lib/utils";

import type { StatDisplayProps } from "./StatDisplay.types";
import { StatText } from "./StatText";

export const StatDisplay: FC<StatDisplayProps> = ({ stat, theme = "dark", className }) => {
  const { variable, label, value, prefix, suffix, subtext, imageAlt } = stat;
  const isImageStat = variable.endsWith("_img");

  return (
    <div className={cn("relative flex min-w-fit flex-col items-center rounded-lg p-2.5", className)}>
      {isImageStat && value ? (
        // The picture is the value; its label is not drawn, but a screen reader still hears which stat it is.
        <>
          <dt className="sr-only">{label}</dt>
          <dd>
            <img src={value as string} alt={imageAlt ?? label} width={64} height={50} className="h-auto w-16" />
          </dd>
        </>
      ) : (
        <StatText label={label} value={value} prefix={prefix} suffix={suffix} theme={theme} />
      )}
      {subtext && (
        <dd
          className={cn(
            "mt-0.5 text-center text-xs font-medium tracking-wide text-nowrap",
            theme === "light" ? "text-gray-500" : "text-white/60",
          )}
        >
          {subtext}
        </dd>
      )}
    </div>
  );
};
