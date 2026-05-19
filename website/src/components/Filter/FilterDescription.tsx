import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// --- Context for automatic filter description assembly ---

interface FilterDescriptionContextValue {
  registerSync: (key: string, value: string | null) => void;
  registerEffect: (key: string, value: string | null) => void;
}

const FilterDescCtx = createContext<FilterDescriptionContextValue | null>(null);

/**
 * Call from inside a Filter.* sub-component to register a description fragment.
 * Writes to a render-phase mutable Map (for SSR) and updates state via effect
 * (for client-side change tracking and cleanup).
 */
export function useRegisterFilterPart(key: string, value: string | null | undefined) {
  const ctx = useContext(FilterDescCtx);
  ctx?.registerSync(key, value ?? null);
  useLayoutEffect(() => {
    ctx?.registerEffect(key, value ?? null);
    return () => {
      ctx?.registerEffect(key, null);
    };
  }, [ctx, key, value]);
}

/**
 * Register multiple description fragments at once.
 */
export function useRegisterFilterParts(parts: Record<string, string | null | undefined>) {
  const ctx = useContext(FilterDescCtx);
  if (ctx) {
    for (const [k, v] of Object.entries(parts)) {
      ctx.registerSync(k, v ?? null);
    }
  }
  const serialized = JSON.stringify(parts);
  useLayoutEffect(() => {
    const parsed = JSON.parse(serialized) as Record<string, string | null>;
    for (const [k, v] of Object.entries(parsed)) {
      ctx?.registerEffect(k, v ?? null);
    }
    return () => {
      for (const k of Object.keys(parsed)) {
        ctx?.registerEffect(k, null);
      }
    };
  }, [ctx, serialized]);
}

// --- Sentence builder ---

function Hl({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground/80">{children}</span>;
}

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

function FilterDescriptionDisplay({
  parts,
  partsRef,
}: {
  parts: Map<string, string>;
  partsRef: RefObject<Map<string, string>>;
}) {
  // On SSR/first paint, effect-driven `parts` is empty but `partsRef` is populated
  // by render-phase writes from filter children. Once effects fire on the client,
  // `parts` mirrors `partsRef` and becomes the source of re-render reactivity.
  // oxlint-disable-next-line react-hooks-js/refs -- intentional: render-phase fallback for SSR
  const source = parts.size > 0 ? parts : partsRef.current;
  const sentence = useMemo(() => buildSentence(source), [source]);
  if (!sentence) return null;
  return (
    <p className="w-full text-center text-xs text-muted-foreground">
      {sentence.map((segment, i) => (
        <span key={segment.key}>
          {i > 0 ? " " : ""}
          {segment.node}
        </span>
      ))}
      .
    </p>
  );
}

export function FilterDescriptionProvider({ children }: { children: React.ReactNode }) {
  const partsRef = useRef<Map<string, string>>(new Map());
  const [parts, setParts] = useState(() => new Map<string, string>());

  const registerSync = useCallback((key: string, value: string | null) => {
    if (value != null) {
      partsRef.current.set(key, value);
    } else {
      partsRef.current.delete(key);
    }
  }, []);

  const registerEffect = useCallback((key: string, value: string | null) => {
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

  const ctxValue = useMemo<FilterDescriptionContextValue>(
    () => ({ registerSync, registerEffect }),
    [registerSync, registerEffect],
  );

  return (
    <FilterDescCtx.Provider value={ctxValue}>
      {children}
      <FilterDescriptionDisplay parts={parts} partsRef={partsRef} />
    </FilterDescCtx.Provider>
  );
}
