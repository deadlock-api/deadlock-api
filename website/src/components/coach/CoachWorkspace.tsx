import { useNavigate } from "@tanstack/react-router";
import { Bot, Check, CornerDownLeft, Link2, Plus, Sparkles, Lock, Globe } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { NumberSelectorBare } from "~/components/NumberSelector";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { useHeroById } from "~/hooks/useAssetById";
import {
  type CoachStreamHandle,
  getSession,
  getSessionTree,
  isReportPart,
  isTextPart,
  listSessions,
  shareSession,
  makeSessionPrivate,
  type MessageTreeNode,
  streamCoachMessage,
  type ToolActivity,
  toolLabel,
} from "~/lib/coach/client";
import { CoachIcon } from "~/lib/coach/icons";
import type { Report } from "~/lib/coach/report";
import { SAMPLE_REPORTS } from "~/lib/coach/sample-reports";
import { useAiAgentAccess } from "~/lib/coach/use-ai-agent-access";
import { useSteamAccount } from "~/lib/coach/use-steam-account";
import { cn } from "~/lib/utils";

import { ReportRenderer } from "./ReportRenderer";

interface Turn {
  id: string;
  userText: string;
  status: "thinking" | "done" | "error";
  tools: ToolActivity[];
  deltaText: string;
  report?: Report;
  error?: string;
}

// Selectable time windows for the "matches this period" starter.
const PERIODS = [
  { key: "7d", label: "Last 7 days", phrase: "from the last 7 days" },
  { key: "14d", label: "Last 14 days", phrase: "from the last 14 days" },
  { key: "30d", label: "Last 30 days", phrase: "from the last 30 days" },
] as const;

let turnCounter = 0;
const nextId = () => `turn-${Date.now()}-${turnCounter++}`;

function demoTurns(demo?: string): Turn[] {
  if (demo && SAMPLE_REPORTS[demo]) {
    return [
      {
        id: "demo",
        userText: "Review my last match and tell me what went wrong.",
        status: "done",
        tools: [],
        deltaText: "",
        report: SAMPLE_REPORTS[demo],
      },
    ];
  }
  return [];
}

// Walk the primary branch of a message tree (root, then first child each step)
// in created_at order and pair each user message with its assistant reply.
function treeToTurns(roots: MessageTreeNode[]): Turn[] {
  const line: MessageTreeNode[] = [];
  let node: MessageTreeNode | undefined = roots[0];
  while (node) {
    line.push(node);
    node = node.children[0];
  }

  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const msg of line) {
    if (msg.role === "user") {
      if (current) turns.push(current);
      const text = msg.content.find(isTextPart);
      current = {
        id: msg.id,
        userText: text ? text.text : "",
        status: "done",
        tools: [],
        deltaText: "",
      };
    } else if (msg.role === "assistant" && current) {
      for (const part of msg.content) {
        if (isReportPart(part)) current.report = part.report;
        else if (isTextPart(part)) current.deltaText += part.text;
      }
    }
  }
  if (current) turns.push(current);
  return turns;
}

type LoadState = "idle" | "loading" | "not-found";

