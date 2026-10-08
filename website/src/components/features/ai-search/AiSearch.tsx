import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCloseSideNavDrawer } from "~/components/patterns/navigation/SideNavShell";
import { Button } from "~/components/ui/button";
import { RollingText } from "~/components/ui/rolling-text";
import { SearchInput } from "~/components/ui/search-input";
import { MAX_QUESTION_LENGTH, QUESTIONS_PER_MINUTE } from "~/lib/ai-search/limits";
import { getAnalytics } from "~/lib/analytics";
import { cn } from "~/lib/utils";

import { setLastSearch, useLastSearch } from "./last-search";
import { useSearchShortcut } from "./search-shortcut";

/** Questions the home page's field rolls through as its placeholder, to show what it can be asked. */
const PLACEHOLDER_QUESTIONS = [
  "who counters abrams",
  "best heroes in eternus this patch",
  "when to buy toxic bullets on haze",
  "how long are games in phantom+",
  "top players in europe",
];

const ASK = "Ask anything";
const FINDING = "Finding the page";

/** One `ai_search` event per question, with the question itself: what visitors ask, how often, and where it led. */
function trackQuestion(event: {
  question: string;
  source: "home" | "sidebar";
  outcome: "opened" | "not_understood" | "player_lookup" | "match_lookup" | "rate_limited" | "error";
  page?: string;
  direct?: boolean;
  duration_ms?: number;
}) {
  void getAnalytics().then((posthog) =>
    posthog?.capture("ai_search", {
      page: null,
      direct: false,
      ...event,
      duration_ms: event.duration_ms === undefined ? null : Math.round(event.duration_ms),
    }),
  );
}

interface AiSearchProps {
  /**
   * `default` is the home page's search bar, its button inside it and example questions rolling through its
   * placeholder. `sm` is the sidebar's field, which shows its progress inside. `/` or Ctrl+K focus the bar where there
   * is one, the sidebar's field elsewhere.
   */
  size?: "default" | "sm";
  className?: string;
}

/**
 * A question in plain words, read by Mercury Decide, which opens the page of the site that answers it, already
 * filtered. It never answers itself. The field keeps the question after it opens the page, and a question it cannot
 * place is said in a toast, so nothing around the field ever moves.
 */
export function AiSearch({ size = "default", className }: AiSearchProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const closeDrawer = useCloseSideNavDrawer();
  const last = useLastSearch();
  /** What was typed here, and which answer it was typed after: a newer answer shows its question instead. */
  const [draft, setDraft] = useState({ text: "", version: 0 });
  const [searching, setSearching] = useState(false);
  const [unmatched, setUnmatched] = useState(false);
  /** The question asked last: an answer to an earlier one that arrives late is dropped. */
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );

  const home = size === "default";
  useSearchShortcut(input, home);

  const question = last && last.version !== draft.version ? last.question : draft.text;

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const asked = ++latest.current;
    setSearching(true);
    setUnmatched(false);
    // The search's code (the page registry, the name matcher, the catalogs) loads with the first question.
    import("./route-question")
      .then(({ routeQuestion }) => routeQuestion(queryClient, trimmed))
      .then(
        (routed) => {
          if (asked !== latest.current) return undefined;
          setSearching(false);
          trackQuestion({
            question: trimmed,
            source: home ? "home" : "sidebar",
            outcome: routed.kind,
            page: routed.kind === "opened" ? routed.id : undefined,
            direct: routed.direct,
            duration_ms: routed.durationMs,
          });
          if (routed.kind === "rate_limited") {
            toast(`That's a lot of questions. You can ask ${QUESTIONS_PER_MINUTE} a minute; try again shortly.`);
            return undefined;
          }
          if (routed.kind === "player_lookup") {
            setUnmatched(true);
            toast("We don't have player stats. Try asking about a hero, an item or a stat.");
            return undefined;
          }
          if (routed.kind === "match_lookup") {
            setUnmatched(true);
            toast("We don't have stats for single matches. Try asking about a hero, an item or a stat.");
            return undefined;
          }
          if (routed.kind === "not_understood") {
            setUnmatched(true);
            toast("Sorry, I didn't understand that. Try asking about a hero, an item or a stat.");
            return undefined;
          }
          setLastSearch(trimmed);
          closeDrawer();
          return navigate({ href: routed.href });
        },
        () => {
          if (asked !== latest.current) return;
          setSearching(false);
          trackQuestion({ question: trimmed, source: home ? "home" : "sidebar", outcome: "error" });
          toast("The search is unavailable right now", { action: { label: "Try again", onClick: () => ask(trimmed) } });
        },
      );
  };

  return (
    <search aria-label="Find a stat" className={cn("w-full", home && "max-w-2xl", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <SearchInput
          ref={input}
          name="q"
          variant={home ? "bar" : "default"}
          size={size}
          loading={!home && searching}
          loadingLabel={FINDING}
          shortcut="/"
          aria-label="Ask for a stat"
          aria-invalid={unmatched || undefined}
          placeholder={home ? ASK : "Ask for a stat"}
          placeholderContent={
            home ? (
              <>
                {ASK}:&nbsp;
                <RollingText>
                  {PLACEHOLDER_QUESTIONS.map((example) => (
                    <span key={example}>{example}</span>
                  ))}
                </RollingText>
              </>
            ) : undefined
          }
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onValueChange={(text) => {
            setDraft({ text, version: last?.version ?? 0 });
            setUnmatched(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && searching) {
              // Drops the running question instead of clearing the field.
              event.preventDefault();
              latest.current += 1;
              setSearching(false);
            }
          }}
          action={
            home && (
              <Button type="submit" shape="pill" loading={searching} loadingLabel={FINDING}>
                Search
              </Button>
            )
          }
        />
      </form>
    </search>
  );
}
