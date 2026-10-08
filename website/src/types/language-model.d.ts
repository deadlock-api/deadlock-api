// Type declarations for the parts of Chrome's Prompt API the site uses
// https://webmachinelearning.github.io/prompt-api/

type LanguageModelAvailability = "unavailable" | "downloadable" | "downloading" | "available";

interface LanguageModelExpected {
  type: "text";
  languages?: string[];
}

interface LanguageModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LanguageModelCreateCoreOptions {
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
}

interface LanguageModelCreateOptions extends LanguageModelCreateCoreOptions {
  initialPrompts?: LanguageModelMessage[];
  signal?: AbortSignal;
  monitor?: (monitor: EventTarget) => void;
}

interface LanguageModelPromptOptions {
  responseConstraint?: object;
  omitResponseConstraintInput?: boolean;
  signal?: AbortSignal;
}

interface LanguageModel extends EventTarget {
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  /** The answer in pieces as it is generated: each chunk is the text added since the last one. */
  promptStreaming(input: string, options?: LanguageModelPromptOptions): ReadableStream<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModel>;
  destroy(): void;
}

declare var LanguageModel:
  | {
      availability(options?: LanguageModelCreateCoreOptions): Promise<LanguageModelAvailability>;
      create(options?: LanguageModelCreateOptions): Promise<LanguageModel>;
    }
  | undefined;

/** The `downloadprogress` event of a `create()` monitor: `loaded` runs from 0 to 1. */
interface LanguageModelDownloadProgressEvent extends Event {
  loaded: number;
}
