import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ariaSort as ariaSortOf, type SortDir } from "~/components/ui/sort-button";

export interface SortState<Key extends string> {
  key: Key;
  dir: SortDir;
}

/** The direction a column sorts in when it is first picked: one for all, or per column (names A to Z, numbers down). */
export type FirstSortDir<Key extends string> = SortDir | ((key: Key) => SortDir);

/** The sort after a press on `key`'s header: the active column flips, another one starts in its first direction. */
export function nextSort<Key extends string>(
  current: SortState<Key>,
  key: Key,
  firstDir: FirstSortDir<Key> = "desc",
): SortState<Key> {
  if (current.key === key) return { key, dir: current.dir === "desc" ? "asc" : "desc" };
  return { key, dir: typeof firstDir === "function" ? firstDir(key) : firstDir };
}

/**
 * The sort of a table, headless: which column, which way, what a header press does and what its `aria-sort` says.
 * Controlled with `value` / `onValueChange` (the URL, a parent), uncontrolled with `defaultValue`.
 */
export function useSort<Key extends string>({
  value,
  defaultValue,
  onValueChange,
  firstDir = "desc",
}: (
  | { value: SortState<Key>; onValueChange: (value: SortState<Key>) => void; defaultValue?: never }
  | { value?: never; defaultValue: SortState<Key>; onValueChange?: (value: SortState<Key>) => void }
) & { firstDir?: FirstSortDir<Key> }) {
  const [sort, setSort] = useControllableState({
    value,
    defaultValue: defaultValue ?? value,
    onValueChange,
  });
  return {
    sortKey: sort.key,
    dir: sort.dir,
    /** A press on `key`'s header. */
    toggle: (key: Key) => setSort(nextSort(sort, key, firstDir)),
    /** `aria-sort` of `key`'s header cell. */
    ariaSort: (key: Key) => ariaSortOf(sort.key === key, sort.dir),
    setSort,
  };
}

/**
 * Two URL params, the key and the direction, as `useSort`'s `value` / `onValueChange`. Each is the `[value, set]`
 * pair a URL state hook returns (nuqs' `useQueryState`); `options` reach both setters, so one press is one update.
 */
export function sortParams<Key extends string, Options = undefined>(
  [key, setKey]: readonly [Key, (key: Key, options?: Options) => unknown],
  [dir, setDir]: readonly [SortDir, (dir: SortDir, options?: Options) => unknown],
  options?: Options,
): { value: SortState<Key>; onValueChange: (value: SortState<Key>) => void } {
  return {
    value: { key, dir },
    onValueChange: (next) => {
      void setKey(next.key, options);
      void setDir(next.dir, options);
    },
  };
}
