import { parseSearchWith, stringifySearchWith } from "@tanstack/react-router";

/** An integer JSON would round: a SteamID64 such as 76561198035228949 is past 2^53. */
function isUnsafeIntegerString(value: string): boolean {
  return /^-?\d{16,}$/.test(value) && !Number.isSafeInteger(Number(value));
}

/**
 * The router's default search parsing, except that a long integer stays the string it was. `JSON.parse` turned a
 * pasted SteamID64 into the nearest double, which is another player's account 15 times in 16.
 */
export const parseSearch = parseSearchWith((value) => (isUnsafeIntegerString(value) ? value : JSON.parse(value)));

/** The inverse of `parseSearch`: a long integer string goes back into the URL bare, not quoted. */
export const stringifySearch = stringifySearchWith(JSON.stringify, (value) => {
  // A throw tells the router the string is not JSON, so it is written as it is.
  if (isUnsafeIntegerString(value)) throw new SyntaxError("unsafe integer");
  return JSON.parse(value);
});
