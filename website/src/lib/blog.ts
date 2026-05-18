export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  content: string;
}

interface RawFrontmatter {
  title?: string;
  description?: string;
  date?: string;
  author?: string;
  tags?: string[];
}

function parseFrontmatter(raw: string): { meta: RawFrontmatter; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const yamlBlock = match[1];
  const content = match[2].trim();
  const meta: Record<string, unknown> = {};

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of yamlBlock.split("\n")) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listItem[1].trim());
      meta[currentKey] = currentList;
      continue;
    }

    currentList = null;

    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const value = kv[2].trim();
      if (value) {
        meta[currentKey] = value;
      }
    }
  }

  return { meta: meta as RawFrontmatter, content };
}

// Markdown sources are kept in content/blog/.
// Vite bundles matched files into the SSR output — no runtime fs access (Workers-safe).
const mdModules = import.meta.glob<string>("../../content/blog/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

let cache: BlogPost[] | null = null;

function loadPosts(): BlogPost[] {
  if (cache) return cache;
  const posts: BlogPost[] = [];
  for (const [path, raw] of Object.entries(mdModules)) {
    const slug = path.replace(/^.*\/blog\//, "").replace(/\.md$/, "");
    const { meta, content } = parseFrontmatter(raw);
    posts.push({
      slug,
      title: meta.title ?? slug,
      description: meta.description ?? "",
      date: meta.date ?? "1970-01-01",
      author: meta.author ?? "Deadlock API Team",
      tags: meta.tags ?? [],
      content,
    });
  }
  cache = posts;
  return cache;
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return loadPosts().find((post) => post.slug === slug);
}

export function getRecentPosts(count?: number): BlogPost[] {
  const sorted = [...loadPosts()].sort((a, b) => b.date.localeCompare(a.date));
  return count ? sorted.slice(0, count) : sorted;
}

export function getAllSlugs(): string[] {
  return loadPosts().map((post) => post.slug);
}
