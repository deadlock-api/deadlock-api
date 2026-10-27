/**
 * The website's wasm modules: Rust crates under `wasm/`, built into `src/wasm/<crate>.wasm` (not tracked) by
 * `scripts/build-wasm.mjs`. They all speak the ABI of `wasm/abi`: an exported function takes one string and answers
 * one, or fails with an error message.
 */

interface AbiExports {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  output_ptr: () => number;
  output_len: () => number;
}

type AbiFunction = (ptr: number, len: number) => number;

/** A module function answered with its error message. */
export class WasmCallError extends Error {
  override name = "WasmCallError";
}

export interface WasmModule<Fn extends string> {
  /** Calls `fn` with `input`; throws a `WasmCallError` with the module's message when it fails. */
  call: (fn: Fn, input: string) => string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function instantiate(source: BufferSource | Response | PromiseLike<Response>): Promise<WebAssembly.Instance> {
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
    return (await WebAssembly.instantiate(source, {})).instance;
  }
  const response = await source;
  if (!response.ok) throw new Error(`wasm module did not load (HTTP ${response.status})`);
  // Streaming compiles while the bytes arrive, but needs the `application/wasm` type; anything else falls back.
  if (response.headers.get("content-type")?.startsWith("application/wasm")) {
    return (await WebAssembly.instantiateStreaming(response, {})).instance;
  }
  return (await WebAssembly.instantiate(await response.arrayBuffer(), {})).instance;
}

/**
 * Instantiates a module from its bytes or its `fetch` and checks that it exports `functions`. In the browser, pass
 * `fetch(url)` with the url of a `~/wasm/<crate>.wasm?url` import.
 */
export async function loadWasmModule<Fn extends string>(
  source: BufferSource | Response | PromiseLike<Response>,
  functions: readonly Fn[],
): Promise<WasmModule<Fn>> {
  const exports = (await instantiate(source)).exports as unknown as AbiExports & Record<Fn, AbiFunction>;
  const missing = functions.filter((fn) => typeof exports[fn] !== "function");
  if (missing.length > 0) throw new Error(`wasm module does not export ${missing.join(", ")}`);
  return {
    call(fn, input) {
      const bytes = encoder.encode(input);
      const ptr = exports.alloc(bytes.length);
      // The memory may have grown (and its buffer been replaced) by any call: views are made right before use.
      new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
      const ok = exports[fn](ptr, bytes.length) === 1;
      const output = decoder.decode(new Uint8Array(exports.memory.buffer, exports.output_ptr(), exports.output_len()));
      if (!ok) throw new WasmCallError(output);
      return output;
    },
  };
}
