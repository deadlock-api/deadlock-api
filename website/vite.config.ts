import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { annotateSource } from "./plugins/annotate-source.mjs";

const annotation = annotateSource();

// recharts imports es-toolkit's deep `es-toolkit/compat/<name>` modules, whose
// package export map only resolves to CommonJS (no `import` condition). The
// bundler's CJS interop wraps each in a lazy accessor whose name collides with the local
// it references (`var require_identity = require_identity()`); minified, that
// becomes a self-referential `n=n()` that throws "n is not a function" at runtime
// and crashes the charts. Redirect those default imports to the named
// export on the ESM barrel (`es-toolkit/compat`, which has a clean `import`
// condition) so the CJS interop is never involved.
function esToolkitCompatEsm(): Plugin {
  const DEEP = /^es-toolkit\/compat\/([a-zA-Z0-9_]+)$/;
  const VIRTUAL = "\0es-toolkit-compat:";
  // name -> absolute path of the resolved ESM barrel (per environment).
  const barrels = new Map<string, string>();
  return {
    name: "es-toolkit-compat-esm",
    enforce: "pre",
    async resolveId(id, importer) {
      const m = DEEP.exec(id);
      if (!m) return null;
      // Resolve the ESM barrel via the bundler so the `import` condition wins
      // (deep `es-toolkit/compat/<name>` paths only resolve to CommonJS).
      const barrel = await this.resolve("es-toolkit/compat", importer, { skipSelf: true });
      if (!barrel) return null;
      barrels.set(m[1], barrel.id);
      return VIRTUAL + m[1];
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const name = id.slice(VIRTUAL.length);
      const target = barrels.get(name);
      if (!target) return null;
      return `export { ${name} as default } from ${JSON.stringify(target)};`;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    esToolkitCompatEsm(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: ({ path }) =>
          // Tracker pages are patron-gated and per-user; prerendering them would bake gate HTML.
          path !== "/auth" && path !== "/auth/patreon" && !/^\/players\/\d+$/.test(path),
      },
      pages: [{ path: "/" }, { path: "/blog" }, { path: "/sitemap.xml" }, { path: "/sitemap_index.xml" }],
    }),
    annotation.vitePlugin,
    viteReact({ compiler: true }),
    tailwindcss(),
  ],
});
