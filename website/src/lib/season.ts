/** The class on <html> that swaps in the Halloween tokens (tokens.css). */
export const HALLOWEEN_CLASS = "theme-halloween";
/** The brand logo dressed for Halloween, for the browser tab. */
export const HALLOWEEN_LOGO = "/season/hexe-lantern.svg";
// ds-allow color-literal: a meta tag cannot read CSS variables; mirrors --pumpkin-500
export const HALLOWEEN_THEME_COLOR = "#ff7518";

/**
 * Whether a moment is Halloween, October 30th through November 1st, by the calendar day where the visitor is. It
 * must not reference anything outside itself: it is also inlined as source into `seasonScript`.
 */
export function isHalloween(date: Date): boolean {
  const month = date.getMonth();
  const day = date.getDate();
  return (month === 9 && day >= 30) || (month === 10 && day === 1);
}

/**
 * The script that sets the Halloween class on <html> by the visitor's own date, from the head, before the body paints. The server
 * cannot know the visitor's time zone, so it renders no season; nothing React renders depends on the class, so
 * hydration still matches. The dev server always shows the season, to work on it in any month.
 */
export function seasonScript(): string {
  return `if(${String(import.meta.env.DEV)}||(${isHalloween.toString()})(new Date()))document.documentElement.classList.add(${JSON.stringify(HALLOWEEN_CLASS)})`;
}
