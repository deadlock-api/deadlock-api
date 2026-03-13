import { createFilter } from "./createFilter";

export const SortByFilter = createFilter<{
  children: React.ReactNode;
  label: string | null | undefined;
}>({
  useDescription(props) {
    return { sortBy: props.label ?? null };
  },
  Render({ children }) {
    return <>{children}</>;
  },
});
