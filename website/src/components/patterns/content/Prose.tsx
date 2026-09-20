import { cn } from "~/lib/utils";

/** The typography plugin reads its colors from these variables, so the tokens reach every generated element. */
const proseTokens = [
  "[--tw-prose-body:var(--muted-foreground)] [--tw-prose-headings:var(--foreground)] [--tw-prose-lead:var(--muted-foreground)]",
  "[--tw-prose-links:var(--primary)] [--tw-prose-bold:var(--foreground)] [--tw-prose-counters:var(--muted-foreground)]",
  "[--tw-prose-bullets:var(--muted-foreground)] [--tw-prose-hr:var(--border)] [--tw-prose-quotes:var(--foreground)]",
  "[--tw-prose-quote-borders:var(--border)] [--tw-prose-captions:var(--muted-foreground)] [--tw-prose-code:var(--foreground)]",
  "[--tw-prose-pre-code:var(--foreground)] [--tw-prose-pre-bg:var(--muted)] [--tw-prose-th-borders:var(--border)]",
  "[--tw-prose-td-borders:var(--border)] [--tw-prose-kbd:var(--foreground)]",
];

/**
 * Long-form text: a blog post rendered from markdown, a policy written in JSX. Everything inside is styled by
 * element, so the content needs no classes of its own.
 */
export function Prose({
  as: Comp = "div",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  as?: "div" | "article" | "section";
  /** `justify` sets justified, hyphenated paragraphs from `md` up, for an article in one wide column. */
  align?: "start" | "justify";
}) {
  return (
    <Comp
      data-slot="prose"
      data-align={align}
      className={cn(
        "@container prose max-w-none",
        proseTokens,
        // ds-allow law4-outer-margin: the vertical rhythm between the elements inside the prose, not around its root
        "prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-2xl prose-h3:mt-7 prose-h3:mb-3 prose-h3:text-lg",
        "prose-p:leading-relaxed prose-p:text-pretty prose-a:rounded-sm prose-a:no-underline prose-a:outline-none prose-a:hover:underline prose-a:focus-visible:ring-3 prose-a:focus-visible:ring-ring/50",
        "prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-img:rounded-lg prose-img:border",
        // ds-allow law4-outer-margin: removes the top margin the plugin gives the first element, so the root has none
        "[&>:first-child]:mt-0 [&>section:first-child>:first-child]:mt-0",
        align === "justify" && "@3xl:prose-p:text-justify @3xl:prose-p:hyphens-auto",
        className,
      )}
      {...props}
    />
  );
}
