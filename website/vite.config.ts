import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import babel from "vite-plugin-babel";

const ReactCompilerConfig = {};
const isDev = process.env.NODE_ENV !== "production";

// recharts imports es-toolkit's deep `es-toolkit/compat/<name>` modules, whose
// package export map only resolves to CommonJS (no `import` condition). The
// bundler's CJS interop wraps each in a lazy accessor whose name collides with the local
// it references (`var require_identity = require_identity()`); minified, that
// becomes a self-referential `n=n()` that throws "n is not a function" at runtime
// and crashes the coach charts. Redirect those default imports to the named
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
        filter: ({ path }) => path !== "/auth" && path !== "/auth/patreon" && path !== "/servers",
      },
      pages: [{ path: "/" }, { path: "/blog" }, { path: "/sitemap.xml" }, { path: "/sitemap_index.xml" }],
    }),
    viteReact(),
    // React Compiler via Babel — only run for production builds (slow in dev)
    ...(!isDev
      ? [
          babel({
            include: ["./src/**/*"],
            filter: /\.[jt]sx?$/,
            babelConfig: {
              presets: ["@babel/preset-typescript"],
              plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
              sourceMaps: true,
            },
          }),
        ]
      : []),
    tailwindcss(),
  ],
});
