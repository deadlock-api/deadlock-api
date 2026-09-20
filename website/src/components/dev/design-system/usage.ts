/**
 * How often the design system is used, counted from the source itself. Vite hands this dev-only module the text of
 * every source file; nothing here is written by hand, so the numbers move with the code.
 */
const SOURCES = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/components/dev/**",
    "!/src/**/*.test.{ts,tsx}",
    // Declaration files have no default export for Vite to hand over as text.
    "!/src/**/*.d.ts",
    "!/src/routeTree.gen.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

export interface UsageFile {
  /** Path under `src/`. */
  file: string;
  /** Times an element or function from the module is used in the file. */
  uses: number;
}

export interface Usage {
  uses: number;
  files: readonly UsageFile[];
  /** `files` by top-level area: features, routes, patterns, domain… */
  byArea: readonly (readonly [area: string, files: number])[];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function areaOf(file: string) {
  const parts = file.split("/");
  return parts[0] === "components" ? (parts[1] ?? "components") : parts[0];
}

/** The local names a file binds from `module`: named, aliased, default and namespace imports. */
function importedNames(text: string, module: RegExp) {
  const names: string[] = [];
  const statement = new RegExp(
    `import\\s+(?:type\\s+)?((?:[\\w$]+\\s*,\\s*)?(?:\\{[^}]*\\}|\\*\\s+as\\s+[\\w$]+)|[\\w$]+)\\s+from\\s+"${module.source}"`,
    "g",
  );
  for (const match of text.matchAll(statement)) {
    const clause = match[1];
    const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
    for (const part of named.split(",")) {
      const local = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local) names.push(local);
    }
    const bare = /^([\w$]+)\s*(?:,|$)/.exec(clause)?.[1];
    if (bare) names.push(bare);
    const namespace = /\*\s+as\s+([\w$]+)/.exec(clause)?.[1];
    if (namespace) names.push(namespace);
  }
  return names;
}

const cache = new Map<string, Usage>();

/**
 * Usage of one or more modules under `~/components/`, written as a Specimen writes its `source`:
 * `"ui/button"`, `"ui/stat · ui/delta"`, `"patterns/filter-bar/*"`.
 */
export function usageOf(source: string): Usage {
  const cached = cache.get(source);
  if (cached) return cached;

  const modules = source
    .split("·")
    .map((part) => part.trim())
    .filter((part) => /^(ui|patterns|domain)\//.test(part))
    .map((part) =>
      part.endsWith("/*")
        ? new RegExp(`~/components/${escapeRegExp(part.slice(0, -2))}/[\\w./-]+`)
        : new RegExp(`~/components/${escapeRegExp(part)}`),
    );

  const files: UsageFile[] = [];
  for (const [path, text] of Object.entries(SOURCES)) {
    let uses = 0;
    let imported = false;
    for (const module of modules) {
      for (const name of importedNames(text, module)) {
        imported = true;
        const element = new RegExp(`<${escapeRegExp(name)}[\\s/>.]`, "g");
        const call = new RegExp(`(?<![\\w$.<])${escapeRegExp(name)}\\s*[(\`]`, "g");
        uses += (text.match(element)?.length ?? 0) + (/^[a-z]/.test(name) ? (text.match(call)?.length ?? 0) : 0);
      }
    }
    if (imported) files.push({ file: path.replace(/^\/src\//, ""), uses });
  }
  files.sort((a, b) => b.uses - a.uses || a.file.localeCompare(b.file));

  const areas = new Map<string, number>();
  for (const { file } of files) areas.set(areaOf(file), (areas.get(areaOf(file)) ?? 0) + 1);

  const usage: Usage = {
    uses: files.reduce((sum, file) => sum + file.uses, 0),
    files,
    byArea: [...areas].sort((a, b) => b[1] - a[1]),
  };
  cache.set(source, usage);
  return usage;
}

const tokenCache = new Map<string, number>();

/** Times a color token is used: as a utility (`bg-card`, `hover:text-positive/80`) or as `var(--card)`. */
export function tokenUsage(token: string) {
  const cached = tokenCache.get(token);
  if (cached !== undefined) return cached;
  const name = escapeRegExp(token);
  const pattern = new RegExp(`(?<![\\w-])[a-z][a-z-]*-${name}(?![\\w-])|var\\(--(?:color-)?${name}\\)`, "g");
  let count = 0;
  for (const text of Object.values(SOURCES)) count += text.match(pattern)?.length ?? 0;
  tokenCache.set(token, count);
  return count;
}
