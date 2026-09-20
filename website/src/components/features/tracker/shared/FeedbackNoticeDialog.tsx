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
import { readLocalStorage, writeLocalStorage } from "~/lib/local-storage";

const STORAGE_KEY = "tracker-feedback-notice-dismissed";

export function FeedbackNoticeDialog() {
  const [open, setOpen] = useState(() => {
    // `localStorage` does not exist during SSR; the dialog opens on hydration.
    if (typeof window === "undefined") return false;
    return readLocalStorage(STORAGE_KEY) !== "true";
  });
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
    if (!nextOpen && dontShowAgain) writeLocalStorage(STORAGE_KEY, "true");
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help shape the Player Tracker</DialogTitle>
          <DialogDescription className="flex flex-col gap-2 pt-1 text-start">
            <span className="block">
              This page is brand new and we need a lot of feedback to make it better. Use the feedback button in the
              bottom-right corner to tell us what you think.
            </span>
            <span className="block">
              You can also annotate exact parts of the page to point out precisely what you mean. All feedback is
              completely anonymous.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <CheckboxField
            id="tracker-feedback-dont-show-again"
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
