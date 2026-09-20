import { Check, MessageSquarePlus, MousePointerClick, X } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { toast } from "sonner";

import { ElementPicker } from "~/components/features/annotate/ElementPicker";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Heading } from "~/components/ui/heading";
import { Input } from "~/components/ui/input";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import {
  BUILD_ID,
  buildSelector,
  formatSource,
  prefetchManifest,
  resolveSource,
  type SourceLocation,
} from "~/lib/annotation-source";
import { type FeedbackSubmission, submitFeedback } from "~/lib/feedback-api";
import { ApiError } from "~/lib/http";
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";

const MAX_COMMENT_LENGTH = 2000;
const MAX_ELEMENT_TEXT_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const COUNTER_VISIBLE_FROM = 1800;
const NICKNAME_STORAGE_KEY = "feedback-nickname";

// Textareas render newlines in a placeholder, so the prompts can ask for more
// than bug reports without turning into one long sentence.
const TARGET_PROMPT = `What is wrong with this part?
What would you change about it?
What would you like to see here instead?`;

const GENERAL_PROMPT = `What could be better?
Which feature are you missing?
What would make this site more useful to you?`;

interface Target {
  id: string;
  source: SourceLocation | null;
  selector: string;
  elementText: string;
}

// Only the API's own validation and rate-limit messages are worth showing;
// anything else would surface noise like "HTTP 404:".
function userFacingError(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 429) return "You have sent a lot of feedback recently, please try again later.";
  if (status === 400 && error instanceof ApiError && error.message.trim()) return error.message;
  return "Could not send feedback, please try again in a moment.";
}

function pageUrl(): string {
  const { href, origin, pathname } = window.location;
  return href.length <= MAX_URL_LENGTH ? href : `${origin}${pathname}`;
}

function TargetList({
  targets,
  onPickAgain,
  onDetach,
}: {
  targets: Target[];
  onPickAgain: () => void;
  onDetach: (id: string) => void;
}) {
  return (
    <Card tone="primary" size="xs" className="p-2.5">
      <Stack gap={2} className="max-h-52 overflow-y-auto">
        {targets.map((target) => (
          <div key={target.id} className="flex items-start justify-between gap-2">
            <Stack gap={0.5}>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Check className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{target.source?.component ?? "Selected element"}</span>
              </div>
              <div
                className="truncate font-mono text-2xs text-muted-foreground"
                title={target.source ? formatSource(target.source) : target.selector}
              >
                {target.source ? formatSource(target.source) : target.selector}
              </div>
              {target.elementText && (
                <div className="truncate text-xs text-muted-foreground italic">"{target.elementText}"</div>
              )}
            </Stack>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={() => onDetach(target.id)}
              aria-label="Remove the attached element"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
      </Stack>
      <Button variant="secondary" size="xs" className="w-full" onClick={onPickAgain}>
        Pick different elements
      </Button>
    </Card>
  );
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [comment, setComment] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const commentId = useId();

  const focusComment = useCallback((element: HTMLTextAreaElement | null) => element?.focus(), []);

  // Deferred to the open handler: `localStorage` does not exist during SSR.
  const openPanel = useCallback(() => {
    setNickname((current) => current || (readLocalStorage(NICKNAME_STORAGE_KEY) ?? ""));
    setOpen(true);
  }, []);

  const startPicking = useCallback(() => {
    void prefetchManifest().then(() => setPicking(true));
    setOpen(false);
  }, []);

  const handlePick = useCallback((elements: HTMLElement[]) => {
    setTargets(
      elements.map((element) => ({
        id: crypto.randomUUID(),
        source: resolveSource(element),
        selector: buildSelector(element),
        elementText: (element.textContent ?? "").trim().slice(0, MAX_ELEMENT_TEXT_LENGTH),
      })),
    );
    setPicking(false);
    setOpen(true);
  }, []);

  const cancelPicking = useCallback(() => {
    setPicking(false);
    setOpen(true);
  }, []);

  const handleSubmit = async () => {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const submission: FeedbackSubmission = {
        kind: targets.length > 0 ? "annotation" : "general",
        comment: comment.trim(),
        nickname: nickname.trim() || undefined,
        page_url: pageUrl(),
        build_id: BUILD_ID,
        targets: targets.map((target) => ({
          source: target.source ?? undefined,
          selector: target.selector,
          element_text: target.elementText || undefined,
        })),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          device_pixel_ratio: window.devicePixelRatio,
        },
      };
      await submitFeedback(submission);
      writeLocalStorage(NICKNAME_STORAGE_KEY, nickname.trim());
      toast.success("Thanks! Your feedback was sent.");
      setComment("");
      setTargets([]);
      setOpen(false);
    } catch (error) {
      toast.error(userFacingError(error));
    }
    setSubmitting(false);
  };

  if (picking) {
    return <ElementPicker onPick={handlePick} onCancel={cancelPicking} />;
  }

  return (
    <div
      className="pointer-events-none fixed inset-4 z-90 flex flex-col items-end justify-end print:hidden"
      data-feedback-ui
    >
      {open ? (
        <Card
          tone="floating"
          size="sm"
          className="pointer-events-auto max-h-full w-92 max-w-full gap-3 overflow-y-auto p-4"
        >
          <Stack gap={1}>
            <Inline justify="between" wrap="nowrap">
              <Heading as="h2">Help improve this site</Heading>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-4" />
              </Button>
            </Inline>
            <Text as="p" variant="caption" tone="muted">
              Tell us what is off. Attach a component and we will know exactly which part of the code to look at.
            </Text>
          </Stack>

          {targets.length > 0 ? (
            <TargetList
              targets={targets}
              onPickAgain={startPicking}
              onDetach={(id) => setTargets((current) => current.filter((target) => target.id !== id))}
            />
          ) : (
            <Button variant="secondary" size="sm" className="w-full" onClick={startPicking}>
              <MousePointerClick className="size-4" />
              Point at something on the page
            </Button>
          )}

          <Field
            label="Your feedback"
            labelDisplay="hidden"
            htmlFor={commentId}
            counter={
              comment.length >= COUNTER_VISIBLE_FROM ? `${MAX_COMMENT_LENGTH - comment.length} characters left` : null
            }
          >
            <Textarea
              id={commentId}
              ref={focusComment}
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder={targets.length > 0 ? TARGET_PROMPT : GENERAL_PROMPT}
              rows={5}
              className="field-sizing-fixed resize-y"
            />
          </Field>
          <Input
            aria-label="Name (optional)"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Name (optional, so we can credit you)"
          />

          <Button className="w-full" disabled={!comment.trim() || submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </Card>
      ) : (
        <Button size="sm" elevation="raised" className="pointer-events-auto" onClick={openPanel} aria-label="Feedback">
          <MessageSquarePlus className="size-4" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      )}
    </div>
  );
}
