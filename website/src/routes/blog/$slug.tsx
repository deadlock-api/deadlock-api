import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { getBlogPost, getRecentPosts } from "~/lib/blog";
import { SITE_URL, getBlogOGImage, seo } from "~/lib/seo";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) throw notFound();
    return {
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      author: post.author,
      tags: post.tags,
      content: post.content,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Post Not Found - Deadlock API Blog",
        description: "The requested blog post could not be found.",
        path: "/blog",
      });
    }
    return seo({
      title: `${loaderData.title} - Deadlock API Blog`,
      description: loaderData.description,
      path: `/blog/${loaderData.slug}`,
      ogImage: `${SITE_URL}${getBlogOGImage(loaderData.slug)}`,
      ogType: "article",
      publishedTime: loaderData.date,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: loaderData.title,
        description: loaderData.description,
        image: `${SITE_URL}${getBlogOGImage(loaderData.slug)}`,
        datePublished: loaderData.date,
        dateModified: loaderData.date,
        author: {
          "@type": "Person",
          name: loaderData.author,
        },
        publisher: {
          "@type": "Organization",
          name: "Deadlock API",
          url: SITE_URL,
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/favicon.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${SITE_URL}/blog/${loaderData.slug}`,
        },
        keywords: loaderData.tags.join(", "),
      },
    });
  },
  notFoundComponent: PostNotFound,
  component: BlogPostPage,
});

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const tagColors: Record<string, string> = {
  announcement: "bg-primary/15 text-primary border-primary/30",
  community: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  data: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  guide: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  engineering: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  infrastructure: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  meta: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  patch: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const proseClasses =
  "prose prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-2xl prose-h3:mt-7 prose-h3:mb-3 prose-h3:text-lg prose-p:leading-relaxed prose-p:text-muted-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-li:text-muted-foreground prose-ol:text-muted-foreground prose-ul:text-muted-foreground prose-img:rounded-lg prose-img:border prose-img:border-border prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-code:text-foreground";

function PostNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="mb-2 text-3xl font-bold">Post not found</h1>
      <p className="mb-6 text-muted-foreground">The blog post you're looking for doesn't exist.</p>
      <Link
        to="/blog"
        className="flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        <ArrowLeft className="size-4" />
        Back to blog
      </Link>
    </div>
  );
}

function BlogPostPage() {
  const post = Route.useLoaderData();
  const recentPosts = getRecentPosts(4).filter((p) => p.slug !== post.slug);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/blog"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All posts
      </Link>

      <header className="mb-10 border-b border-border pb-8">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">{post.title}</h1>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <time dateTime={post.date}>{formatDate(post.date)}</time>
          </span>
          <span className="text-border">|</span>
          <span>{post.author}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                tagColors[tag] ?? "border-border bg-muted text-muted-foreground",
              )}
            >
              <Tag className="size-2.5" />
              {tag}
            </span>
          ))}
        </div>
      </header>

      <article className={proseClasses}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {post.content}
        </Markdown>
      </article>

      {recentPosts.length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 text-lg font-semibold">More posts</h2>
          <div className="space-y-3">
            {recentPosts.slice(0, 3).map((related) => (
              <Link
                key={related.slug}
                to="/blog/$slug"
                params={{ slug: related.slug }}
                preload="intent"
                className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <div className="mb-1 text-xs text-muted-foreground">
                  <time dateTime={related.date}>{formatDate(related.date)}</time>
                </div>
                <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {related.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{related.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
