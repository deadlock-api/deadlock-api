import { MATCH_MODE_LABELS, type MatchMode, MatchModeSelector } from "~/components/selectors/MatchModeSelector";

import { createFilter } from "./createFilter";

export const MatchModeFilter = createFilter<{
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
}>({
  useDescription(props) {
    return { matchMode: MATCH_MODE_LABELS[props.value] };
  },
  Render({ value, onChange }) {
    return <MatchModeSelector value={value} onChange={onChange} />;
  },
});
