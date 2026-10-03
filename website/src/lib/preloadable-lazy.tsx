import { type ComponentType, lazy } from "react";

/**
 * `React.lazy` that a loader can load ahead of render. Once `preload()` has resolved, the component renders the loaded
 * module directly instead of suspending, so a server that awaited it renders the content, not the Suspense fallback.
 * Before that it is a plain lazy component.
 */
export function preloadableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | undefined;
  const Lazy = lazy(load);
  function Preloadable(props: P) {
    const Component = loaded ?? Lazy;
    return <Component {...props} />;
  }
  const preload = () =>
    load().then((module) => {
      loaded = module.default;
    });
  return Object.assign(Preloadable, { preload });
}
