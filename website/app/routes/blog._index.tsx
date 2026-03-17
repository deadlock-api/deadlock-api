import { motion } from "framer-motion";
import { ArrowRight, Calendar, Tag } from "lucide-react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { getRecentPosts } from "~/lib/blog";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Blog - Deadlock API",
    description: "Updates, patch analyses, meta insights, and development news from the Deadlock API team.",
    path: "/blog",
  });
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function formatDate(dateStr: string) {
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
};

export default function BlogIndex() {
  const posts = getRecentPosts();

  return (
    <div className="space-y-8">
      <section className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-2 text-3xl font-bold tracking-tight"
        >
          Blog
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-sm text-muted-foreground"
        >
          Updates, patch analyses, and insights from the Deadlock API team
        </motion.p>
      </section>

      <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-4xl space-y-4">
        {posts.map((post) => (
          <motion.div key={post.slug} variants={fadeUp}>
            <Link
              to={`/blog/${post.slug}`}
              prefetch="intent"
              className="group block rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatDate(post.date)}
                </span>
                <span className="text-border">|</span>
                <span>{post.author}</span>
              </div>

              <h2 className="mb-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                {post.title}
              </h2>

              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{post.description}</p>

              <div className="flex items-center justify-between">
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
                <span className="flex items-center gap-1 text-xs font-medium text-primary/80 transition-colors group-hover:text-primary">
                  Read more
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
