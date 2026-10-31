import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { buildLanguageName } from "~/lib/build-stats";

const NO_LANGUAGES: readonly number[] = [];

/** The language a build is written in; null for any. */
export function BuildLanguageFilter({
  languages = NO_LANGUAGES,
  value,
  defaultValue = null,
  onValueChange,
  label = "Language",
  ...props
}: Omit<React.ComponentProps<typeof StringSelector>, "value" | "defaultValue" | "onValueChange" | "children"> & {
  /** The languages to offer, most used first. A chosen one stays listed when no build is in it. */
  languages?: readonly number[];
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (language: number | null) => void;
}) {
  const offered = value == null || languages.includes(value) ? languages : [value, ...languages];
  return (
    <StringSelector
      label={label}
      value={value === undefined ? undefined : value === null ? "" : String(value)}
      defaultValue={defaultValue === null ? "" : String(defaultValue)}
      onValueChange={(next) => onValueChange?.(next === "" ? null : Number(next))}
      width="compact"
      {...props}
    >
      <StringOption value="">Any</StringOption>
      {offered.map((language) => (
        <StringOption key={language} value={String(language)}>
          {buildLanguageName(language)}
        </StringOption>
      ))}
    </StringSelector>
  );
}
