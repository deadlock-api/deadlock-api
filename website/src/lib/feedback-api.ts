import { fetchApi } from "~/lib/http";

export type FeedbackKind = "annotation" | "general";

export interface FeedbackSubmission {
  kind: FeedbackKind;
  comment: string;
  nickname?: string;
  page_url: string;
  build_id?: string;
  source?: {
    file: string;
    line: number;
    column: number;
    component?: string;
    chain: string[];
  };
  selector?: string;
  element_text?: string;
  viewport?: {
    width: number;
    height: number;
    device_pixel_ratio: number;
  };
}

// Wildcard CORS on the submit endpoint forbids credentials: sending the patron
// cookie would make the browser reject the response.
export async function submitFeedback(submission: FeedbackSubmission): Promise<void> {
  await fetchApi("/v1/feedback", { method: "POST", body: submission, credentials: "omit" });
}