export function CoachWorkspace({ demo, sessionId: routeSessionId }: { demo?: string; sessionId?: string }) {
  // Demo mode seeds a worked example without touching the network.
  const [turns, setTurns] = useState<Turn[]>(() => demoTurns(demo));
  const { account, connect, disconnect } = useSteamAccount();
  const { data: hasAccess } = useAiAgentAccess();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(routeSessionId ?? null);
  const [isPublic, setIsPublic] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>(routeSessionId ? "loading" : "idle");
  const handleRef = useRef<CoachStreamHandle | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load a past chat when arriving with a session id in the URL. State is
  // initialized from props (the route remounts per id), so the effect only runs
  // the async fetch and updates state from its callbacks.
  useEffect(() => {
    if (!routeSessionId || demo) return;
    let cancelled = false;
    Promise.all([getSessionTree(routeSessionId), getSession(routeSessionId).catch(() => null)])
      .then(([roots, session]) => {
        if (!cancelled) {
          setTurns(treeToTurns(roots));
          if (session) {
            setIsPublic(session.is_public);
          }
          setLoadState("idle");
        }
        return undefined;
      })
      .catch(() => {
        // 404s and transient fetch failures both land on the empty state.
        if (!cancelled) setLoadState("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [routeSessionId, demo]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, streaming]);

  const patch = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const submit = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      const id = nextId();
      setTurns((prev) => [...prev, { id, userText: content, status: "thinking", tools: [], deltaText: "" }]);
      setInput("");
      setStreaming(true);

      // The SSE stream doesn't carry the session id; for a brand-new chat we
      // diff the session list after the turn finishes to learn the new id, then
      // reflect it in the URL without remounting (which would kill the stream).
      const isNewSession = sessionId === null;
      const beforeIdsPromise = isNewSession
        ? listSessions()
            .then((s) => new Set(s.map((x) => x.id)))
            .catch(() => new Set<string>())
        : Promise.resolve(new Set<string>());

      const adoptNewSession = async () => {
        if (!isNewSession) return;
        try {
          const [before, after] = await Promise.all([beforeIdsPromise, listSessions()]);
          const created = after.find((s) => !before.has(s.id));
          const newId = created?.id ?? after[0]?.id ?? null;
          if (newId) {
            setSessionId(newId);
            setIsPublic(created?.is_public ?? false);
            // History replace keeps the streamed turn mounted and rendered.
            window.history.replaceState(window.history.state, "", `/chat/${newId}`);
          }
        } catch {
          // Sharing is best-effort; the chat still works without a URL update.
        }
      };

      handleRef.current = streamCoachMessage(
        { content, sessionId, steamAccountId: account?.accountId ?? null },
        {
          onTool: (tool) =>
            patch(id, (t) => ({
              ...t,
              tools: [...t.tools.filter((x) => x.id !== tool.id), tool],
            })),
          onDelta: (delta) => patch(id, (t) => ({ ...t, deltaText: t.deltaText + delta })),
          onReport: (report) => patch(id, (t) => ({ ...t, report, status: "done" })),
          onTitle: () => {},
          onDone: () => {
            patch(id, (t) => ({ ...t, status: t.report || t.deltaText ? "done" : "error" }));
            setStreaming(false);
            void adoptNewSession();
          },
          onError: (err) => {
            patch(id, (t) => ({ ...t, status: "error", error: err }));
            setStreaming(false);
          },
        },
      );
    },
    [sessionId, streaming, patch, account],
  );

  const reset = () => {
    handleRef.current?.close();
    setTurns([]);
    setSessionId(null);
    setIsPublic(false);
    setStreaming(false);
    setLoadState("idle");
    navigate({ to: "/chat", search: {}, replace: true });
  };

  const empty = turns.length === 0;
  const showNotFound = loadState === "not-found";
  const showLoading = loadState === "loading";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col px-4">
      <div className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              Deadlock Coach
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="size-2.5" /> AI
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">Builds a custom report for every question.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && !demo && !showNotFound && !showLoading ? (
            <ShareToggle sessionId={sessionId} isPublic={isPublic} setIsPublic={setIsPublic} hasAccess={hasAccess} />
          ) : null}
          {account ? <SteamConnect account={account} onConnect={connect} onDisconnect={disconnect} /> : null}
          {(!empty || (sessionId && !showNotFound)) && !showLoading ? (
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <Plus className="size-3.5" /> New
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1">
        {showLoading ? (
          <LoadingState />
        ) : showNotFound ? (
          <NotFoundState onReset={reset} />
        ) : !hasAccess && !demo ? (
          empty ? (
            <NotFoundState onReset={reset} />
          ) : (
            <div className="space-y-8 pb-6">
              {turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} />
              ))}
              <div ref={bottomRef} />
            </div>
          )
        ) : !account && !demo ? (
          <SteamGate onConnect={connect} />
        ) : empty ? (
          <EmptyState onPick={(s) => setInput(s)} onSubmit={submit} disabled={streaming} />
        ) : (
          <div className="space-y-8 pb-6">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {hasAccess && (account || demo) && !showNotFound && !showLoading ? (
        <Composer value={input} onChange={setInput} onSubmit={() => submit(input)} disabled={streaming} />
      ) : null}
    </div>
  );
}

function ShareToggle({
  sessionId,
  isPublic,
  setIsPublic,
  hasAccess,
}: {
  sessionId: string;
  isPublic: boolean;
  setIsPublic: (b: boolean) => void;
  hasAccess: boolean | undefined;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (hasAccess && !isPublic) {
      void shareSession(sessionId)
        .then(() => {
          setIsPublic(true);
          return undefined;
        })
        .catch((err) => {
          console.error("Failed to share session:", err);
        });
    }

    const url = typeof window !== "undefined" ? `${window.location.origin}/chat/${sessionId}` : `/chat/${sessionId}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      return undefined;
    });
  };

  const revoke = () => {
    if (!hasAccess) return;
    void makeSessionPrivate(sessionId)
      .then(() => {
        setIsPublic(false);
        return undefined;
      })
      .catch((err) => {
        console.error("Failed to make private:", err);
      });
  };

  if (!hasAccess) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link to this chat"
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Link2 className="size-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link to this chat"
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
          isPublic
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:text-foreground",
        )}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : isPublic ? (
          <Globe className="size-3.5" />
        ) : (
          <Link2 className="size-3.5" />
        )}
        {copied ? "Copied" : isPublic ? "Public link" : "Copy public link"}
      </button>

      {isPublic && (
        <button
          type="button"
          onClick={revoke}
          aria-label="Make this chat private"
          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20"
        >
          <Lock className="size-3.5" />
          Make private
        </button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bot className="size-4 text-primary" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block size-1.5 rounded-full bg-primary"
              style={{ animation: "typing-bounce 1.2s infinite", animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span>loading chat</span>
      </div>
    </div>
  );
}

function NotFoundState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="relative mb-6">
        <div className="relative flex size-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
          <Bot className="size-8" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Chat not found</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This chat doesn't exist, or it belongs to a different account. Start a new one to get going.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-7 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        <Plus className="size-4" />
        New chat
      </button>
    </div>
  );
}

function SteamGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-pulse rounded-3xl bg-[#66c0f4]/20 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-3xl border border-[#66c0f4]/30 bg-[#66c0f4]/10 text-[#66c0f4] backdrop-blur">
          <CoachIcon name="users" className="size-8" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Connect your Steam account</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The coach analyzes <span className="text-foreground">your</span> matches, builds, and trends, so it needs to
        know which account is yours. Sign in with Steam to get started. We only read public match data.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="mt-7 flex items-center gap-2 rounded-xl bg-[#66c0f4] px-5 py-2.5 text-sm font-semibold text-[#06121d] transition hover:opacity-90"
      >
        <CoachIcon name="users" className="size-4" />
        Connect with Steam
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        You'll be redirected to Steam's secure login, then back here.
      </p>
    </div>
  );
}

function SteamConnect({
  account,
  onConnect,
  onDisconnect,
}: {
  account: { accountId: number } | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (account) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 pr-1.5 pl-2.5 text-xs">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="text-muted-foreground">
          Steam <span className="font-medium text-foreground">#{account.accountId}</span>
        </span>
        <button
          type="button"
          onClick={onDisconnect}
          aria-label="Disconnect Steam"
          className="ml-0.5 flex size-4 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onConnect}
      className="flex items-center gap-1.5 rounded-lg border border-[#66c0f4]/40 bg-[#66c0f4]/10 px-2.5 py-1.5 text-xs font-medium text-[#66c0f4] transition hover:bg-[#66c0f4]/20"
    >
      <CoachIcon name="users" className="size-3.5" />
      Connect Steam
    </button>
  );
}

function EmptyState({
  onPick,
  onSubmit,
  disabled,
}: {
  onPick: (s: string) => void;
  onSubmit: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 animate-pulse rounded-3xl bg-primary/20 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 text-primary backdrop-blur">
          <Bot className="size-8" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">What should we break down?</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Pick a starter or ask your own. The coach pulls live data and assembles a report with charts, a tactical map,
        and a match replay.
      </p>

      <div className="mt-7 w-full max-w-2xl space-y-2.5 text-left">
        <HeroMatchPrompt onSubmit={onSubmit} disabled={disabled} />
        <LastGamesPrompt
          icon="skull"
          title="Recent games review"
          description="common mistakes across your last"
          defaultN={20}
          build={(n) =>
            `Analyze my last ${n} games. What are my most common mistakes, and what are the two habits costing me the most?`
          }
          onSubmit={onSubmit}
          disabled={disabled}
        />
        <LastGamesPrompt
          icon="trending-up"
          title="Farm & economy trend"
          description="souls-per-minute trend over your last"
          defaultN={10}
          build={(n) =>
            `How has my farm and souls-per-minute trended over my last ${n} games? Show me where I fall off.`
          }
          onSubmit={onSubmit}
          disabled={disabled}
        />
        <TimePeriodPrompt onSubmit={onSubmit} disabled={disabled} />
        <FixedPrompt
          icon="trophy"
          title="Counter-build help"
          text="What should I build into a double-tank enemy team with a lot of sustain?"
          onSubmit={onSubmit}
          disabled={disabled}
        />
      </div>

      <button
        type="button"
        onClick={() => onPick("")}
        className="mt-4 text-xs text-muted-foreground transition hover:text-foreground"
      >
        or type your own question below
      </button>
    </div>
  );
}

// "Analyze my last match playing <hero>" — the hero is chosen inline.
function HeroMatchPrompt({ onSubmit, disabled }: { onSubmit: (s: string) => void; disabled: boolean }) {
  const [heroId, setHeroId] = useState<number | null>(null);
  const { hero } = useHeroById(heroId ?? 0);

  const go = () => {
    const name = heroId && hero ? hero.name : null;
    onSubmit(
      name
        ? `Analyze my last match playing ${name}. What went wrong, and what should I work on next game?`
        : "Analyze my last match. What went wrong, and what should I work on next game?",
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 sm:flex-row sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <CoachIcon name="swords" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Analyze my last match</p>
        <p className="text-xs text-muted-foreground">Scope it to a hero, or leave it on any.</p>
      </div>
      <div className="flex items-center gap-2">
        <HeroSelector selectedHero={heroId} onHeroSelected={setHeroId} allowSelectNull label="Hero" />
        <AnalyzeButton onClick={go} disabled={disabled} />
      </div>
    </div>
  );
}

// Shared layout for an interactive starter prompt.
function PromptRow({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:flex-row sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CoachIcon name={icon} className="size-4" />
      </span>
      <p className="shrink-0 text-sm font-medium text-foreground">{title}</p>
      <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

function AnalyzeButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
    >
      Analyze
      <CoachIcon name="arrow-right" className="size-3.5" />
    </button>
  );
}

// "Analyze my last N games" with a configurable N.
function LastGamesPrompt({
  icon,
  title,
  description,
  defaultN,
  build,
  onSubmit,
  disabled,
}: {
  icon: string;
  title: string;
  description: string;
  defaultN: number;
  build: (n: number) => string;
  onSubmit: (s: string) => void;
  disabled: boolean;
}) {
  const [n, setN] = useState(defaultN);
  return (
    <PromptRow icon={icon} title={title}>
      <span className="text-xs text-muted-foreground">{description}</span>
      <div className="w-28">
        <NumberSelectorBare value={n} onChange={setN} step={5} min={5} max={100} />
      </div>
      <span className="text-xs text-muted-foreground">games</span>
      <AnalyzeButton onClick={() => onSubmit(build(n))} disabled={disabled} />
    </PromptRow>
  );
}

// "Review all my matches from <period>".
function TimePeriodPrompt({ onSubmit, disabled }: { onSubmit: (s: string) => void; disabled: boolean }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0]);
  return (
    <PromptRow icon="clock" title="Matches by period">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              period.key === p.key ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <AnalyzeButton
        onClick={() =>
          onSubmit(`Review all my matches ${period.phrase}. Summarize how I'm playing and the top mistakes to fix.`)
        }
        disabled={disabled}
      />
    </PromptRow>
  );
}

