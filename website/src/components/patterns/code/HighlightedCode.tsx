import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import { useMemo } from "react";

import { CopyButton } from "~/components/ui/copy-button";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);
hljs.registerLanguage("toml", ini);

export type HighlightLanguage = "bash" | "python" | "javascript" | "sql" | "json" | "toml";

interface HighlightedCodeProps extends Omit<React.ComponentProps<"div">, "children"> {
  code: string;
  language: HighlightLanguage;
  size?: "default" | "lg";
  /** `wrap` breaks long lines instead of scrolling sideways, for a command inside a narrow column. */
  overflow?: "scroll" | "wrap";
  /** `copy` puts a copy button over the top trailing corner. */
  actions?: "none" | "copy";
  /** `plain` drops the block's own surface and padding, for code inside a frame that already has them. */
  variant?: "block" | "plain";
  copyLabel?: string;
}

const sizeClass = { default: "text-xs", lg: "text-sm" };

/** A block of code with syntax colors. A short piece of code inside a sentence is `ui/Code`. */
export function HighlightedCode({
  code,
  language,
  size = "default",
  overflow = "scroll",
  actions = "none",
  variant = "block",
  copyLabel = "Copy code",
  className,
  ...props
}: HighlightedCodeProps) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return null;
    }
  }, [code, language]);
  // Not the theme's `.hljs` box, whose padding only `!important` could change; the token colors do not need it.
  const codeClass = cn(
    "block w-fit min-w-full text-foreground",
    variant === "block" && "rounded-md bg-muted/50 p-4",
    variant === "block" && actions === "copy" && "pe-12",
  );
  return (
    <div data-slot="highlighted-code" className={cn("relative min-w-0", sizeClass[size], className)} {...props}>
      <pre
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard
        tabIndex={overflow === "scroll" ? 0 : undefined}
        className={cn(
          FOCUS_RING,
          "scrollbar-thin overflow-x-auto rounded-md font-mono leading-relaxed",
          // Breaks between words first, and inside one only when it is longer than the line (a URL), not "--trans/port".
          overflow === "wrap" && "wrap-break-word whitespace-pre-wrap",
        )}
      >
        {html ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: hljs output is sanitized
          <code className={codeClass} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={codeClass}>{code}</code>
        )}
      </pre>
      {actions === "copy" && (
        <CopyButton
          size="icon-sm"
          text={code}
          title={copyLabel}
          className="absolute end-1.5 top-1.5 bg-background/60 backdrop-blur"
        />
      )}
    </div>
  );
}
