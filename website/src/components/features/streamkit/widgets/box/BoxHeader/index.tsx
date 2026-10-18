import type { BoxHeaderProps } from "./BoxHeader.types";

export const BoxHeader = ({ userName, showMatchHistory, themeClasses }: BoxHeaderProps) => {
  if (!userName) return null;

  return (
    <div className={themeClasses.headerClasses(showMatchHistory)}>
      {/* No "LIVE" mark: nothing in the data says the player is live or in a match, so it would always be on. */}
      <span className={themeClasses.userNameClasses}>{userName}</span>
    </div>
  );
};
