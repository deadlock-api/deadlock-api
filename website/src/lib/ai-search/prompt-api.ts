// What the root document needs to know about Chrome's Prompt API, apart from the search itself so every page's bundle
// carries only this.

export const LANGUAGES = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
} satisfies LanguageModelCreateCoreOptions;

/**
 * Run before first paint, from the document head: marks `<html data-prompt-api>` when the browser has the Prompt API
 * and takes the mark off again when this device cannot run the model, so the search is laid out from the first frame
 * where it can work and never reserves room where it cannot.
 */
export const PROMPT_API_FLAG_SCRIPT = `if(self.LanguageModel){var d=document.documentElement.dataset;d.promptApi="";LanguageModel.availability(${JSON.stringify(LANGUAGES)}).then(function(a){if(a==="unavailable")delete d.promptApi},function(){delete d.promptApi})}`;

export function isPromptApiSupported(): boolean {
  return globalThis.LanguageModel !== undefined;
}

export function modelAvailability(): Promise<LanguageModelAvailability> {
  return globalThis.LanguageModel?.availability(LANGUAGES) ?? Promise.resolve("unavailable");
}
