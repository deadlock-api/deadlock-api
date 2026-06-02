import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import babel from "vite-plugin-babel";

import { DYNAMIC_DATA_ROUTES } from "./src/lib/dynamic-data-routes";

const ReactCompilerConfig = {};
const isDev = process.env.NODE_ENV !== "production";

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
        filter: ({ path }) => path !== "/auth" && path !== "/auth/patreon" && !DYNAMIC_DATA_ROUTES.has(path),
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
