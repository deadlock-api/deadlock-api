import { FeedbackNoticeDialog as FeedbackNotice } from "~/components/domain/feedback/FeedbackNoticeDialog";

/** The Player Tracker's feedback notice, remembered under its own key. */
export function FeedbackNoticeDialog() {
  return <FeedbackNotice storageKey="tracker-feedback-notice-dismissed" title="Help shape the Player Tracker" />;
}
