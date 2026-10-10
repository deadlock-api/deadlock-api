import { FeedbackNoticeDialog } from "~/components/domain/feedback/FeedbackNoticeDialog";

/**
 * Guess the Rank's feedback notice, remembered apart from the tracker's. `ready` is the game's pause: it never opens
 * while a clip is being watched or a guess is being picked.
 */
export function GuessTheRankFeedbackNotice({ ready }: { ready: boolean }) {
  return (
    <FeedbackNoticeDialog
      storageKey="guess-the-rank-feedback-notice-dismissed"
      title="Help shape Guess the Rank"
      ready={ready}
    >
      <span className="block">
        This game is brand new and we need a lot of feedback to make it better: the clips, the ranks, the scoring. Use
        the feedback button in the bottom-right corner to tell us what you think.
      </span>
      <span className="block">
        You can also annotate exact parts of the page to point out precisely what you mean. All feedback is completely
        anonymous.
      </span>
    </FeedbackNoticeDialog>
  );
}
