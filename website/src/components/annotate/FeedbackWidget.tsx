import { Check, MessageSquarePlus, MousePointerClick, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ElementPicker } from "~/components/annotate/ElementPicker";
import { Button } from "~/components/ui/button";
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

const MAX_COMMENT_LENGTH = 2000;
const MAX_ELEMENT_TEXT_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const COUNTER_VISIBLE_FROM = 1800;
const NICKNAME_STORAGE_KEY = "feedback-nickname";

interface Target {
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

function TargetCard({
  target,
  onPickAnother,
  onDetach,
}: {
  target: Target;
  onPickAnother: () => void;
  onDetach: () => void;
}) {
  return (
    <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Check className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{target.source?.component ?? "Selected element"}</span>
          </div>
          <div
            className="truncate font-mono text-[0.7rem] text-muted-foreground"
            title={target.source ? formatSource(target.source) : target.selector}
          >
            {target.source ? formatSource(target.source) : target.selector}
          </div>
          {target.elementText && (
            <div className="mt-1 truncate text-xs text-muted-foreground italic">"{target.elementText}"</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={onDetach}
          aria-label="Remove the attached element"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <Button variant="secondary" size="sm" className="mt-2 h-7 w-full text-xs" onClick={onPickAnother}>
        Pick a different element
      </Button>
    </div>
  );
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [comment, setComment] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const focusComment = useCallback((element: HTMLTextAreaElement | null) => element?.focus(), []);

  // Deferred to the open handler: `localStorage` does not exist during SSR.
  const openPanel = useCallback(() => {
    setNickname((current) => current || (localStorage.getItem(NICKNAME_STORAGE_KEY) ?? ""));
    setOpen(true);
  }, []);

  const startPicking = useCallback(() => {
    void prefetchManifest().then(() => setPicking(true));
    setOpen(false);
  }, []);

  const handlePick = useCallback((element: HTMLElement) => {
    setTarget({
      source: resolveSource(element),
      selector: buildSelector(element),
      elementText: (element.textContent ?? "").trim().slice(0, MAX_ELEMENT_TEXT_LENGTH),
    });
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
        kind: target ? "annotation" : "general",
        comment: comment.trim(),
        nickname: nickname.trim() || undefined,
        page_url: pageUrl(),
        build_id: BUILD_ID,
        source: target?.source ?? undefined,
        selector: target?.selector,
        element_text: target?.elementText || undefined,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          device_pixel_ratio: window.devicePixelRatio,
        },
      };
      await submitFeedback(submission);
      localStorage.setItem(NICKNAME_STORAGE_KEY, nickname.trim());
      toast.success("Thanks! Your feedback was sent.");
      setComment("");
      setTarget(null);
      setOpen(false);
    } catch (error) {
      toast.error(userFacingError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (picking) {
    return <ElementPicker onPick={handlePick} onCancel={cancelPicking} />;
  }

  return (
    <div className="fixed right-4 bottom-4 z-[90] print:hidden" data-feedback-ui>
      {open ? (
        <div className="max-h-[calc(100vh-2rem)] w-[23rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Help improve this site</h2>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Tell us what is off. Attach a component and we will know exactly which part of the code to look at.
          </p>

          {target ? (
            <TargetCard target={target} onPickAnother={startPicking} onDetach={() => setTarget(null)} />
          ) : (
            <Button variant="secondary" size="sm" className="mb-3 w-full" onClick={startPicking}>
              <MousePointerClick className="size-4" />
              Point at something on the page
            </Button>
          )}

          <textarea
            ref={focusComment}
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder={target ? "What is wrong with this part?" : "What could be better?"}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/10 bg-background/60 p-2 text-sm outline-none focus:border-primary"
          />
          {comment.length >= COUNTER_VISIBLE_FROM && (
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {MAX_COMMENT_LENGTH - comment.length} characters left
            </p>
          )}
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Name (optional, so we can credit you)"
            className="mt-2 w-full rounded-lg border border-white/10 bg-background/60 p-2 text-sm outline-none focus:border-primary"
          />

          <Button className="mt-3 w-full" disabled={!comment.trim() || submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </div>
      ) : (
        <Button size="sm" className="shadow-lg" onClick={openPanel}>
          <MessageSquarePlus className="size-4" />
          Feedback
        </Button>
      )}
    </div>
  );
}
