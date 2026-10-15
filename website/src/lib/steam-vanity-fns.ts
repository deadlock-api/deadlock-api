import { createServerFn } from "@tanstack/react-start";

import { steamId64ToSteamId3 } from "~/lib/steam";

/** A Steam custom URL name: letters, digits, `_` and `-`, at most 32 characters. */
const VANITY = /^[\w-]{2,32}$/;

/** Checks a request from the browser: one custom URL name, nothing else. */
export function validateVanityInput(input: unknown): string {
  if (typeof input !== "string" || !VANITY.test(input)) throw new Error("Invalid Steam custom URL");
  return input;
}

/** The SteamID64 in a community profile's XML (`<steamID64>7656…</steamID64>`), or undefined when there is none. */
export function steamId64OfProfileXml(xml: string): string | undefined {
  return /<steamID64>(\d{17})<\/steamID64>/.exec(xml)?.[1];
}

/**
 * The account behind a steamcommunity.com/id/<name> link, `null` when Steam knows no such profile. The profile's XML
 * needs no API key; it is fetched in the Worker since steamcommunity.com does not answer browsers across origins.
 */
export const resolveSteamVanity = createServerFn({ method: "GET" })
  .validator(validateVanityInput)
  .handler(async ({ data }): Promise<number | null> => {
    const response = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(data)}/?xml=1`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Steam answered ${response.status}`);
    const steamId64 = steamId64OfProfileXml(await response.text());
    return steamId64 ? steamId64ToSteamId3(steamId64) : null;
  });
