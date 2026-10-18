import { Check, MessageSquarePlus, MousePointerClick, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ElementPicker } from "~/components/features/annotate/ElementPicker";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Heading } from "~/components/ui/heading";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Inline, Stack } from "~/components/ui/stack";
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

const TARGET_PROMPT = "What would you change about this part?";
const GENERAL_PROMPT = "What could be better?";

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
                className="truncate font-mono text-xs text-muted-foreground"
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
  const titleId = useId();
  const nameId = useId();
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const closePanel = useCallback(() => setOpen(false), []);

  // The nickname is read when the panel opens: `localStorage` does not exist during SSR.
  const onOpenChange = useCallback((next: boolean) => {
    if (next) setNickname((current) => current || (readLocalStorage(NICKNAME_STORAGE_KEY) ?? ""));
    setOpen(next);
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
      closePanel();
    } catch (error) {
      toast.error(userFacingError(error));
    }
    setSubmitting(false);
  };

  if (picking) {
    return <ElementPicker onPick={handlePick} onCancel={cancelPicking} />;
  }

  // The panel is a popover dialog over its launcher: Escape from any control closes it, Tab stays inside, and the
  // focus goes back to the launcher (Law 17).
  return (
    <div
      className="pointer-events-none fixed inset-4 z-90 flex flex-col items-end justify-end print:hidden"
      data-feedback-ui
    >
      <Popover open={open} onOpenChange={onOpenChange} modal>
        <PopoverTrigger asChild>
          <Button size="sm" elevation="raised" className="pointer-events-auto" aria-label="Feedback">
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          collisionPadding={16}
          aria-labelledby={titleId}
          data-feedback-ui
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            commentRef.current?.focus();
          }}
          className="z-90 flex max-h-(--radix-popover-content-available-height) w-92 max-w-(--radix-popover-content-available-width) flex-col gap-3 overflow-y-auto"
        >
          <Inline justify="between" wrap="nowrap">
            <Heading as="h2" id={titleId}>
              Help improve this site
            </Heading>
            <Button variant="ghost" size="icon-sm" onClick={closePanel} aria-label="Close">
              <X className="size-4" />
            </Button>
          </Inline>

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
              ref={commentRef}
              value={comment}
              maxLength={MAX_COMMENT_LENGTH}
              onChange={(event) => setComment(event.target.value)}
              placeholder={targets.length > 0 ? TARGET_PROMPT : GENERAL_PROMPT}
              rows={5}
              className="field-sizing-fixed resize-y"
            />
          </Field>
          <Field label="Name (optional)" orientation="horizontal" htmlFor={nameId}>
            <Input
              id={nameId}
              name="nickname"
              autoComplete="nickname"
              spellCheck={false}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="min-w-0 flex-1"
            />
          </Field>

          <Button className="w-full" disabled={!comment.trim() || submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
