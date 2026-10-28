import { queryOptions } from "@tanstack/react-query";

import { heroBuildCodec } from "~/lib/wasm/hero-build";
import { loadWasmModule } from "~/lib/wasm/module";
import { queryKeys } from "~/queries/query-keys";
import heroBuildWasmUrl from "~/wasm/hero-build.wasm?url";

/**
 * The build code reader and writer, a wasm module of ~90 KB over the wire. Asked for in the browser at the press that
 * needs it (`queryClient.query`), not on render: few visitors copy or paste a build. Loaded once per page; a failed
 * load is retried and asked for again on the next press.
 */
export const heroBuildCodecQueryOptions = queryOptions({
  queryKey: queryKeys.assets.heroBuildCodec(),
  queryFn: async () => heroBuildCodec(await loadWasmModule(fetch(heroBuildWasmUrl), ["decode", "encode"])),
  staleTime: Infinity,
  gcTime: Infinity,
});
