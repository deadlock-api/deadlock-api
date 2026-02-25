import type { BoxHeaderProps } from "./BoxHeader.types";

export const BoxHeader = ({ userName, showMatchHistory, themeClasses }: BoxHeaderProps) => {
  if (!userName) return null;

  return (
    <div className={themeClasses.headerClasses(showMatchHistory)}>
      <div className="flex items-center justify-between">
        <span className={themeClasses.userNameClasses}>{userName}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-medium text-green-500/90">LIVE</span>
        </div>
      </div>
    </div>
  );
};
