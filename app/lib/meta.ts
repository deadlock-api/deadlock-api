const SITE_URL = "https://deadlock-api.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon.webp`;

interface PageMetaOptions {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
}

export function createPageMeta({ title, description, path, ogImage = DEFAULT_OG_IMAGE }: PageMetaOptions) {
  const url = `${SITE_URL}${path}`;
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}
