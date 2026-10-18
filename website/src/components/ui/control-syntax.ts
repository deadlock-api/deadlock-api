/**
 * What a text control holds. `text` is prose. `template` is a string with `{placeholders}` or other syntax, and
 * `identifier` an ID, a code or a link (a Steam ID or profile URL): neither gets spell check, autofill,
 * autocapitalisation or autocorrect, which would underline or rewrite it.
 */
export type ControlSyntax = "text" | "template" | "identifier";

export function syntaxProps(syntax: ControlSyntax) {
  return syntax !== "text"
    ? ({ spellCheck: false, autoComplete: "off", autoCapitalize: "off", autoCorrect: "off" } as const)
    : {};
}
