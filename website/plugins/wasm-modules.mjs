import { buildWasmModules, WASM_CRATES } from "../scripts/build-wasm.mjs";

/**
 * Builds the wasm modules (crates under wasm/, see scripts/build-wasm.mjs) into src/wasm/ before Vite reads them, once
 * per process: `vite build` runs its client and server builds in one. The dev server rebuilds when a crate changes
 * and reloads the page.
 *
 * @returns {import("vite").Plugin}
 */
export function wasmModules() {
  let built = false;
  return {
    name: "wasm-modules",
    buildStart() {
      if (built) return;
      buildWasmModules();
      built = true;
    },
    configureServer(server) {
      server.watcher.add(WASM_CRATES);
      server.watcher.on("change", (file) => {
        if (!file.startsWith(WASM_CRATES) || !/\.(rs|toml)$/.test(file)) return;
        try {
          buildWasmModules();
          server.ws.send({ type: "full-reload" });
        } catch (error) {
          server.config.logger.error(
            `wasm modules did not build: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    },
  };
}
