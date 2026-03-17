import { lazy, type ComponentType } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
}

export interface MarkdownBlogPost extends BlogPostMeta {
  type: "markdown";
  content: string;
}

export interface JsxBlogPost extends BlogPostMeta {
  type: "jsx";
  component: ComponentType;
}

export type BlogPost = MarkdownBlogPost | JsxBlogPost;

// ---------------------------------------------------------------------------
// Frontmatter parsing (simple YAML subset)
// ---------------------------------------------------------------------------

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

    // Flush previous list
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

// ---------------------------------------------------------------------------
// Load markdown files eagerly via import.meta.glob
// ---------------------------------------------------------------------------

const mdModules = import.meta.glob<string>("/content/blog/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

function loadMarkdownPosts(): MarkdownBlogPost[] {
  const posts: MarkdownBlogPost[] = [];

  for (const [path, raw] of Object.entries(mdModules)) {
    const slug = path.replace("/content/blog/", "").replace(/\.md$/, "");
    const { meta, content } = parseFrontmatter(raw);

    posts.push({
      type: "markdown",
      slug,
      title: meta.title ?? slug,
      description: meta.description ?? "",
      date: meta.date ?? "1970-01-01",
      author: meta.author ?? "Deadlock API Team",
      tags: meta.tags ?? [],
      content,
    });
  }

  return posts;
}

// ---------------------------------------------------------------------------
// JSX posts registry
// Register JSX/TSX blog posts here by adding entries to this array.
// ---------------------------------------------------------------------------

const jsxPosts: JsxBlogPost[] = [
  {
    type: "jsx",
    slug: "how-deadlock-api-started",
    title: "How Deadlock API started: from frustrated meetings to 20 million daily requests",
    description:
      "The story of how a community analytics platform grew from one developer's frustration with endless planning meetings into an open API serving half a million users.",
    date: "2026-03-16",
    author: "Manuel - Deadlock API Team",
    tags: ["community", "announcement"],
    component: lazy(() => import("~/components/blog/how-deadlock-api-started")),
  },
];

// ---------------------------------------------------------------------------
// Combined post list
// ---------------------------------------------------------------------------

let _cache: BlogPost[] | null = null;

function allPosts(): BlogPost[] {
  if (_cache) return _cache;
  _cache = [...loadMarkdownPosts(), ...jsxPosts];
  return _cache;
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return allPosts().find((post) => post.slug === slug);
}

export function getRecentPosts(count?: number): BlogPost[] {
  const sorted = [...allPosts()].sort((a, b) => b.date.localeCompare(a.date));
  return count ? sorted.slice(0, count) : sorted;
}

export function getAllSlugs(): string[] {
  return allPosts().map((post) => post.slug);
}
