import { initialPrompts } from "./prompt";
import { LANGUAGES, modelAvailability } from "./prompt-api";

// Chrome's built-in model (the Prompt API), wrapped for the search. Nothing here runs on the server: every entry point
// is reached from an effect or an event handler.

const noop = () => {};

let routerSession: Promise<LanguageModel> | undefined;
/** Who hears the download progress: the latest question's asker, which may have mounted after the download began. */
let onDownloadProgress: ((loaded: number) => void) | undefined;

/**
 * The one session that holds the routing instructions, created on the first question: creating it downloads the
 * model when the browser has not yet, which needs the user activation of that submit.
 */
function getRouterSession(): Promise<LanguageModel> {
  const api = globalThis.LanguageModel;
  if (!api) return Promise.reject(new Error("The Prompt API is not available"));
  routerSession ??= api.create({
    ...LANGUAGES,
    initialPrompts: initialPrompts(),
    monitor: (monitor) =>
      monitor.addEventListener("downloadprogress", (event) =>
        onDownloadProgress?.((event as LanguageModelDownloadProgressEvent).loaded),
      ),
  });
  // A failed create (a cancelled download, a full disk) is tried again on the next question.
  routerSession.catch(() => (routerSession = undefined));
  return routerSession;
}

/**
 * The model's routing answer to one question, as the raw JSON text `schema` constrains it to. `onProgress` hears the
 * model download (0 to 1) when the question has to wait for one, and `onText` the answer so far as it streams in. Each
 * question runs on a clone of the router session, so earlier questions never steer a later one.
 */
export async function askModel(
  question: string,
  schema: object,
  {
    signal,
    onProgress,
    onText,
  }: { signal: AbortSignal; onProgress: (loaded: number) => void; onText: (answerSoFar: string) => void },
): Promise<string> {
  onDownloadProgress = onProgress;
  const base = await getRouterSession();
  const session = await base.clone({ signal });
  try {
    // The schema (every hero and item name) stays out of the prompt, which keeps each question short and quick; the
    // few-shot answers in the session show the model the shape, and the constraint still holds it to the names.
    const stream = session.promptStreaming(question, {
      responseConstraint: schema,
      omitResponseConstraintInput: true,
      signal,
    });
    return await readAll(stream, onText);
  } finally {
    session.destroy();
  }
}

async function readAll(stream: ReadableStream<string>, onText: (answerSoFar: string) => void): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after the other
    const { done, value } = await reader.read();
    if (done) return text;
    text += value;
    onText(text);
  }
}

/**
 * Readies the router session ahead of the first question (on focus), when the model is already on the device: the
 * first answer then skips reading the instructions. Never starts a download, which needs a submit.
 */
export function warmUpModel(): void {
  if (routerSession) return;
  void modelAvailability().then((availability) =>
    availability === "available" ? getRouterSession().then(noop, noop) : undefined,
  );
}
