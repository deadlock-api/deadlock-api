import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND_COLOR = "#fa4454";
const BG_COLOR = "#09090b";

interface OGPage {
  filename: string;
  title: string;
  subtitle: string;
}

const PAGES: OGPage[] = [
  {
    filename: "default.png",
    title: "Deadlock API",
    subtitle: "Game stats, hero analytics, item data & leaderboards",
  },
  {
    filename: "heroes.png",
    title: "Hero Stats & Analytics",
    subtitle: "Win rates, pick rates, matchups & performance data",
  },
  {
    filename: "items.png",
    title: "Item Stats & Build Analytics",
    subtitle: "Win rates, purchase timing, confidence intervals & combos",
  },
  {
    filename: "abilities.png",
    title: "Ability Stats & Upgrade Paths",
    subtitle: "Optimal skill orders & ability win rates by rank",
  },
  {
    filename: "leaderboard.png",
    title: "Ranked Leaderboard",
    subtitle: "Top players by region, hero filters & player search",
  },
  {
    filename: "badge-distribution.png",
    title: "Rank Distribution",
    subtitle: "Average Match rank distribution data over time",
  },
  {
    filename: "games.png",
    title: "Live Games",
    subtitle: "Active matches and recent game results",
  },
  {
    filename: "heatmap.png",
    title: "Kill & Death Heatmap",
    subtitle: "Visualize where fights happen on the map",
  },
  {
    filename: "player-scoreboard.png",
    title: "Player Scoreboard",
    subtitle: "Top player performances ranked by various stats",
  },
  {
    filename: "streamkit.png",
    title: "Stream Toolkit",
    subtitle: "Chatbot commands & OBS overlay widgets for streamers",
  },
  {
    filename: "chat.png",
    title: "AI Chat Assistant",
    subtitle: "Ask questions about Deadlock game data",
  },
  {
    filename: "ingest-cache.png",
    title: "Community Match Ingest",
    subtitle: "Scan your Steam cache to contribute match data",
  },
  {
    filename: "blog.png",
    title: "Blog",
    subtitle: "Engineering posts, data analyses & project updates",
  },
];

/** Read blog post frontmatter from markdown files and JSX post registry in blog.ts */
function loadBlogPages(): OGPage[] {
  const pages: OGPage[] = [];

  // Scan markdown blog posts
  const blogDir = join(process.cwd(), "content", "blog");
  try {
    const files = readdirSync(blogDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const raw = readFileSync(join(blogDir, file), "utf-8");
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!match) continue;

      const yaml = match[1];
      const title = yaml.match(/^title:\s*"?([^"\n]+)"?/m)?.[1]?.trim() ?? file.replace(".md", "");
      const slug = file.replace(".md", "");
      pages.push({ filename: `blog-${slug}.png`, title, subtitle: "Deadlock API Blog" });
    }
  } catch {
    // No markdown blog directory
  }

  // Scan JSX blog posts from app/lib/blog.ts
  try {
    const blogTs = readFileSync(join(process.cwd(), "app", "lib", "blog.ts"), "utf-8");
    const slugRegex = /slug:\s*"([^"]+)"/g;
    const titleRegex = /title:\s*"([^"]+)"/g;

    // Extract all slug/title pairs from jsxPosts array
    const jsxSection = blogTs.split("const jsxPosts")[1];
    if (jsxSection) {
      const slugs = [...jsxSection.matchAll(slugRegex)].map((m) => m[1]);
      const titles = [...jsxSection.matchAll(titleRegex)].map((m) => m[1]);
      for (let i = 0; i < slugs.length; i++) {
        pages.push({
          filename: `blog-${slugs[i]}.png`,
          title: titles[i] ?? slugs[i],
          subtitle: "Deadlock API Blog",
        });
      }
    }
  } catch {
    // blog.ts not found
  }

  return pages;
}

function createCard(page: OGPage) {
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: BG_COLOR,
        position: "relative",
        overflow: "hidden",
      },
      children: [
        // Radial glow
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: "-100px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "800px",
              height: "500px",
              borderRadius: "50%",
              background: `radial-gradient(ellipse, ${BRAND_COLOR}18 0%, transparent 70%)`,
            },
          },
        },
        // Bottom accent bar
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              height: "4px",
              background: `linear-gradient(90deg, transparent, ${BRAND_COLOR}, transparent)`,
            },
          },
        },
        // Content
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "60px 80px",
              zIndex: 1,
            },
            children: [
              // Title
              {
                type: "div",
                props: {
                  style: {
                    fontSize: page.filename === "default.png" ? "72px" : "64px",
                    fontWeight: 700,
                    color: "#fafafa",
                    lineHeight: 1.1,
                    marginBottom: "24px",
                  },
                  children: page.title,
                },
              },
              // Subtitle
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "28px",
                    fontWeight: 400,
                    color: "#a1a1aa",
                    lineHeight: 1.4,
                  },
                  children: page.subtitle,
                },
              },
              // Branding
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "48px",
                    fontSize: "20px",
                    fontWeight: 500,
                    color: BRAND_COLOR,
                  },
                  children: "deadlock-api.com",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  // Fetch static TTF weights from Google Fonts (satori requires TTF/OTF, not woff2)
  const fetchFont = async (weight: number): Promise<ArrayBuffer> => {
    // Use a user-agent that triggers TTF response from Google Fonts
    const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
      },
    });
    const css = await cssRes.text();
    const fontUrl = css.match(/src:\s*url\(([^)]+)\)\s*format/)?.[1];
    if (!fontUrl) throw new Error(`Could not find font URL for weight ${weight}`);
    const fontRes = await fetch(fontUrl);
    return await fontRes.arrayBuffer();
  };

  const [regular, bold] = await Promise.all([fetchFont(400), fetchFont(700)]);
  return { regular, bold };
}

export async function generateOGImages(outDir: string) {
  const ogDir = join(outDir, "og");
  mkdirSync(ogDir, { recursive: true });

  const fonts = await loadFonts();
  const allPages = [...PAGES, ...loadBlogPages()];

  for (const page of allPages) {
    // eslint-disable-next-line no-await-in-loop -- sequential generation to avoid memory spikes
    const svg = await satori(createCard(page) as Parameters<typeof satori>[0], {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        {
          name: "Inter",
          data: fonts.regular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: fonts.bold,
          weight: 700,
          style: "normal",
        },
      ],
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    writeFileSync(join(ogDir, page.filename), pngBuffer);
  }

  return allPages.map((p) => p.filename);
}
