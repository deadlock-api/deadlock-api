import type { Variable } from "~/types/streamkit/command";

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** The variable names a command template uses, in order and without repeats: `{wins_today}` → `wins_today`. */
export function commandTemplateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map(([, name]) => name))];
}

/** The extra arguments the template's variables take (`hero_name` for `{hero_kd}`), in order and without repeats. */
export function commandTemplateArgs(template: string, variables: readonly Variable[]): string[] {
  const names = commandTemplateVariables(template);
  return [...new Set(names.flatMap((name) => variables.find((variable) => variable.name === name)?.extra_args ?? []))];
}

export interface CommandTemplateCheck {
  /** Nothing but whitespace: the bot would answer with an empty message. */
  empty: boolean;
  /** Names in braces the API does not know; it would send them back literally. Empty until the list has loaded. */
  unknown: string[];
  /** Each required argument left blank, with the variables that need it. */
  missing: { arg: string; variables: string[] }[];
}

/** What stops a template from making a working command. `variables` is undefined while the list is loading. */
export function checkCommandTemplate(
  template: string,
  variables: readonly Variable[] | undefined,
  args: Readonly<Record<string, string>>,
): CommandTemplateCheck {
  const names = commandTemplateVariables(template);
  const known = variables ?? [];
  const missing = commandTemplateArgs(template, known)
    .filter((arg) => !args[arg]?.trim())
    .map((arg) => ({
      arg,
      variables: names.filter((name) => known.find((variable) => variable.name === name)?.extra_args?.includes(arg)),
    }));
  return {
    empty: template.trim() === "",
    unknown: variables ? names.filter((name) => !variables.some((variable) => variable.name === name)) : [],
    missing,
  };
}

export function isCommandTemplateValid(check: CommandTemplateCheck): boolean {
  return !check.empty && check.unknown.length === 0 && check.missing.length === 0;
}

/**
 * Put `{name}` in place of the selection `[start, end)` of `template`. Returns the new template and the caret right
 * after the inserted token.
 */
export function insertCommandVariable(
  template: string,
  name: string,
  start: number,
  end: number = start,
): { template: string; caret: number } {
  const from = Math.max(0, Math.min(start, template.length));
  const to = Math.max(from, Math.min(end, template.length));
  const token = `{${name}}`;
  return { template: template.slice(0, from) + token + template.slice(to), caret: from + token.length };
}
