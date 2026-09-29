import type { BoxHeaderProps } from "./BoxHeader.types";

export const BoxHeader = ({ userName, showMatchHistory, themeClasses }: BoxHeaderProps) => {
  if (!userName) return null;

  return (
    <div className={themeClasses.headerClasses(showMatchHistory)}>
      <div className="flex items-center justify-between">
        <span className={themeClasses.userNameClasses}>{userName}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
          <span className="text-xs font-medium text-positive">LIVE</span>
        </div>
      </div>
    </div>
  );
};
