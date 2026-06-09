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
  onAssistantMessage?: (id: string) => void;
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
  patron_id: string;
  title: string | null;
  root_message_id: string | null;
  forked_from_message_id: string | null;
  is_public: boolean;
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

// Share a session to make it public.
export async function shareSession(sessionId: string): Promise<SessionSummary> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions/${sessionId}/share`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`shareSession failed: ${res.status}`);
  return (await res.json()) as SessionSummary;
}

// Record thumbs up/down feedback on an assistant message (1 = up, 0 = down).
export async function submitMessageFeedback(
  messageId: string,
  value: 0 | 1,
  comment: string | null = null,
): Promise<void> {
  const res = await fetch(`${COACH_API_ORIGIN}/messages/${messageId}/feedback`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value, comment }),
  });
  if (!res.ok) throw new Error(`submitMessageFeedback failed: ${res.status}`);
}

// Fork a session into the current patron's history, branching at `messageId`.
// Works on any chat the viewer can see (their own or a public shared one); no
// messages are copied — the fork records the branch point and inherits the
// prior turns as read-only context.
export async function forkSession(sessionId: string, messageId: string): Promise<SessionSummary> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions/${sessionId}/fork`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message_id: messageId }),
  });
  if (!res.ok) throw new Error(`forkSession failed: ${res.status}`);
  return (await res.json()) as SessionSummary;
}

// Make a session private again.
export async function makeSessionPrivate(sessionId: string): Promise<SessionSummary> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions/${sessionId}/private`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`makeSessionPrivate failed: ${res.status}`);
  return (await res.json()) as SessionSummary;
}

export interface CoachAccess {
  // Whether the current patron may use the AI coach (the `ai_agent_access` flag,
  // owned by deadlock-api). False for anyone not signed in or without the flag.
  hasAccess: boolean;
  // Admins may list and open every patron's conversations, not just their own.
  isAdmin: boolean;
  // The viewer's own patron id (null when not signed in). Used to tell whether a
  // loaded session is theirs, so an admin viewing someone else's chat is read-only.
  patronId: string | null;
}

// Resolve the current patron's coach access. Never throws — a network or auth
// failure yields no access, so the UI falls back to the "coming soon" teaser.
export async function fetchCoachAccess(): Promise<CoachAccess> {
  try {
    const res = await fetch(`${COACH_API_ORIGIN}/access`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { hasAccess: false, isAdmin: false, patronId: null };
    const data = (await res.json()) as { has_access?: boolean; is_admin?: boolean; patron_id?: string | null };
    return {
      hasAccess: data.has_access === true,
      isAdmin: data.is_admin === true,
      patronId: data.patron_id ?? null,
    };
  } catch {
    return { hasAccess: false, isAdmin: false, patronId: null };
  }
}

export interface CoachQuota {
  used: number;
  limit: number;
  remaining: number;
  // The shared daily capacity is exhausted (independent of this patron's allowance).
  throttled: boolean;
}

// The patron's monthly message allowance. Never throws — on failure the UI
// simply hides the counter.
export async function fetchCoachQuota(): Promise<CoachQuota | null> {
  try {
    const res = await fetch(`${COACH_API_ORIGIN}/quota`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<CoachQuota>;
    return {
      used: d.used ?? 0,
      limit: d.limit ?? 0,
      remaining: d.remaining ?? 0,
      throttled: d.throttled === true,
    };
  } catch {
    return null;
  }
}

export class SessionNotFoundError extends Error {}

// Fetch a single session's metadata.
export async function getSession(sessionId: string): Promise<SessionSummary> {
  const res = await fetch(`${COACH_API_ORIGIN}/sessions/${sessionId}`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (res.status === 404) throw new SessionNotFoundError("Chat not found");
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  return (await res.json()) as SessionSummary;
}

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
  get_match_map: "Mapping the match",
  score_match: "Scoring the match",
  analyze_match: "Running the full analysis",
  analyze_player: "Reviewing recent matches",
  recall_findings: "Recalling the earlier analysis",
  get_items: "Looking up items",
  wiki_search: "Searching the wiki",
  wiki_fetch: "Reading the wiki",
  deadlock_api_endpoints: "Checking the data API",
  fetch_url: "Pulling live data",
  coach_docs: "Consulting the playbook",
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
  source.addEventListener("message_completed", (e: MessageEvent) => {
    handlers.onAssistantMessage?.(parse<{ id: string }>(e.data, { id: "" }).id);
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
      // The agent's own error events already carry player-friendly text.
      handlers.onError?.(server.message);
    } else {
      handlers.onError?.(describeError(e?.responseCode, e?.data));
    }
  });

  source.stream();
  return { close: () => source.close() };
}
