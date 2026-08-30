import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import { useMemo } from "react";

import { cn } from "~/lib/utils";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);
hljs.registerLanguage("toml", ini);

export type HighlightLanguage = "bash" | "python" | "javascript" | "sql" | "json" | "toml";

export function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string;
  language: HighlightLanguage;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return null;
    }
  }, [code, language]);
  return (
    <pre className={cn("overflow-x-auto font-mono text-xs leading-relaxed", className)}>
      {html ? (
        <code
          className={`hljs language-${language}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: hljs output is sanitized
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <code className="text-foreground/90">{code}</code>
      )}
    </pre>
  );
}
