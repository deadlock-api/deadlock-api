import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Calendar, Clock } from "lucide-react";

import { LinkCard } from "~/components/patterns/content/LinkCard";
import { MetaItem, MetaList } from "~/components/patterns/content/MetaList";
import { Prose } from "~/components/patterns/content/Prose";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Inline, Stack } from "~/components/ui/stack";
import { TextLink } from "~/components/ui/text-link";
import { formatBlogDate } from "~/lib/blog-date";
import { fetchBlogPost } from "~/lib/blog-fns";
import { getBlogOGImage, pageTitle, seo, SITE_URL } from "~/lib/seo";

import { TagBadge } from "./-tag-badge";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await fetchBlogPost({ data: params.slug });
    if (!post) throw notFound();
    return { ...post, breadcrumb: post.title };
  },
  head: ({ loaderData }) => {
    // The not-found page sets its own title and noindex; a second title and a canonical to the section came first.
    if (!loaderData) return {};
    return seo({
      title: pageTitle(loaderData.title),
      description: loaderData.description,
      path: `/blog/${loaderData.slug}`,
      ogImage: `${SITE_URL}${getBlogOGImage(loaderData.slug)}`,
      ogType: "article",
      publishedTime: loaderData.date,
      jsonLd: [
        {
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
      ],
    });
  },
  notFoundComponent: PostNotFound,
  component: BlogPostPage,
});

function PostNotFound() {
  return (
    <PageShell width="prose" density="content" className="items-center py-20">
      <PageHeader size="lg" title="Post not found" description="The blog post you're looking for doesn't exist." />
      <Button asChild variant="link">
        <Link to="/blog">
          <ArrowLeft />
          Back to blog
        </Link>
      </Button>
    </PageShell>
  );
}

function NeighbourPostLink({
  post,
  direction,
}: {
  post: { slug: string; title: string };
  direction: "older" | "newer";
}) {
  const newer = direction === "newer";
  return (
    <LinkCard
      asChild
      size="sm"
      orientation="horizontal"
      mediaPosition={newer ? "end" : "start"}
      media={newer ? <ArrowRight /> : <ArrowLeft />}
      eyebrow={newer ? "Newer post" : "Older post"}
      title={post.title}
    >
      <Link to="/blog/$slug" params={{ slug: post.slug }} preload="intent" />
    </LinkCard>
  );
}

function BlogPostPage() {
  const post = Route.useLoaderData();

  return (
    <PageShell width="prose" density="content">
      <Stack gap={4}>
        <PageHeader
          size="lg"
          align="start"
          eyebrow={
            <TextLink asChild tone="muted">
              <Link to="/blog" className="inline-flex items-center gap-1.5">
                <ArrowLeft className="size-3.5" />
                All posts
              </Link>
            </TextLink>
          }
          title={post.title}
          description={
            <MetaList className="text-sm">
              <MetaItem icon={<Calendar />}>
                <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
              </MetaItem>
              <MetaItem>{post.author}</MetaItem>
              <MetaItem icon={<Clock />}>{post.readingMinutes} min read</MetaItem>
            </MetaList>
          }
        />
        <Inline>
          {post.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </Inline>
      </Stack>

      <Separator />

      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is rendered on the server from our own markdown */}
      <Prose as="article" align="justify" dangerouslySetInnerHTML={{ __html: post.html }} />

      {(post.older || post.newer) && (
        <>
          <Separator />
          <nav aria-label="Older and newer posts" className="grid gap-3 sm:grid-cols-2">
            {post.older ? <NeighbourPostLink post={post.older} direction="older" /> : <div />}
            {post.newer && <NeighbourPostLink post={post.newer} direction="newer" />}
          </nav>
        </>
      )}

      {post.related.length > 0 && (
        <>
          <Separator />
          <Section title="More posts">
            <Stack gap={3}>
              {post.related.map((related) => (
                <LinkCard
                  key={related.slug}
                  asChild
                  size="sm"
                  eyebrow={<time dateTime={related.date}>{formatBlogDate(related.date)}</time>}
                  title={related.title}
                  description={related.description}
                  clamp={2}
                >
                  <Link to="/blog/$slug" params={{ slug: related.slug }} preload="intent" />
                </LinkCard>
              ))}
            </Stack>
          </Section>
        </>
      )}
    </PageShell>
  );
}
