import { useRegisterFilterParts } from "./FilterDescription";

export function createFilter<P extends object>(config: {
  useDescription: (props: P) => Record<string, string | null>;
  Render: React.FC<P>;
}): React.FC<P> {
  return (props) => {
    const parts = config.useDescription(props);
    useRegisterFilterParts(parts);
    return <config.Render {...props} />;
  };
}
