/**
 * What a text control holds. `text` is prose. `template` is a string with `{placeholders}` or other syntax: no spell
 * check, autofill, autocapitalisation or autocorrect, which would underline or rewrite the tokens.
 */
export type ControlSyntax = "text" | "template";

export function syntaxProps(syntax: ControlSyntax) {
  return syntax === "template"
    ? ({ spellCheck: false, autoComplete: "off", autoCapitalize: "off", autoCorrect: "off" } as const)
    : {};
}
