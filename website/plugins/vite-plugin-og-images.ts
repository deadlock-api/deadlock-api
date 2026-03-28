import { join } from "node:path";

import type { Plugin } from "vite";

export function ogImages(): Plugin {
  let isBuild = false;
  return {
    name: "og-images",
    config(_, env) {
      isBuild = env.command === "build";
    },
    async buildStart() {
      if (!isBuild) return;
      const { generateOGImages } = await import("../scripts/generate-og-images.js");
      const outDir = join(process.cwd(), "public");
      const files = await generateOGImages(outDir);
      console.log(`[og-images] Generated ${files.length} OG images: ${files.join(", ")}`);
    },
  };
}
