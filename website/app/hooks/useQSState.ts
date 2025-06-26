import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { type Dayjs, day } from "../dayjs";

// Type definitions for better inference
export type Serializer<T> = {
  parse: (value: string) => T;
  stringify: (value: T) => string;
};

type QueryStateOptions<T> = {
  defaultValue?: T;
  serializer?: Serializer<T>;
  replaceState?: boolean;
  debounceMs?: number;
};

// Built-in serializers for common types
export const serializers = {
  string: {
    parse: (v: string) => v,
    stringify: (v: string) => v,
  },
  number: {
    parse: (v: string) => {
      const num = Number(v);
      return Number.isNaN(num) ? 0 : num;
    },
    stringify: (v: number) => v.toString(),
  },
  boolean: {
    parse: (v: string) => v === "true",
    stringify: (v: boolean) => v.toString(),
  },
  json: <T>(): Serializer<T> => ({
    parse: (v: string) => {
      try {
        return JSON.parse(v);
      } catch {
        return {} as T;
      }
    },
    stringify: (v: T) => JSON.stringify(v),
  }),
  array: <T>(itemSerializer: Serializer<T>): Serializer<T[]> => ({
    parse: (v: string) => {
      const items = v.split(",").filter(Boolean);
      return items.map((item) => itemSerializer.parse(item));
    },
    stringify: (v: T[]) => v.map((item) => itemSerializer.stringify(item)).join(","),
  }),
  set: <T>(itemSerializer: Serializer<T>): Serializer<Set<T>> => ({
    parse: (v: string) => {
      const items = v.split(",").filter(Boolean);
      return new Set(items.map((item) => itemSerializer.parse(item)));
    },
    stringify: (v: Set<T>) =>
      Array.from(v)
        .map((item) => itemSerializer.stringify(item))
        .join(","),
  }),
  date: {
    parse: (v: string) => new Date(v),
    stringify: (v: Date) => v.toISOString(),
  },
  // Helper for creating custom serializers
  custom: <T>(parse: (v: string) => T, stringify: (v: T) => string): Serializer<T> => ({
    parse,
    stringify,
  }),
} as const;

export const dayjsSerializer = serializers.custom(
  (v: string) => day(v),
  (v: Dayjs) => v.toISOString(),
);
export const dayjsRangeSerializer = serializers.custom(
  (v: string) => v.split("_").map((v) => (v ? day(v) : undefined)) as [Dayjs | undefined, Dayjs | undefined],
  (v: [Dayjs | undefined, Dayjs | undefined]) => `${v[0]?.toISOString() ?? ""}_${v[1]?.toISOString() ?? ""}`,
);

