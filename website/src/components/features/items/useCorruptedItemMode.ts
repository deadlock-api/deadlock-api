import { parseAsStringLiteral, useQueryState } from "nuqs";

import { CORRUPTED_ITEM_MODES, type CorruptedItemMode } from "~/lib/corrupted-items";

const parseAsCorruptedItemMode = parseAsStringLiteral(CORRUPTED_ITEM_MODES).withDefault("exclude");

/**
 * Which purchases the item stats count, in the URL as `corrupted_items`: normal ones (`exclude`, the API default and
 * so left out of the URL), corrupted ones only, or both.
 */
export function useCorruptedItemMode() {
  return useQueryState("corrupted_items", parseAsCorruptedItemMode);
}

/** The request parameter for a mode: none for the default, so the request (and its cache entry) stays the loader's. */
export function corruptedItemsParam(mode: CorruptedItemMode): CorruptedItemMode | undefined {
  return mode === "exclude" ? undefined : mode;
}
