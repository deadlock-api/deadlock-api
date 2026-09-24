/**
 * A multi-select filter whose default is "everything". That default is shown with nothing pressed, so pressing a
 * choice visibly picks it: with every button lit, a press looked like it switched the other three off (a "solo"),
 * and people pressed again and again to work out what had happened.
 *
 * `anyPressed` is what the buttons show for a value; `anyValue` turns the pressed buttons back into a value, where
 * none pressed and all pressed both mean every choice.
 */
export function anyPressed<T>(all: readonly T[], value: readonly T[]): T[] {
  return all.every((choice) => value.includes(choice)) ? [] : all.filter((choice) => value.includes(choice));
}

export function anyValue<T>(all: readonly T[], pressed: readonly T[]): T[] {
  const kept = all.filter((choice) => pressed.includes(choice));
  return kept.length === 0 ? [...all] : kept;
}
