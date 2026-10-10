import { FeedbackNoticeDialog as FeedbackNotice } from "~/components/domain/feedback/FeedbackNoticeDialog";

/** The Player Tracker's feedback notice, remembered under its own key. */
export function FeedbackNoticeDialog() {
  return (
    <FeedbackNotice storageKey="tracker-feedback-notice-dismissed" title="Help shape the Player Tracker">
      <span className="block">
        This page is brand new and we need a lot of feedback to make it better. Use the feedback button in the
        bottom-right corner to tell us what you think.
      </span>
      <span className="block">
        You can also annotate exact parts of the page to point out precisely what you mean. All feedback is completely
        anonymous.
      </span>
    </FeedbackNotice>
  );
}
