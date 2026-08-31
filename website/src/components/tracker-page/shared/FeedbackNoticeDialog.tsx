import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";

const STORAGE_KEY = "tracker-feedback-notice-dismissed";

export function FeedbackNoticeDialog() {
  const [open, setOpen] = useState(() => {
    // `localStorage` does not exist during SSR; the dialog opens on hydration.
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) !== "true";
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
    if (!nextOpen && dontShowAgain) localStorage.setItem(STORAGE_KEY, "true");
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help shape the Player Tracker</DialogTitle>
          <DialogDescription className="space-y-2 pt-1 text-left">
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="tracker-feedback-dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label htmlFor="tracker-feedback-dont-show-again" className="text-sm font-normal text-muted-foreground">
              Don't show again
            </Label>
          </div>
          <Button onClick={() => handleOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
