import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ogImages } from "./plugins/vite-plugin-og-images";

export default defineConfig({
  plugins: [ogImages(), reactRouter(), tsconfigPaths(), tailwindcss()],
});
