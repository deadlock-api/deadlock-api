import { useEffect, useState } from "react";

import type { HeroBuildCodec } from "~/lib/wasm/hero-build";
import { loadHeroBuildCodec } from "~/lib/wasm/load-hero-build";

/**
 * The build code reader and writer (a wasm module), loaded once a component that needs it is on the page; null until
 * then. A failed load is tried again on use.
 */
export function useHeroBuildCodec(): HeroBuildCodec | null {
  const [codec, setCodec] = useState<HeroBuildCodec | null>(null);
  useEffect(() => {
    let live = true;
    loadHeroBuildCodec().then(
      (loaded) => {
        if (live) setCodec(loaded);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return codec;
}
