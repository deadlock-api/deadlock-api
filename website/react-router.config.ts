import type { Config } from "@react-router/dev/config";

import { getAllSlugs } from "./app/lib/blog";

export default {
  ssr: false,
  async prerender() {
    const blogSlugs = getAllSlugs();
    return [
      "/",
      "/heroes",
      "/items",
      "/abilities",
      "/leaderboard",
      "/badge-distribution",
      "/chat",
      "/streamkit",
      "/data-privacy",
      "/ingest-cache",
      "/games",
      "/heatmap",
      "/player-scoreboard",
      "/blog",
      ...blogSlugs.map((slug) => `/blog/${slug}`),
    ];
  },
} satisfies Config;