function FixedPrompt({
  icon,
  title,
  text,
  onSubmit,
  disabled,
}: {
  icon: string;
  title: string;
  text: string;
  onSubmit: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSubmit(text)}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition hover:border-primary/40 hover:bg-white/[0.04] disabled:opacity-50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CoachIcon name={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{text}</span>
      </span>
      <CoachIcon
        name="arrow-right"
        className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </button>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-2.5 text-sm text-foreground">
          {turn.userText}
        </div>
      </div>

      {turn.status === "thinking" && !turn.report ? <ThinkingPanel turn={turn} /> : null}

      {turn.report ? (
        <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4 sm:p-5">
          <ReportRenderer report={turn.report} />
        </div>
      ) : null}

      {turn.status === "error" ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
          <p className="font-medium">The coach hit a snag.</p>
          <p className="mt-1 text-muted-foreground">{turn.error ?? "Something went wrong. Try again."}</p>
        </div>
      ) : null}
    </div>
  );
}

function ThinkingPanel({ turn }: { turn: Turn }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bot className="size-4 text-primary" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block size-1.5 rounded-full bg-primary"
              style={{ animation: "typing-bounce 1.2s infinite", animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span>building your report</span>
      </div>
      {turn.tools.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {turn.tools.map((tool) => (
            <div key={tool.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CoachIcon
                name={tool.isError ? "warning" : "check"}
                className={cn("size-3.5", tool.isError ? "text-destructive" : "text-emerald-400")}
              />
              {toolLabel(tool.name)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-white/[0.06] bg-background/80 px-4 py-3 backdrop-blur-xl">
      <div className="relative flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2 focus-within:border-primary/40">
        <textarea
          aria-label="Ask the coach a question"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder="Ask about a match, hero, build, or your trends…"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition enabled:hover:opacity-90 disabled:opacity-40"
          aria-label="Send"
        >
          <CornerDownLeft className="size-4" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Coach can be wrong. Grounded in live Deadlock API data, but verify high-stakes calls.
      </p>
    </div>
  );
}
