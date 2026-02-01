import { CheckCircle2, Loader2, Settings2, XCircle } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { ToolExecution } from "~/types/chat";

interface ToolIndicatorProps {
  tool: ToolExecution;
}

export function ToolIndicator({ tool }: ToolIndicatorProps) {
  const isRunning = tool.status === "running";
  const isSuccess = tool.status === "success";
  const isFailed = tool.status === "failed";

  // Format tool name for display (e.g., "get_hero_data" -> "Get Hero Data")
  const formatToolName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Format arguments for display
  const formatArguments = (args: Record<string, unknown>) => {
    const entries = Object.entries(args);
    if (entries.length === 0) return null;

    return entries.map(([key, value]) => (
      <div key={key} className="flex gap-2 text-xs">
        <span className="text-muted-foreground font-medium">{key}:</span>
        <span className="text-foreground font-mono break-all">
          {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </span>
      </div>
    ));
  };

  const hasArguments = Object.keys(tool.arguments).length > 0;
  const hasResult = tool.result_summary && tool.result_summary.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/30 cursor-default",
            isRunning && "border-primary/50",
            isSuccess && "border-green-500/30",
            isFailed && "border-destructive/30",
          )}
        >
          {/* Status icon */}
          <div className="shrink-0">
            {isRunning && <Loader2 className="size-3.5 text-primary animate-spin" />}
            {isSuccess && <CheckCircle2 className="size-3.5 text-green-500" />}
            {isFailed && <XCircle className="size-3.5 text-destructive" />}
          </div>

          {/* Tool icon */}
          <Settings2 className="size-3.5 text-muted-foreground shrink-0" />

          {/* Tool name */}
          <span className="text-sm font-medium">{formatToolName(tool.tool_name)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm bg-popover text-popover-foreground border shadow-md p-0">
        <div className="p-3 space-y-2">
          {/* Header with status */}
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium text-sm">{formatToolName(tool.tool_name)}</span>
            <Badge
              variant={isRunning ? "secondary" : isSuccess ? "default" : "destructive"}
              className={cn(
                "text-xs shrink-0",
                isRunning && "bg-primary/10 text-primary border-primary/20",
                isSuccess && "bg-green-500/10 text-green-600 border-green-500/20",
                isFailed && "bg-destructive/10 text-destructive border-destructive/20",
              )}
            >
              {isRunning ? "Running" : isSuccess ? "Success" : "Failed"}
            </Badge>
          </div>

          {/* Arguments section */}
          {hasArguments && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Arguments</h4>
              <div className="bg-background/50 rounded-md p-2 space-y-1">{formatArguments(tool.arguments)}</div>
            </div>
          )}

          {/* Result section (only shown when complete) */}
          {hasResult && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Result</h4>
              <div
                className={cn(
                  "rounded-md p-2 text-xs",
                  isSuccess && "bg-green-500/10 text-foreground",
                  isFailed && "bg-destructive/10 text-foreground",
                )}
              >
                {tool.result_summary}
              </div>
            </div>
          )}

          {/* Show placeholder when running and no result yet */}
          {isRunning && !hasResult && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>Processing...</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface ToolIndicatorListProps {
  tools: ToolExecution[];
}

export function ToolIndicatorList({ tools }: ToolIndicatorListProps) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {tools.map((tool) => (
        <ToolIndicator key={tool.id} tool={tool} />
      ))}
    </div>
  );
}
