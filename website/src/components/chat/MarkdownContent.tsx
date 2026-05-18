import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ children, href, ...props }: ComponentProps<"a">) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
            {...props}
          >
            {children}
          </a>
        ),
        pre: ({ children, ...props }: ComponentProps<"pre">) => (
          <pre className="my-2 overflow-x-auto rounded-md bg-background/50 p-3 font-mono text-xs" {...props}>
            {children}
          </pre>
        ),
        code: ({ children, className, ...props }: ComponentProps<"code">) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-background/50 px-1.5 py-0.5 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        h1: ({ children, ...props }: ComponentProps<"h1">) => (
          <h1 className="mt-4 mb-2 text-xl font-bold first:mt-0" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }: ComponentProps<"h2">) => (
          <h2 className="mt-3 mb-2 text-lg font-bold first:mt-0" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }: ComponentProps<"h3">) => (
          <h3 className="mt-2 mb-1 text-base font-bold first:mt-0" {...props}>
            {children}
          </h3>
        ),
        h4: ({ children, ...props }: ComponentProps<"h4">) => (
          <h4 className="mt-2 mb-1 text-sm font-bold first:mt-0" {...props}>
            {children}
          </h4>
        ),
        h5: ({ children, ...props }: ComponentProps<"h5">) => (
          <h5 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props}>
            {children}
          </h5>
        ),
        h6: ({ children, ...props }: ComponentProps<"h6">) => (
          <h6 className="mt-2 mb-1 text-sm font-medium first:mt-0" {...props}>
            {children}
          </h6>
        ),
        p: ({ children, ...props }: ComponentProps<"p">) => (
          <p className="mb-2 last:mb-0" {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }: ComponentProps<"ul">) => (
          <ul className="mb-2 ml-4 list-disc last:mb-0" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }: ComponentProps<"ol">) => (
          <ol className="mb-2 ml-4 list-decimal last:mb-0" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }: ComponentProps<"li">) => (
          <li className="mb-1" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, ...props }: ComponentProps<"blockquote">) => (
          <blockquote className="my-2 border-l-4 border-primary/50 pl-3 text-muted-foreground italic" {...props}>
            {children}
          </blockquote>
        ),
        table: ({ children, ...props }: ComponentProps<"table">) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm" {...props}>
              {children}
            </table>
          </div>
        ),
        thead: ({ children, ...props }: ComponentProps<"thead">) => (
          <thead className="bg-background/30" {...props}>
            {children}
          </thead>
        ),
        th: ({ children, ...props }: ComponentProps<"th">) => (
          <th className="border border-border/50 px-3 py-1.5 text-left font-semibold" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }: ComponentProps<"td">) => (
          <td className="border border-border/50 px-3 py-1.5" {...props}>
            {children}
          </td>
        ),
        hr: (props: ComponentProps<"hr">) => <hr className="my-4 border-border/50" {...props} />,
        strong: ({ children, ...props }: ComponentProps<"strong">) => (
          <strong className="font-semibold" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }: ComponentProps<"em">) => (
          <em className="italic" {...props}>
            {children}
          </em>
        ),
      }}
    >
      {content}
    </Markdown>
  );
}
