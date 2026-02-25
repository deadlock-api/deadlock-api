import type { FC } from "react";
import { cn } from "~/lib/utils";
import type { StatDisplayProps } from "./StatDisplay.types";
import { StatText } from "./StatText";

export const StatDisplay: FC<StatDisplayProps> = ({ stat, theme = "dark", className }) => {
  const { variable, label, value, prefix, suffix } = stat;
  const isImageStat = variable.endsWith("_img");

  return (
    <div className={cn("flex flex-col items-center p-2.5 rounded-lg relative min-w-fit", className)}>
      {isImageStat && value ? (
        <img src={value as string} alt={label} className="w-16" />
      ) : (
        <StatText label={label} value={value} prefix={prefix} suffix={suffix} theme={theme} />
      )}
    </div>
  );
};
