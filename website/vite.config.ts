import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import babel from "vite-plugin-babel";

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
        filter: ({ path }) => !path.startsWith("/auth/"),
      },
      pages: [{ path: "/" }, { path: "/blog" }],
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
