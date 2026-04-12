import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import babel from "vite-plugin-babel";

import { ogImages } from "./plugins/vite-plugin-og-images";

const ReactCompilerConfig = {};

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    ogImages(),
    reactRouter(),
    // React Compiler via Babel is slow — only run it for production builds
    ...(!isDev
      ? [
          babel({
            include: ["./app/**/*"],
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
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
      "@tanstack/react-query",
      "recharts",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "framer-motion",
      "posthog-js",
      "nuqs",
      "fuse.js",
      "react-markdown",
      "dayjs",
      "axios",
    ],
  },
});
