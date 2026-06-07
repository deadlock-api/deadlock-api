import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { Globe, History, MessageSquare, Search, ShieldCheck, User } from "lucide-react";
import { useMemo, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { listSessions, type SessionSummary } from "~/lib/coach/client";
import { cn } from "~/lib/utils";

// Newest-first relative timestamp, e.g. "3 hours ago". Client-only (uses the
// browser clock); the drawer is never rendered during SSR.
function relativeTime(iso: string): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diffSeconds) >= secs) return fmt.format(Math.round(diffSeconds / secs), unit);
  }
  return "just now";
}

export function ConversationHistory({ currentSessionId, isAdmin }: { currentSessionId?: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Only hit the API while the drawer is open; refetch each time it reopens so a
  // freshly created chat shows up without a manual refresh.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["coach-sessions"],
    queryFn: listSessions,
    enabled: open,
    staleTime: 10_000,
  });

  // Fuzzy match on the title — and, for admins, the patron id too, so they can
  // jump to a specific user's chats. Order falls back to the API's newest-first
  // when idle.
  const fuse = useMemo(
    () =>
      new Fuse(data ?? [], {
        keys: isAdmin ? ["title", "patron_id"] : ["title"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [data, isAdmin],
  );

  const sessions = useMemo(() => {
    const q = query.trim();
    if (!q) return data ?? [];
    return fuse.search(q).map((r) => r.item);
  }, [data, query, fuse]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <History className="size-3.5" /> History
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-white/[0.06] p-4">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <History className="size-4 text-primary" />
              {isAdmin ? "All conversations" : "Your conversations"}
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  <ShieldCheck className="size-2.5" /> Admin
                </span>
              ) : null}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {isAdmin ? "Every patron's chats, newest first." : "Pick up where you left off."}
            </SheetDescription>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search conversations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAdmin ? "Search by title or patron id…" : "Search by title…"}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] py-1.5 pr-2.5 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40"
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-2 p-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Couldn't load your conversations. Try reopening this panel.
              </p>
            ) : sessions.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query ? "No conversations match your search." : "No conversations yet."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    active={s.id === currentSessionId}
                    showOwner={isAdmin}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SessionRow({
  session,
  active,
  showOwner,
  onNavigate,
}: {
  session: SessionSummary;
  active: boolean;
  showOwner: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        to="/chat/$sessionId"
        params={{ sessionId: session.id }}
        onClick={onNavigate}
        className={cn(
          "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition",
          active
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        )}
      >
        <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground">{session.title ?? "Untitled chat"}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{relativeTime(session.updated_at)}</span>
            {session.is_public ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-400">
                <Globe className="size-2.5" /> public
              </span>
            ) : null}
            {showOwner ? (
              <span className="inline-flex items-center gap-0.5 font-mono" title={session.patron_id}>
                <User className="size-2.5" /> {session.patron_id.slice(0, 8)}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
