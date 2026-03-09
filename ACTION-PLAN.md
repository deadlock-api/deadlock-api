# SEO Action Plan — deadlock-api.com

**Current Score: 68/100**
**Target Score: 85+/100**

---

## HIGH — Fix Within 1 Week

### 1. Evaluate enabling SSR for public routes

**Problem**: `ssr: false` means all content is client-rendered. Google can render JS (with delays), but Bing, DuckDuckGo, and AI crawlers often cannot. The `<noscript>` fallback only shows a message — no actual content.

**Fix**: React Router v7 supports SSR natively. Evaluate enabling it for at least these high-value routes:
- `/` (homepage)
- `/heroes`
- `/items`
- `/leaderboard`

**Alternative**: If SSR is too complex, use a pre-rendering solution (e.g., Cloudflare Workers with headless rendering for bot user-agents).

---

## MEDIUM — Fix Within 1 Month

### 2. Add editorial/FAQ content

**Problem**: No prose content for search engines. All pages are data/UI. The site misses long-tail queries like "best Deadlock heroes", "Deadlock tier list", "how to check Deadlock rank".

**Fix**: Add one or more of:
- `/faq` — common questions about the site and Deadlock stats
- `/guides` or a blog — patch analysis, meta breakdowns, tier lists
- ~~Descriptive paragraphs on existing pages~~ **Done** — added to heroes, items, leaderboard, and game-stats pages

---

## LOW — Backlog

### 3. Consider `hreflang` tags
Only needed if multi-language support is planned.
