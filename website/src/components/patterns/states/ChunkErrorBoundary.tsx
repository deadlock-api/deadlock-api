import { Component, type ReactNode } from "react";

import { ErrorState } from "~/components/patterns/states/ErrorState";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title="Failed to load this section"
          description="A newer version of the site may have been deployed. Reloading fetches it."
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
