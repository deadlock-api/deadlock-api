import { createServerFn } from "@tanstack/react-start";

import { type BlogPost, getBlogPost, getRecentPosts, renderBlogHtml } from "~/lib/blog";

export type BlogPostMeta = Omit<BlogPost, "content">;

function toMeta({ slug, title, description, date, author, tags, readingMinutes }: BlogPost): BlogPostMeta {
  return { slug, title, description, date, author, tags, readingMinutes };
}

// Markdown sources and the rendering pipeline stay on the server; the client only receives metadata and HTML.
export const fetchBlogPosts = createServerFn({ method: "GET" }).handler(() => getRecentPosts().map(toMeta));

export const fetchBlogPost = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = getBlogPost(slug);
    if (!post) return null;
    const posts = getRecentPosts();
    const index = posts.findIndex((p) => p.slug === slug);
    return {
      ...toMeta(post),
      html: await renderBlogHtml(post.content),
      newer: index > 0 ? toMeta(posts[index - 1]) : null,
      older: index < posts.length - 1 ? toMeta(posts[index + 1]) : null,
      related: posts
        .filter((p) => p.slug !== slug)
        .slice(0, 3)
        .map(toMeta),
    };
  });
