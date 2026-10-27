import { type HeroBuildCodec, heroBuildCodec } from "~/lib/wasm/hero-build";
import { loadWasmModule } from "~/lib/wasm/module";
import heroBuildWasmUrl from "~/wasm/hero-build.wasm?url";

let loading: Promise<HeroBuildCodec> | undefined;

/** The codec, loaded on first use in the browser (the module is ~90 KB over the wire). */
export function loadHeroBuildCodec(): Promise<HeroBuildCodec> {
  loading ??= loadWasmModule(fetch(heroBuildWasmUrl), ["decode", "encode"]).then(heroBuildCodec, (error: unknown) => {
    // A failed load (offline) is tried again next time.
    loading = undefined;
    throw error;
  });
  return loading;
}
