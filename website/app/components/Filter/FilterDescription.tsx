import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";

// --- Context for automatic filter description assembly ---

interface FilterDescriptionContextValue {
  register: (key: string, value: string | null) => void;
}

const FilterDescCtx = createContext<FilterDescriptionContextValue | null>(null);

/**
 * Call from inside a Filter.* sub-component to register a description fragment.
 * When the value is null, the segment is removed from the description.
 */
export function useRegisterFilterPart(key: string, value: string | null | undefined) {
  const ctx = useContext(FilterDescCtx);
  useLayoutEffect(() => {
    ctx?.register(key, value ?? null);
    return () => {
      ctx?.register(key, null);
    };
  }, [ctx, key, value]);
}

/**
 * Register multiple description fragments at once.
 * Avoids hooks-in-loop issues when a single filter contributes multiple keys.
 */
export function useRegisterFilterParts(parts: Record<string, string | null | undefined>) {
  const ctx = useContext(FilterDescCtx);
  const serialized = JSON.stringify(parts);
  useLayoutEffect(() => {
    const parsed = JSON.parse(serialized) as Record<string, string | null>;
    for (const [key, value] of Object.entries(parsed)) {
      ctx?.register(key, value ?? null);
    }
    return () => {
      for (const key of Object.keys(parsed)) {
        ctx?.register(key, null);
      }
    };
  }, [ctx, serialized]);
}

// --- Sentence builder ---

function Hl({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground/80">{children}</span>;
}

/**
 * Ordered segment definitions. Each entry defines a key (or key prefix for
 * dynamic keys like "minMatches:*"), a prefix phrase, and whether the value
 * itself is highlighted.
 */
const SEGMENT_DEFS: {
  key: string;
  prefix: string;
  dynamic?: boolean;
}[] = [
  { key: "gameMode", prefix: "" },
  { key: "dateRange", prefix: "between" },
  { key: "rankRange", prefix: "with rank" },
  { key: "hero", prefix: "on" },
  { key: "team", prefix: "on team" },
  { key: "region", prefix: "in" },
  { key: "viewMode", prefix: "showing" },
  { key: "dimension", prefix: "in" },
  { key: "items", prefix: "with" },
  { key: "minMatches:", prefix: "requiring", dynamic: true },
  { key: "sortBy", prefix: "sorted by" },
  { key: "sortDir", prefix: "" },
  { key: "duration", prefix: "lasting" },
  { key: "timeRange", prefix: "purchased" },
];

interface Segment {
  key: string;
  node: React.ReactNode;
}

function buildSentence(parts: Map<string, string>): Segment[] | null {
  if (parts.size === 0) return null;

  const segments: Segment[] = [{ key: "prefix", node: "Showing data from" }];

  for (const def of SEGMENT_DEFS) {
    if (def.dynamic) {
      const matches: string[] = [];
      for (const [k, v] of parts) {
        if (k.startsWith(def.key)) matches.push(v);
      }
      if (matches.length > 0) {
        segments.push({
          key: def.key,
          node: (
            <span>
              {def.prefix}{" "}
              {matches.map((v, i) => (
                <span key={v}>
                  {i > 0 ? ", " : ""}
                  <Hl>{v}</Hl>
                </span>
              ))}
            </span>
          ),
        });
      }
    } else {
      const value = parts.get(def.key);
      if (!value) continue;

      if (def.key === "gameMode") {
        segments.push({ key: "gameMode", node: <Hl>{value}</Hl> });
        segments.push({ key: "gameMode-suffix", node: "matches" });
        continue;
      }

      segments.push({
        key: def.key,
        node: (
          <span>
            {def.prefix} <Hl>{value}</Hl>
          </span>
        ),
      });
    }
  }

  return segments;
}

export function FilterDescriptionProvider({ children }: { children: React.ReactNode }) {
  const [parts, setParts] = useState(() => new Map<string, string>());

  const register = useCallback((key: string, value: string | null) => {
    setParts((prev) => {
      if (value != null) {
        if (prev.get(key) === value) return prev;
        const next = new Map(prev);
        next.set(key, value);
        return next;
      }
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const ctxValue = useMemo(() => ({ register }), [register]);

  const sentence = useMemo(() => buildSentence(parts), [parts]);

  return (
    <FilterDescCtx.Provider value={ctxValue}>
      {children}
      {sentence && (
        <p className="w-full text-center text-xs text-muted-foreground">
          {sentence.map((segment, i) => (
            <span key={segment.key}>
              {i > 0 ? " " : ""}
              {segment.node}
            </span>
          ))}
          .
        </p>
      )}
    </FilterDescCtx.Provider>
  );
}
