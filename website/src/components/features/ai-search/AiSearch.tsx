import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleHelpIcon, CircleSlashIcon, CloudOffIcon, TimerIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useCloseSideNavDrawer } from "~/components/patterns/navigation/SideNavShell";
import { Button } from "~/components/ui/button";
import { Callout, CalloutAnchor, CalloutContent, CalloutDescription, CalloutTitle } from "~/components/ui/callout";
import { useListboxCursor } from "~/components/ui/hooks/use-listbox-cursor";
import { Popover, PopoverAnchor, PopoverContent, sideWithRoom } from "~/components/ui/popover";
import { RollingText } from "~/components/ui/rolling-text";
import { SearchInput } from "~/components/ui/search-input";
import { Inline } from "~/components/ui/stack";
import { MAX_QUESTION_LENGTH, QUESTIONS_PER_MINUTE } from "~/lib/ai-search/limits";
import { getAnalytics } from "~/lib/analytics";
import { cn } from "~/lib/utils";

import { setLastSearch, useLastSearch } from "./last-search";
import { useSearchShortcut } from "./search-shortcut";
import { SuggestionList } from "./SuggestionList";
import { routeQueryOptions, type Suggestion, useSuggestions } from "./use-suggestions";

/** Questions the home page's field rolls through as its placeholder, to show what it can be asked. */
const PLACEHOLDER_QUESTIONS = [
  "who counters abrams",
  "best heroes in eternus this patch",
  "when to buy toxic bullets on haze",
  "how long are games in phantom+",
  "top players in europe",
];

/** Questions under the home page's bar, one click each, so it is plain what the search is for. */
const EXAMPLE_QUESTIONS = ["Who counters Abrams", "Best items on Bebop", "Haze win rate in Seeker"];

const ASK = "Ask anything";
const TRY = "Try asking about a hero, an item or a stat.";
const FINDING = "Finding the page";

/** Where a question was asked: the home page's bar, the sidebar's field, or one of the example questions. */
type Source = "home" | "sidebar" | "example";

/** One `ai_search` event per question, with the question itself: what visitors ask, how often, and where it led. */
function trackQuestion(event: {
  question: string;
  source: Source;
  outcome: "opened" | Notice;
  page?: string;
  direct?: boolean;
  duration_ms?: number;
  /** For a question no page answers: how many Steam players the dropdown offered in its place. */
  players?: number;
}) {
  void getAnalytics().then((posthog) =>
    posthog?.capture("ai_search", {
      page: null,
      direct: false,
      players: null,
      ...event,
      duration_ms: event.duration_ms === undefined ? null : Math.round(event.duration_ms),
    }),
  );
}

/** Why a question opened no page, said in a callout under the field. */
type Notice = "not_understood" | "player_not_found" | "rate_limited" | "error";

const NOTICES: Record<
  Notice,
  { variant: "info" | "warning" | "destructive"; icon: React.ReactNode; title: string; description: string }
> = {
  not_understood: {
    variant: "warning",
    icon: <CircleHelpIcon />,
    title: "Sorry, I didn't understand that",
    description: TRY,
  },
  player_not_found: {
    variant: "info",
    icon: <CircleSlashIcon />,
    title: "No player found",
    description: "Paste their Steam ID or profile link, or try their exact Steam name.",
  },
  rate_limited: {
    variant: "warning",
    icon: <TimerIcon />,
    title: "That's a lot of questions",
    description: `You can ask ${QUESTIONS_PER_MINUTE} a minute; try again shortly.`,
  },
  error: {
    variant: "destructive",
    icon: <CloudOffIcon />,
    title: "The search is unavailable right now",
    description: "Press Enter to try again.",
  },
};

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
 * place is said in a callout over the page under the field, so nothing around the field ever moves.
 */
