import type { ComponentProps } from "react";

type OptimizedImageProps = Omit<ComponentProps<"img">, "src" | "srcSet" | "sizes"> & {
  /** Original image in public/. SVGs are served unchanged. */
  src: `/${string}`;
  alt: string;
  widths: readonly number[];
  sizes: string;
  quality?: number;
};

function imageUrl(src: string, width: number, quality: number) {
  // Use the production zone so built previews also work without a local
  // /cdn-cgi/image handler. Originals must be deployed before using them here.
  // Cloudflare handles transform failures before hydration, including quota
  // errors, by redirecting to the same-zone original.
  return `https://deadlock-api.com/cdn-cgi/image/fit=scale-down,width=${width},quality=${quality},format=auto,onerror=redirect${src}`;
}

/** Cloudflare generates and caches responsive variants from one original. */
export function OptimizedImage({ src, alt, widths, sizes, quality = 80, ...props }: OptimizedImageProps) {
  const optimize = import.meta.env.PROD && !src.endsWith(".svg") && widths.length > 0;

  return (
    <img
      {...props}
      alt={alt}
      src={optimize ? imageUrl(src, widths[0], quality) : src}
      srcSet={optimize ? widths.map((width) => `${imageUrl(src, width, quality)} ${width}w`).join(", ") : undefined}
      sizes={sizes}
    />
  );
}