// Main hook with conditional types for better inference
export function useQSState<T>(
  key: string,
  options: QueryStateOptions<T> & { defaultValue: T },
): [T, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSState<T>(
  key: string,
  options?: QueryStateOptions<T>,
): [T | undefined, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSState<T>(
  key: string,
  options: QueryStateOptions<T> = {},
): [T | undefined, (value: T | undefined) => void, { loading: boolean; error: Error | null }] {
  const {
    defaultValue,
    serializer = serializers.string as unknown as Serializer<T>,
    replaceState = false,
    debounceMs = 0,
  } = options;

  const location = useLocation();
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Parse value from URL
  const parseValue = useCallback(
    (search: string): T | undefined => {
      try {
        const params = new URLSearchParams(search);
        const rawValue = params.get(key);

        if (rawValue === null) {
          return defaultValue;
        }

        return serializer.parse(rawValue);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to parse query parameter"));
        return defaultValue;
      }
    },
    [key, defaultValue, serializer],
  );

  // Initialize state from URL
  const [value, setValue] = useState<T | undefined>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    return parseValue(window.location.search);
  });

  // Update URL when value changes
  const updateValue = useCallback(
    (newValue: T | undefined) => {
      setError(null);
      setValue(newValue);

      if (typeof window === "undefined") {
        return;
      }

      const updateUrl = () => {
        setLoading(true);
        try {
          const params = new URLSearchParams(window.location.search);

          if (newValue === undefined || newValue === defaultValue) {
            params.delete(key);
          } else {
            params.set(key, serializer.stringify(newValue));
          }

          const newSearch = params.toString();
          const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ""}${window.location.hash}`;

          if (replaceState) {
            window.history.replaceState(null, "", newUrl);
          } else {
            navigate(newUrl, { replace: false, preventScrollReset: true });
          }
        } catch (err) {
          setError(err instanceof Error ? err : new Error("Failed to update URL"));
        } finally {
          setLoading(false);
        }
      };

      // Handle debouncing
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (debounceMs > 0) {
        debounceRef.current = setTimeout(updateUrl, debounceMs);
      } else {
        updateUrl();
      }
    },
    [key, defaultValue, serializer, replaceState, navigate, debounceMs],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Update value from URL
  useEffect(() => {
    setValue(parseValue(location.search));
  }, [location.search]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return [value, updateValue, { loading, error }];
}

// Convenience hooks for common types with proper overloads
export function useQSString<T extends string>(
  key: string,
  defaultValue: T,
): [T, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSString<T extends string>(
  key: string,
): [T | undefined, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSString(
  key: string,
  defaultValue?: string,
): [string | undefined, (value: string | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined ? { defaultValue, serializer: serializers.string } : { serializer: serializers.string },
  );
}

export function useQSNumber(
  key: string,
  defaultValue: number,
): [number, (value: number | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSNumber(
  key: string,
): [number | undefined, (value: number | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSNumber(
  key: string,
  defaultValue?: number,
): [number | undefined, (value: number | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined ? { defaultValue, serializer: serializers.number } : { serializer: serializers.number },
  );
}

export function useQSBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (value: boolean | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSBoolean(
  key: string,
): [boolean | undefined, (value: boolean | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSBoolean(
  key: string,
  defaultValue?: boolean,
): [boolean | undefined, (value: boolean | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined
      ? { defaultValue, serializer: serializers.boolean }
      : { serializer: serializers.boolean },
  );
}

export function useQSArray<T>(
  key: string,
  itemSerializer: Serializer<T>,
  defaultValue: T[],
): [T[], (value: T[] | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSArray<T>(
  key: string,
  itemSerializer: Serializer<T>,
): [T[] | undefined, (value: T[] | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSArray<T>(
  key: string,
  itemSerializer: Serializer<T>,
  defaultValue?: T[],
): [T[] | undefined, (value: T[] | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined
      ? { defaultValue, serializer: serializers.array(itemSerializer) }
      : { serializer: serializers.array(itemSerializer) },
  );
}

export function useQSSet<T>(
  key: string,
  itemSerializer: Serializer<T>,
  defaultValue: Set<T>,
): [Set<T>, (value: Set<T> | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSSet<T>(
  key: string,
  itemSerializer: Serializer<T>,
): [Set<T> | undefined, (value: Set<T> | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSSet<T>(
  key: string,
  itemSerializer: Serializer<T>,
  defaultValue?: Set<T>,
): [Set<T> | undefined, (value: Set<T> | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined
      ? { defaultValue, serializer: serializers.set(itemSerializer) }
      : { serializer: serializers.set(itemSerializer) },
  );
}

export function useQSJSON<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSJSON<T>(
  key: string,
): [T | undefined, (value: T | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSJSON<T>(
  key: string,
  defaultValue?: T,
): [T | undefined, (value: T | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined
      ? { defaultValue, serializer: serializers.json<T>() }
      : { serializer: serializers.json<T>() },
  );
}

export function useQSDayjs(
  key: string,
  defaultValue: Dayjs,
): [Dayjs, (value: Dayjs | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSDayjs(
  key: string,
): [Dayjs | undefined, (value: Dayjs | undefined) => void, { loading: boolean; error: Error | null }];

export function useQSDayjs(
  key: string,
  defaultValue?: Dayjs,
): [Dayjs | undefined, (value: Dayjs | undefined) => void, { loading: boolean; error: Error | null }] {
  return useQSState(
    key,
    defaultValue !== undefined ? { defaultValue, serializer: dayjsSerializer } : { serializer: dayjsSerializer },
  );
}

export function useQSDayjsRange(
  key: string,
  defaultValue: [Dayjs | undefined, Dayjs | undefined],
): [
  [Dayjs | undefined, Dayjs | undefined],
  (value: [Dayjs | undefined, Dayjs | undefined] | undefined) => void,
  { loading: boolean; error: Error | null },
];

export function useQSDayjsRange(
  key: string,
): [
  [Dayjs | undefined, Dayjs | undefined] | undefined,
  (value: [Dayjs | undefined, Dayjs | undefined] | undefined) => void,
  { loading: boolean; error: Error | null },
];

export function useQSDayjsRange(
  key: string,
  defaultValue?: [Dayjs | undefined, Dayjs | undefined],
): [
  [Dayjs | undefined, Dayjs | undefined] | undefined,
  (value: [Dayjs | undefined, Dayjs | undefined] | undefined) => void,
  { loading: boolean; error: Error | null },
] {
  return useQSState(
    key,
    defaultValue !== undefined
      ? { defaultValue, serializer: dayjsRangeSerializer }
      : { serializer: dayjsRangeSerializer },
  );
}

// Hook for managing multiple query parameters
export function useQSStates<T extends Record<string, unknown>>(
  schema: {
    [K in keyof T]: {
      defaultValue?: T[K];
      serializer?: Serializer<T[K]>;
    };
  },
): [T, (updates: Partial<T>) => void, { loading: boolean; error: Error | null }] {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Parse all values
  const parseValues = useCallback((): T => {
    const params = new URLSearchParams(location.search);
    const result = {} as T;

    for (const [key, config] of Object.entries(schema)) {
      const rawValue = params.get(key);
      const { defaultValue, serializer = serializers.string } = config;

      if (rawValue === null) {
        result[key as keyof T] = defaultValue;
      } else {
        try {
          result[key as keyof T] = serializer.parse(rawValue);
        } catch {
          result[key as keyof T] = defaultValue;
        }
      }
    }

    return result;
  }, [location.search, schema]);

  const values = parseValues();

  // Update multiple values at once
  const updateValues = useCallback(
    (updates: Partial<T>) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams(window.location.search);

        for (const [key, value] of Object.entries(updates)) {
          const config = schema[key];
          if (!config) continue;

          const { defaultValue, serializer = serializers.string } = config;

          if (value === undefined || value === defaultValue) {
            params.delete(key);
          } else {
            params.set(key, serializer.stringify(value));
          }
        }

        const newSearch = params.toString();
        const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ""}${window.location.hash}`;

        navigate(newUrl, { replace: false, preventScrollReset: true });
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to update URL"));
      } finally {
        setLoading(false);
      }
    },
    [schema, navigate],
  );

  return [values, updateValues, { loading, error }];
}

