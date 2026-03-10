import { useState } from "react";

const is = Object.is;

// https://github.com/mui/mui-x/blob/master/packages/x-internals/src/fastObjectShallowCompare/fastObjectShallowCompare.ts
function fastObjectShallowCompare<T extends Record<string, any> | null>(a: T, b: T) {
  if (a === b) {
    return true;
  }
  if (!(a instanceof Object) || !(b instanceof Object)) {
    return false;
  }

  let aLength = 0;
  let bLength = 0;

  /* eslint-disable guard-for-in */
  for (const key in a) {
    aLength += 1;

    if (!is(a[key], b[key])) {
      return false;
    }
    if (!(key in b)) {
      return false;
    }
  }

  /* eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars */
  for (const _ in b) {
    bLength += 1;
  }
  return aLength === bLength;
}

/**
 * Like `useState`, but resets to `sourceValue` whenever it changes externally.
 * Uses shallow equality (primitives, flat arrays, flat objects) to detect changes.
 *
 * Useful for sliders bound to URL state: `onValueChange` calls the setter
 * for responsive drag feedback, while external URL changes auto-reset the draft.
 */
export function useDraftValue<T>(sourceValue: T) {
  const [draft, setDraft] = useState(sourceValue);
  const [prevSource, setPrevSource] = useState(sourceValue);

  if (!fastObjectShallowCompare(prevSource as any, sourceValue as any)) {
    setPrevSource(sourceValue);
    setDraft(sourceValue);
  }

  return [draft, setDraft] as const;
}
