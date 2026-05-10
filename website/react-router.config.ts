import type { Config } from "@react-router/dev/config";

import { getAllSlugs } from "./app/lib/blog";

export default {
  ssr: true,
  future: {
    v8_viteEnvironmentApi: true,
  },
  async prerender() {
    const blogSlugs = getAllSlugs();
    // Analytics routes (heroes, items, abilities, leaderboard, badge-distribution, games, heatmap,
    // player-scoreboard, servers) are SSRed per request so loader-prefetched data stays fresh.
    return [
      "/",
      "/chat",
      "/streamkit",
      "/data-privacy",
      "/ingest-cache",
      "/blog",
      ...blogSlugs.map((slug) => `/blog/${slug}`),
    ];
  },
} satisfies Config;
