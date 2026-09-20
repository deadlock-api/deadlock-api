import { Link, createFileRoute } from "@tanstack/react-router";
import { Calendar, Clock } from "lucide-react";

import { LinkCard } from "~/components/patterns/content/LinkCard";
import { MetaItem, MetaList } from "~/components/patterns/content/MetaList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Stack } from "~/components/ui/stack";
import { fetchBlogPosts } from "~/lib/blog-fns";
import { seo } from "~/lib/seo";

import { TagBadge } from "./-tag-badge";

export const Route = createFileRoute("/blog/")({
  head: () =>
    seo({
      title: "Blog - Deadlock API",
      description: "Updates, patch analyses, meta insights, and development news from the Deadlock API team.",
      path: "/blog",
    }),
  loader: () => fetchBlogPosts(),
  component: BlogIndex,
});

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function BlogIndex() {
  const posts = Route.useLoaderData();

  return (
    <PageShell width="prose" density="content">
      <PageHeader
        size="lg"
        title="Blog"
        description="Updates, patch analyses, and insights from the Deadlock API team"
      />

      <Stack gap={4}>
        {posts.map((post) => (
          <LinkCard
            key={post.slug}
            asChild
            size="lg"
            titleAs="h2"
            eyebrow={
              <MetaList>
                <MetaItem icon={<Calendar />}>{formatDate(post.date)}</MetaItem>
                <MetaItem>{post.author}</MetaItem>
                <MetaItem icon={<Clock />}>{post.readingMinutes} min read</MetaItem>
              </MetaList>
            }
            title={post.title}
            description={post.description}
            cta="Read more"
            ctaPosition="end"
            footer={post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          >
            <Link to="/blog/$slug" params={{ slug: post.slug }} preload="intent" />
          </LinkCard>
        ))}
      </Stack>
    </PageShell>
  );
}
