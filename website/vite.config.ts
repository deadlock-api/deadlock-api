import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { annotateSource } from "./plugins/annotate-source.mjs";
import { clientOnlyModules } from "./plugins/client-only-modules.mjs";
import { wasmModules } from "./plugins/wasm-modules.mjs";

// Server-only secrets from `.env` for the dev server, which renders in this Node process; the Worker gets them as
// Wrangler secrets. Without the `VITE_` prefix they never enter a bundle.
const serverEnv = loadEnv("development", process.cwd(), ["INCEPTION_", "OPENROUTER_"]);
for (const [name, value] of Object.entries(serverEnv)) process.env[name] ??= value;

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
  environments: {
    ssr: {
      resolve: {
        // The generated genql client uses extensionless relative imports (`./runtime`, `./types`), which Node's
        // native ESM loader rejects. Bundling it lets Vite resolve them in dev SSR and during prerendering.
        noExternal: ["deadlock_api_graphql_client"],
      },
      build: {
        rolldownOptions: {
          // workerd refuses to start when the worker module has a named export that is not a handler. Without this,
          // server-function internals shared between the entry and server-function chunks get re-exported from it.
          preserveEntrySignatures: "strict",
        },
      },
    },
  },
  plugins: [
    wasmModules(),
    esToolkitCompatEsm(),
    clientOnlyModules(),
    tanstackStart({
      router: {
        // Data loaders bring catalog/API clients with them. Load those only
        // for the selected route, just like its component.
        codeSplittingOptions: {
          defaultBehavior: [["loader"], ["component"], ["pendingComponent"], ["errorComponent"], ["notFoundComponent"]],
        },
      },
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: ({ path }) =>
          // Query variants share one output file; crawling them overwrites the default page's HTML.
          !path.includes("?") &&
          // Dev-only pages answer 404 in a production build, which the prerenderer treats as a failure.
          !/^\/dev(\/|$)/.test(path) &&
          // Filtered pages need request-specific server rendering; tracker pages are also patron-gated and per-user.
          !/^\/(analytics|community|tracker)(\/|$)/.test(path) &&
          // Patch pages compare live match data; a build-time copy would freeze the newest patch's numbers.
          !/^\/patches(\/|$)/.test(path) &&
          // Legacy paths only redirect (src/lib/site-route-migration.ts). The prerenderer follows a redirect and saves
          // the destination's HTML under the old path, which would then be served there instead of the 301.
          !/^\/(heroes|items|abilities|players|team-builder|leaderboard|badge-distribution|heatmap)(\/|$)/.test(path) &&
          !/^\/(deadlockdle|flashcards)(\/|$)/.test(path) &&
          // `/games` is a legacy redirect too, and the games under it are dealt per visit (today's puzzle, a shuffled
          // deck), which a build-time copy would freeze.
          !/^\/games(\/|$)/.test(path) &&
          // They render their query string (a shared ?sql= query, the Steam sign-in return): a static copy without it
          // failed hydration (React #418) and re-rendered the whole page on the client.
          !/^\/(data-dumps|streamkit)(\/|$)/.test(path) &&
          // A shared crosshair link previews that crosshair (its og:image comes from ?code=), which a static copy
          // would replace with the generic page's.
          path !== "/crosshair" &&
          // The Patreon callback's breadcrumbs link its parent segments, which have no page and answer 404.
          path !== "/auth" &&
          path !== "/auth/patreon",
      },
      pages: [{ path: "/" }, { path: "/blog" }, { path: "/sitemap.xml" }, { path: "/sitemap_index.xml" }],
    }),
    annotation.vitePlugin,
    viteReact({ compiler: true }),
    tailwindcss(),
  ],
});
