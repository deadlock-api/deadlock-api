import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { CheckboxField } from "~/components/ui/checkbox-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useHydrated } from "~/hooks/useHydrated";
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";

/**
 * Asks for feedback on a new page and points at the feedback launcher (rendered by the root layout), which it
 * spotlights while open. It opens on every visit until the visitor closes it with "Don't show again" checked, which is
 * remembered under `storageKey`: each page has its own key, so dismissing one page's notice leaves the others.
 * `ready` holds it back until the page is at a pause (a game between rounds); once open it stays until closed.
 * Children are the description's paragraphs.
 */
export function FeedbackNoticeDialog({
  storageKey,
  title = "Help shape this page",
  ready = true,
  children = "This page is brand new and we need a lot of feedback to make it better. Use the feedback button in the bottom-right corner to tell us what you think.",
}: {
  /** Where "Don't show again" is remembered; one per page. */
  storageKey: string;
  title?: React.ReactNode;
  ready?: boolean;
  children?: React.ReactNode;
}) {
  // Storage exists only in the browser, so the notice opens on the render after hydration: opened by the first one,
  // the client's markup differed from the server's.
  const hydrated = useHydrated();
  const [closed, setClosed] = useState(false);
  const open = hydrated && ready && !closed && readLocalStorage(storageKey) !== "true";
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Spotlights the feedback launcher (rendered by the root layout) while the notice is open.
  useEffect(() => {
    if (!open) return;
    document.body.dataset.feedbackSpotlight = "true";
    return () => {
      delete document.body.dataset.feedbackSpotlight;
    };
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dontShowAgain) writeLocalStorage(storageKey, "true");
    setClosed(!nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-slot="feedback-notice-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex flex-col gap-2 pt-1 text-start">{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <CheckboxField
            label="Don't show again"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <Button onClick={() => handleOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
