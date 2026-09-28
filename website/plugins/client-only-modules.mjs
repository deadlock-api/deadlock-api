import path from "node:path";

/**
 * Modules that only ever run in the browser, replaced by stubs in the server (Worker) build. A lazily imported module
 * still lands in the server bundle, and three.js, CodeMirror, DuckDB (with Arrow), PostHog and GSAP alone pushed the
 * Worker past the 3 MB (gzip) limit of the Workers Free plan.
 *
 * Only list a module here when the server can never execute it: a component rendered inside `<ClientOnly>`, or a
 * package imported from an effect or event handler. The stub renders nothing, so rendering one on the server would
 * mismatch on hydration; `<ClientOnly>` keeps the server and the first client render equal.
 */
const STUBS = {
  // Components, by source path: each export renders nothing.
  "src/components/features/heatmap/Heatmap3D.tsx": "export default function Heatmap3D() { return null; }",
  "src/components/features/data-dumps/SqlPlayground.tsx": "export function SqlPlayground() { return null; }",
  "src/components/features/deadlockdle/TargetCursor.tsx": "export function TargetCursor() { return null; }",
  // Packages only loaded with a dynamic `import()` from browser code.
  "posthog-js": "export default undefined;",
  "@duckdb/duckdb-wasm": "export {};",
};

const VIRTUAL = "\0client-only:";
/** The file names of the stubbed sources: only an import naming one is worth resolving. */
const SOURCE_NAMES = Object.keys(STUBS)
  .filter((key) => key.startsWith("src/"))
  .map((key) => path.basename(key, path.extname(key)));

/** @returns {import("vite").Plugin} */
export function clientOnlyModules() {
  const root = process.cwd();
  return {
    name: "client-only-modules",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.config.consumer === "server",
    async resolveId(id, importer, options) {
      if (id in STUBS) return VIRTUAL + id;
      if (!SOURCE_NAMES.some((name) => id.includes(name))) return null;
      const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const relative = path.relative(root, resolved.id.split("?")[0]).split(path.sep).join("/");
      return relative in STUBS ? VIRTUAL + relative : null;
    },
    load(id) {
      if (id.startsWith(VIRTUAL)) return STUBS[id.slice(VIRTUAL.length)];
      return null;
    },
  };
}
