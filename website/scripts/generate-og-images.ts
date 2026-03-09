import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
];

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
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)" } }
    );
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

  for (const page of PAGES) {
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

  return PAGES.map((p) => p.filename);
}
