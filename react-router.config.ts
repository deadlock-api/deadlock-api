import type { Config } from "@react-router/dev/config";
export default {
  ssr: false,
  async prerender() {
    return ["/", "/heroes", "/items", "/abilities", "/leaderboard", "/badge-distribution", "/chat", "/streamkit"];
  },
} satisfies Config;