// Example usage:
/*
// Simple string parameter - with default value
const [search, setSearch] = useQSString('search', '');

// Simple string parameter - without default value (can be undefined)
const [filter, setFilter] = useQSString('filter');

// Number parameter - with default
const [page, setPage] = useQSNumber('page', 1);

// Number parameter - without default (can be undefined)
const [userId, setUserId] = useQSNumber('userId');

// Boolean parameter - with default
const [showDetails, setShowDetails] = useQSBoolean('details', false);

// Boolean parameter - without default (can be undefined)
const [isActive, setIsActive] = useQSBoolean('active');

// Array parameter - with default
const [tags, setTags] = useQSArray('tags', serializers.string, []);

// Array parameter - without default (can be undefined)
const [categories, setCategories] = useQSArray('categories', serializers.string);

// Set parameters - with default
const [selectedIds, setSelectedIds] = useQSSet('ids', serializers.number, new Set([1, 2, 3]));

// Set parameters - without default (can be undefined)
const [permissions, setPermissions] = useQSSet('permissions', serializers.string);

// JSON parameter - with default
const [filters, setFilters] = useQSJSON<{ category: string; price: number }>('filters', {
  category: 'all',
  price: 0
});

// JSON parameter - without default (can be undefined)
const [metadata, setMetadata] = useQSJSON<{ name: string; value: string }>('metadata');

// Dayjs - with default
const [startDate, setStartDate] = useQSDayjs('startDate', day());

// Dayjs - without default (can be undefined)
const [endDate, setEndDate] = useQSDayjs('endDate');

// Custom enum example
enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

const statusSerializer = serializers.custom(
  (v: string) => v as Status,
  (v: Status) => v
);

// With default
const [status, setStatus] = useQSState('status', {
  defaultValue: Status.Active,
  serializer: statusSerializer
});

// Without default (can be undefined)
const [userStatus, setUserStatus] = useQSState<Status>('userStatus', {
  serializer: statusSerializer
});

// Multiple parameters at once
const [params, setParams] = useQSStates({
  search: { defaultValue: '' },
  page: { defaultValue: 1, serializer: serializers.number },
  sort: { defaultValue: 'name' },
  selectedTags: { 
    defaultValue: new Set<string>(), 
    serializer: serializers.set(serializers.string) 
  },
  filters: { 
    defaultValue: { category: 'all', price: 0 }, 
    serializer: serializers.json<{ category: string; price: number }>() 
  },
  // This one has no default, so it can be undefined
  userId: { serializer: serializers.number }
});

// Update multiple at once
setParams({ search: 'new search', page: 2 });
*/
