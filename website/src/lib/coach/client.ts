import { SSE } from "sse.js";

import type { Report } from "./report";

export const COACH_API_ORIGIN = (
  import.meta.env.VITE_COACH_API_URL ||
  import.meta.env.VITE_AI_ASSISTANT_API_URL ||
  "https://ai.deadlock-api.com"
).replace(/\/+$/, "");

export interface ToolActivity {
  id: string;
  name: string;
  isError: boolean;
}

export interface CoachStreamHandlers {
  onUserMessage?: (id: string) => void;
  onDelta?: (text: string) => void;
  onTool?: (tool: ToolActivity) => void;
  onReport?: (report: Report, messageId: string) => void;
  onTitle?: (title: string) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
}

export interface CoachStreamRequest {
  content: string;
  sessionId?: string | null;
  parentMessageId?: string | null;
  steamAccountId?: number | null;
}

export interface CoachStreamHandle {
  close: () => void;
}

export interface SessionSummary {
  id: string;
  title: string | null;
  root_message_id: string | null;
  forked_from_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReportPart {
  type: "report";
  report: Report;
}

export type MessageContentPart = TextPart | ReportPart | { type: string };

export interface MessageTreeNode {
  id: string;
  parent_id: string | null;
  role: string;
  content: MessageContentPart[];
  created_at: string;
  children: MessageTreeNode[];
}

export function isTextPart(part: MessageContentPart): part is TextPart {
  return part.type === "text";
}

export function isReportPart(part: MessageContentPart): part is ReportPart {
  return part.type === "report";
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (DEV_TOKEN) headers.Authorization = `Bearer ${DEV_TOKEN}`;
  return headers;
}

// Fetch the patron's sessions, newest-updated first.
export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
  return (await res.json()) as SessionSummary[];
}

// Whether the current patron is allowed to use the AI coach (the `ai_agent_access`
// flag, owned by deadlock-api). Returns false for anyone not signed in or without
// the flag — the UI then falls back to the "coming soon" teaser. Never throws.
export async function fetchAiAgentAccess(): Promise<boolean> {
  try {
    const res = await fetch(`${COACH_API_ORIGIN}/access`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { has_access?: boolean };
    return data.has_access === true;
  } catch {
    return false;
  }
}

export class SessionNotFoundError extends Error {}

// Fetch a session's message tree. Throws SessionNotFoundError on 404 so the UI
// can show a clean empty state instead of crashing.
export async function getSessionTree(sessionId: string): Promise<MessageTreeNode[]> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions/${sessionId}/tree`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (res.status === 404) throw new SessionNotFoundError("Chat not found");
  if (!res.ok) throw new Error(`getSessionTree failed: ${res.status}`);
  return (await res.json()) as MessageTreeNode[];
}

// Friendly names for the tool chips shown while the agent works.
const TOOL_LABELS: Record<string, string> = {
  get_match_metadata: "Reading the box score",
  score_match: "Scoring the match",
  analyze_match: "Running the full analysis",
  analyze_player: "Reviewing recent matches",
  wiki_search: "Searching the wiki",
  wiki_fetch: "Reading the wiki",
  deadlock_api_endpoints: "Checking the data API",
  publish_report: "Building your report",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

// Turn an SSE failure into something the player (or a developer) can act on.
// The most common cause in local dev is "the agent isn't running at this URL".
function describeError(status?: number, data?: string): string {
  if (status === 401 || status === 403) {
    return "You need to be signed in with Patreon to use the coach.";
  }
  if (status === 429) {
    return "You've hit the rate limit. Give it a minute and try again.";
  }
  if (status === 0 || status == null) {
    return `Couldn't reach the coach API at ${COACH_API_ORIGIN}. Is the agent service running? In local dev, start it and set VITE_COACH_API_URL to its URL.`;
  }
  if (status >= 500) {
    return "The coach service errored out. Try again in a moment.";
  }
  const detail = data && data.length < 200 ? ` (${data})` : "";
  return `The coach API at ${COACH_API_ORIGIN} returned an unexpected response${detail}. Check that VITE_COACH_API_URL points at the agent, not another service.`;
}

function parse<T>(data: string, fallback: T): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

// Local dev convenience: a patron JWT so /chat works without Patreon login.
// In production this is unset and auth rides on the shared session cookie.
const DEV_TOKEN = import.meta.env.VITE_COACH_DEV_TOKEN as string | undefined;

export function streamCoachMessage(req: CoachStreamRequest, handlers: CoachStreamHandlers): CoachStreamHandle {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (DEV_TOKEN) headers.Authorization = `Bearer ${DEV_TOKEN}`;
  const source = new SSE(`${COACH_API_ORIGIN}/messages`, {
    headers,
    payload: JSON.stringify({
      content: req.content,
      session_id: req.sessionId ?? null,
      parent_message_id: req.parentMessageId ?? null,
      steam_account_id: req.steamAccountId ?? null,
    }),
    method: "POST",
    withCredentials: true,
  });

  source.addEventListener("message_created", (e: MessageEvent) => {
    handlers.onUserMessage?.(parse<{ id: string }>(e.data, { id: "" }).id);
  });
  source.addEventListener("delta", (e: MessageEvent) => {
    handlers.onDelta?.(parse<{ text: string }>(e.data, { text: "" }).text);
  });
  source.addEventListener("tool_result", (e: MessageEvent) => {
    const d = parse<{ tool_use_id: string; name: string; is_error: boolean }>(e.data, {
      tool_use_id: "",
      name: "",
      is_error: false,
    });
    handlers.onTool?.({ id: d.tool_use_id, name: d.name, isError: d.is_error });
  });
  source.addEventListener("report", (e: MessageEvent) => {
    const d = parse<{ id: string; report: Report }>(e.data, { id: "", report: { summary: "", blocks: [] } });
    handlers.onReport?.(d.report, d.id);
  });
  source.addEventListener("title", (e: MessageEvent) => {
    handlers.onTitle?.(parse<{ title: string }>(e.data, { title: "" }).title);
  });
  source.addEventListener("done", () => {
    handlers.onDone?.();
    source.close();
  });
  source.addEventListener("error", (e: MessageEvent & { responseCode?: number }) => {
    // Two shapes land here: transport failures (with responseCode) and our own
    // server-sent `event: error` carrying JSON {message, status}.
    const server = e?.data ? parse<{ message?: string; status?: number }>(e.data, {}) : {};
    if (server.message) {
      handlers.onError?.(describeError(server.status, server.message));
    } else {
      handlers.onError?.(describeError(e?.responseCode, e?.data));
    }
  });

  source.stream();
  return { close: () => source.close() };
}
