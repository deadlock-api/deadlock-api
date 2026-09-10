import type { Element, Root } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  /** Estimated time to read the post, at a typical 220 words per minute. */
  readingMinutes: number;
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
        // YAML needs quotes around a title with a colon in it; they aren't part of the value.
        meta[currentKey] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
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

// Chart SVGs are inlined into the post HTML so they render as real vector markup rather than <img> elements.
const svgModules = import.meta.glob<string>("../../public/blog/images/*.svg", {
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
      readingMinutes: Math.max(1, Math.round(content.split(/\s+/).length / 220)),
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

// A paragraph holding only an image becomes a full-width figure; the image title is the visible caption, the alt
// stays a short description. Chart images are generated at a 4:3 aspect ratio, which the img reserves so the page
// does not shift while they load. The first image is usually above the fold, so it loads eagerly.
function inlineSvg(src: string, alt: string): string | null {
  const match = src.match(/^\/blog\/images\/([\w-]+\.svg)$/);
  const raw = match ? svgModules[`../../public/blog/images/${match[1]}`] : undefined;
  if (!raw) return null;
  const escapedAlt = alt.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return raw
    .replace(/<\?xml[^>]*>\s*/, "")
    .replace(/<!DOCTYPE[^>]*>\s*/, "")
    .replace(/<metadata>[\s\S]*?<\/metadata>\s*/, "")
    .replace(/<svg\b([^>]*)>/, (_, attrs: string) => {
      const kept = attrs.replace(/\s(?:width|height)="[^"]*"/g, "");
      return `<svg${kept} class="w-full h-auto rounded-lg border border-border" role="img" aria-label="${escapedAlt}">`;
    });
}

function rehypeBlogFigures() {
  return (tree: Root) => {
    let first = true;
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || index === undefined || !parent) return;
      const img = node.children.length === 1 ? node.children[0] : null;
      if (!img || img.type !== "element" || img.tagName !== "img") return;
      const { title, ...props } = img.properties;
      const svg = inlineSvg(String(props.src ?? ""), String(props.alt ?? ""));
      img.properties = {
        ...props,
        loading: first ? "eager" : "lazy",
        fetchPriority: first ? "high" : undefined,
        className: ["aspect-[4/3]", "w-full", "rounded-lg", "border", "border-border"],
      };
      first = false;
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: { className: ["not-prose", "my-6"] },
        children: [svg ? { type: "raw", value: svg } : img],
      };
      if (typeof title === "string" && title) {
        figure.children.push({
          type: "element",
          tagName: "figcaption",
          properties: { className: ["mt-2", "text-[13px]", "leading-snug", "text-muted-foreground"] },
          children: [{ type: "text", value: title }],
        });
      }
      parent.children[index] = figure;
    });
  };
}

const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeBlogFigures)
  .use(rehypeHighlight)
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function renderBlogHtml(content: string): Promise<string> {
  return String(await markdown.process(content));
}
