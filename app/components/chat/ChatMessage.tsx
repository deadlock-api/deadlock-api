import { Bot, User } from "lucide-react";
import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";
import type { Message } from "~/types/chat";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

export function ChatMessage({ message, isStreaming, streamingContent }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayContent = isStreaming && streamingContent !== undefined ? streamingContent : message.content;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <Avatar className={cn("size-8 shrink-0", isUser ? "bg-primary" : "bg-muted")}>
        <AvatarFallback
          className={cn(isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
        >
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Message bubble */}
      <div className={cn("flex flex-col gap-1 max-w-[90%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-4 py-2 text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {displayContent ? (
            isUser ? (
              displayContent
            ) : (
              <MarkdownContent content={displayContent} />
            )
          ) : (
            isStreaming && <TypingIndicator />
          )}
        </div>
        {isStreaming && displayContent && <TypingIndicator />}
      </div>
    </div>
  );
}

interface MarkdownContentProps {
  content: string;
}

function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Open links in new tab with security attributes
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
        // Style code blocks
        pre: ({ children, ...props }: ComponentProps<"pre">) => (
          <pre className="my-2 overflow-x-auto rounded-md bg-background/50 p-3 text-xs font-mono" {...props}>
            {children}
          </pre>
        ),
        // Style inline code
        code: ({ children, className, ...props }: ComponentProps<"code">) => {
          // Check if this is inline code (no className from highlight.js)
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-background/50 px-1.5 py-0.5 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }
          // Block code - let highlight.js handle it
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Style headings
        h1: ({ children, ...props }: ComponentProps<"h1">) => (
          <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }: ComponentProps<"h2">) => (
          <h2 className="mb-2 mt-3 text-lg font-bold first:mt-0" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }: ComponentProps<"h3">) => (
          <h3 className="mb-1 mt-2 text-base font-bold first:mt-0" {...props}>
            {children}
          </h3>
        ),
        h4: ({ children, ...props }: ComponentProps<"h4">) => (
          <h4 className="mb-1 mt-2 text-sm font-bold first:mt-0" {...props}>
            {children}
          </h4>
        ),
        h5: ({ children, ...props }: ComponentProps<"h5">) => (
          <h5 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props}>
            {children}
          </h5>
        ),
        h6: ({ children, ...props }: ComponentProps<"h6">) => (
          <h6 className="mb-1 mt-2 text-sm font-medium first:mt-0" {...props}>
            {children}
          </h6>
        ),
        // Style paragraphs
        p: ({ children, ...props }: ComponentProps<"p">) => (
          <p className="mb-2 last:mb-0" {...props}>
            {children}
          </p>
        ),
        // Style lists
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
        // Style blockquotes
        blockquote: ({ children, ...props }: ComponentProps<"blockquote">) => (
          <blockquote className="my-2 border-l-4 border-primary/50 pl-3 italic text-muted-foreground" {...props}>
            {children}
          </blockquote>
        ),
        // Style tables
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
        // Style horizontal rules
        hr: (props: ComponentProps<"hr">) => <hr className="my-4 border-border/50" {...props} />,
        // Style strong/bold text
        strong: ({ children, ...props }: ComponentProps<"strong">) => (
          <strong className="font-semibold" {...props}>
            {children}
          </strong>
        ),
        // Style em/italic text
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "150ms" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
