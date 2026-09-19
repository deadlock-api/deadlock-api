import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { parsePreferencesCookie } from "~/lib/preferences";

export const readPreferences = createIsomorphicFn()
  .server(() => parsePreferencesCookie(getRequestHeader("cookie")))
  .client(() => parsePreferencesCookie(document.cookie));
