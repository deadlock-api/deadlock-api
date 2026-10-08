import { useState } from "react";

const is = Object.is;

function fastObjectShallowCompare(a: unknown, b: unknown) {
  if (a === b) {
    return true;
  }
  if (!(a instanceof Object) || !(b instanceof Object)) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;

  let aLength = 0;
  let bLength = 0;

  for (const key in left) {
    aLength += 1;

    if (!is(left[key], right[key])) {
      return false;
    }
    if (!(key in right)) {
      return false;
    }
  }

  for (const _ in right) {
    bLength += 1;
  }
  return aLength === bLength;
}

export function useDraftValue<T>(sourceValue: T) {
  const [draft, setDraft] = useState(sourceValue);
  const [prevSource, setPrevSource] = useState(sourceValue);

  if (!fastObjectShallowCompare(prevSource, sourceValue)) {
    setPrevSource(sourceValue);
    setDraft(sourceValue);
  }

  return [draft, setDraft] as const;
}