export function AiSearch({ size = "default", className }: AiSearchProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const closeDrawer = useCloseSideNavDrawer();
  const last = useLastSearch();
  /** What was typed here, and which answer it was typed after: a newer answer shows its question instead. */
  const [draft, setDraft] = useState({ text: "", version: 0 });
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeId = useId();
  /** The question asked last: an answer to an earlier one that arrives late is dropped. */
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  /** The dropdown under the field: open while the field has focus and something typed, until Escape or a pick. */
  const [listOpen, setListOpen] = useState(false);
  /**
   * The side the dropdown opens on, chosen when the field takes the focus with room for the list at its full height
   * (max-h-96), and kept while results arrive, so the list never jumps over the field under the pointer.
   */
  const [listSide, setListSide] = useState<"top" | "bottom">("bottom");
  const chooseListSide = (field: HTMLElement) => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    setListSide(sideWithRoom(field, 24 * rem));
  };

  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );

  const home = size === "default";
  const ownsShortcut = useSearchShortcut(input, home);

  const question = last && last.version !== draft.version ? last.question : draft.text;
  const suggestions = useSuggestions(question, listOpen);
  const rows = suggestions.all;
  const showList =
    listOpen && !searching && question.trim().length >= 2 && (rows.length > 0 || suggestions.pagePending);
  /** The row the keyboard cursor is on, and whether the reader put it there. */
  const cursor = useListboxCursor(rows, { open: showList });
  const active = cursor.active;

  const ask = (text: string, source: Source = home ? "home" : "sidebar") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const asked = ++latest.current;
    setSearching(true);
    setNotice(null);
    // The search's code (the page registry, the name matcher, the catalogs) loads with the first question. A question
    // the dropdown already routed is answered from its cache.
    queryClient.query(routeQueryOptions(queryClient, trimmed)).then(
      (routed) => {
        if (asked !== latest.current) return undefined;
        setSearching(false);
        trackQuestion({
          question: trimmed,
          source,
          outcome: routed.kind,
          page: routed.kind === "opened" ? routed.id : undefined,
          direct: routed.direct,
          duration_ms: routed.durationMs,
          players: routed.kind === "not_understood" ? routed.players : undefined,
        });
        if (routed.kind === "not_understood" && routed.players > 0) {
          // A name no page answers: the dropdown's players are the answer, with the cursor on the first one (once
          // the players are in, if they are still loading).
          cursor.preferFirst((row) => row.kind === "player");
          input.current?.focus();
          setListOpen(true);
          return undefined;
        }
        if (routed.kind !== "opened") {
          setNotice(routed.kind);
          return undefined;
        }
        setLastSearch(trimmed);
        closeDrawer();
        return navigate({ href: routed.href });
      },
      () => {
        if (asked !== latest.current) return;
        setSearching(false);
        trackQuestion({ question: trimmed, source, outcome: "error" });
        setNotice("error");
      },
    );
  };

  const pick = (row: Suggestion) => {
    const trimmed = question.trim();
    trackQuestion({
      question: trimmed,
      source: home ? "home" : "sidebar",
      outcome: "opened",
      page: { page: row.kind === "page" ? row.id : "", match: "match", hero: "hero_page", player: "player-tracker" }[
        row.kind
      ],
    });
    if (row.kind === "page") setLastSearch(trimmed);
    setListOpen(false);
    closeDrawer();
    input.current?.blur();
    void navigate({ href: row.href });
  };

  return (
    <search
      aria-label={home ? ASK : "Site search"}
      className={cn("flex w-full flex-col gap-3", home && "max-w-2xl", className)}
    >
      <Callout open={notice !== null} onOpenChange={(open) => !open && setNotice(null)}>
        {/* The dropdown has its own popover root inside the callout's anchor: Radix binds an anchor to the nearest root,
            so nested the other way round the callout would claim the dropdown's anchor. */}
        <CalloutAnchor asChild>
          <div className="w-full">
            <Popover open={showList} onOpenChange={setListOpen}>
              <PopoverAnchor asChild>
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
                    shortcut={ownsShortcut ? "/" : undefined}
                    aria-label={home ? ASK : "Ask for a stat"}
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SearchInput renders a native text input; this is the WAI-ARIA combobox pattern
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={cursor.listId}
                    aria-autocomplete="list"
                    aria-activedescendant={cursor.activeId}
                    onFocus={(event) => {
                      chooseListSide(event.currentTarget);
                      setListOpen(true);
                    }}
                    onBlur={() => setListOpen(false)}
                    aria-invalid={notice === "not_understood" || undefined}
                    aria-describedby={notice ? noticeId : undefined}
                    placeholder={home ? ASK : "Ask for a stat"}
                    placeholderLead={home ? `${ASK}:` : undefined}
                    placeholderContent={
                      home ? (
                        <RollingText>
                          {PLACEHOLDER_QUESTIONS.map((example) => (
                            <span key={example}>{example}</span>
                          ))}
                        </RollingText>
                      ) : undefined
                    }
                    autoComplete="off"
                    enterKeyHint="search"
                    maxLength={MAX_QUESTION_LENGTH}
                    value={question}
                    onValueChange={(text) => {
                      setDraft({ text, version: last?.version ?? 0 });
                      setNotice(null);
                      setListOpen(true);
                      cursor.reset();
                    }}
                    onKeyDown={(event) => {
                      if (cursor.onKeyDown(event)) return;
                      // Enter opens the row under the cursor, the top one unless the arrows moved it. While the page for
                      // the question is still being worked out, the top row could be a hero the question merely names, so
                      // Enter asks as before.
                      if (
                        event.key === "Enter" &&
                        showList &&
                        rows[active] &&
                        (cursor.moved || !suggestions.pagePending)
                      ) {
                        event.preventDefault();
                        pick(rows[active]);
                        return;
                      }
                      if (event.key === "Escape" && showList) {
                        event.preventDefault();
                        setListOpen(false);
                        return;
                      }
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
              </PopoverAnchor>
              <PopoverContent
                side={listSide}
                fit="available"
                align="start"
                className="w-(--radix-popover-trigger-width) p-1"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={(event) => input.current?.contains(event.target as Node) && event.preventDefault()}
              >
                <SuggestionList
                  id={cursor.listId}
                  suggestions={suggestions}
                  getOptionProps={cursor.getOptionProps}
                  onPick={pick}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CalloutAnchor>
        {notice && (
          <CalloutContent id={noticeId} variant={NOTICES[notice].variant}>
            {NOTICES[notice].icon}
            <CalloutTitle>{NOTICES[notice].title}</CalloutTitle>
            <CalloutDescription>{NOTICES[notice].description}</CalloutDescription>
          </CalloutContent>
        )}
      </Callout>
      {home && (
        <Inline justify="center">
          {EXAMPLE_QUESTIONS.map((example) => (
            <Button
              key={example}
              type="button"
              variant="subtle"
              size="sm"
              shape="pill"
              onClick={() => {
                setDraft({ text: example, version: last?.version ?? 0 });
                ask(example, "example");
              }}
            >
              {example}
            </Button>
          ))}
        </Inline>
      )}
    </search>
  );
}
