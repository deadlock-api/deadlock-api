import { queryOptions } from "@tanstack/react-query";

import { crosshairCodec } from "~/lib/wasm/crosshair";
import { loadWasmModule } from "~/lib/wasm/module";
import { queryKeys } from "~/queries/query-keys";
import crosshairWasmUrl from "~/wasm/crosshair-wasm.wasm?url";

/**
 * The crosshair reader, writer and renderer, a wasm module of ~120 KB over the wire. The crosshair editor draws with it
 * from the start, so it is asked for on that page's first render in the browser. Loaded once per page; a failed load is
 * retried.
 */
export const crosshairCodecQueryOptions = queryOptions({
  queryKey: queryKeys.assets.crosshairCodec(),
  queryFn: async () => crosshairCodec(await loadWasmModule(fetch(crosshairWasmUrl), ["decode", "encode", "render"])),
  staleTime: Infinity,
  gcTime: Infinity,
});
