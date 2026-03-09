# SEO Action Plan — deadlock-api.com

**Current Score: 68/100**
**Target Score: 85+/100**

---

## HIGH — Fix Within 1 Week

### 1. Create proper OG images (1200x630px)

**Problem**: OG image is the 512x512 favicon. Social shares (Discord, Twitter/X, Facebook) display a tiny, poorly cropped image. `twitter:card` is set to `summary_large_image` which expects a 2:1 aspect ratio.

**Fix**: Design OG images at 1200x630px. At minimum:
- `/public/og/default.png` — generic site card
- `/public/og/heroes.png` — hero analytics card
- `/public/og/items.png` — item analytics card
- `/public/og/leaderboard.png` — leaderboard card

**Status**: Code infrastructure done (per-route OG image mapping in `meta.ts`, `/public/og/` directory created). **Still need to design and place the actual image files.**

---

### 2. Evaluate enabling SSR for public routes

**Problem**: `ssr: false` means all content is client-rendered. Google can render JS (with delays), but Bing, DuckDuckGo, and AI crawlers often cannot. The `<noscript>` fallback only shows a message — no actual content.

**Fix**: React Router v7 supports SSR natively. Evaluate enabling it for at least these high-value routes:
- `/` (homepage)
- `/heroes`
- `/items`
- `/leaderboard`

**Alternative**: If SSR is too complex, use a pre-rendering solution (e.g., Cloudflare Workers with headless rendering for bot user-agents).

---

## MEDIUM — Fix Within 1 Month

### 3. Add editorial/FAQ content

**Problem**: No prose content for search engines. All pages are data/UI. The site misses long-tail queries like "best Deadlock heroes", "Deadlock tier list", "how to check Deadlock rank".

**Fix**: Add one or more of:
- `/faq` — common questions about the site and Deadlock stats
- `/guides` or a blog — patch analysis, meta breakdowns, tier lists
- ~~Descriptive paragraphs on existing pages~~ **Done** — added to heroes, items, leaderboard, and game-stats pages

---

## LOW — Backlog

### 6. Consider `hreflang` tags
Only needed if multi-language support is planned.
