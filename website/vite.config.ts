import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import babel from "vite-plugin-babel";

const ReactCompilerConfig = {};
const isDev = process.env.NODE_ENV !== "production";

const DYNAMIC_ROUTES = new Set([
  "/heroes",
  "/items",
  "/abilities",
  "/badge-distribution",
  "/leaderboard",
  "/games",
  "/servers",
  "/heatmap",
  "/player-scoreboard",
]);

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // Skip routes whose loaders fetch live analytics data — they would force
        // the build to depend on the API and break when data is missing (e.g.
        // immediately after a patch ships). These render via SSR at request time.
        filter: ({ path }) => !DYNAMIC_ROUTES.has(path) && path !== "/auth" && path !== "/auth/patreon",
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
