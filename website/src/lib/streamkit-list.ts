/**
 * The box widget keeps its variables, labels and second lines as parallel comma lists in the URL. A comma inside an
 * entry is written `\,` (and a backslash `\\`), so "Place, EU" stays one label instead of shifting every later label
 * onto the wrong stat. URLs from before the escaping read the same, since they contain neither.
 */
export function joinWidgetList(entries: readonly string[]): string {
  return entries.map((entry) => entry.replaceAll("\\", "\\\\").replaceAll(",", "\\,")).join(",");
}

export function splitWidgetList(value: string): string[] {
  const entries = [""];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) {
      i += 1;
      entries[entries.length - 1] += value[i];
    } else if (char === ",") entries.push("");
    else entries[entries.length - 1] += char;
  }
  return entries;
}

/**
 * The widget's columns without the ones that have no variable (an "Add Variable" left unpicked), each keeping its own
 * label and second line.
 */
export function withoutEmptyVariables(columns: {
  variables: readonly string[];
  labels?: readonly string[];
  subtexts?: readonly string[];
}): { variables: string[]; labels?: string[]; subtexts?: string[] } {
  const keep = columns.variables.map((variable) => variable !== "");
  const pick = (list: readonly string[] | undefined) => list?.filter((_, i) => keep[i] ?? true);
  return {
    variables: columns.variables.filter((_, i) => keep[i]),
    labels: pick(columns.labels),
    subtexts: pick(columns.subtexts),
  };
}
