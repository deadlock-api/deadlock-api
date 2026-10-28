import { copyFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import { buildWasmModules, WASM_CRATES } from "../scripts/build-wasm.mjs";

/** A `?module` import of a .wasm file, which answers its compiled `WebAssembly.Module`. */
const MODULE_IMPORT = /\.wasm\?module$/;
/** Marks the import of an emitted .wasm file until the chunk's path to it is known. */
const EMITTED = "wasm-module:";

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

/**
 * `import module from "~/wasm/<crate>.wasm?module"` answers the compiled `WebAssembly.Module`, for server code: the
 * Worker may not compile wasm from bytes at runtime, only modules its bundle imports. The server build copies the file
 * into its assets (written by hand: an SSR build drops emitted assets) and keeps the import of it, which wrangler's bundler turns into such a module (as it
 * does for `@cf-wasm/og`'s). The dev server, which renders in Node, compiles the file on load.
 *
 * @returns {import("vite").Plugin}
 */
export function wasmModuleImports() {
  /** Output file name → source path of the .wasm files the build imports. */
  const files = new Map();
  return {
    name: "wasm-module-imports",
    resolveId(source) {
      if (source.startsWith(EMITTED)) return { id: source, external: true };
    },
    load(id) {
      if (!MODULE_IMPORT.test(id)) return;
      const file = id.replace(/\?module$/, "");
      if (this.environment.mode === "dev") {
        return `import { readFileSync } from "node:fs";\nexport default new WebAssembly.Module(readFileSync(${JSON.stringify(file)}));`;
      }
      const fileName = `assets/${basename(file)}`;
      files.set(fileName, file);
      return `export { default } from ${JSON.stringify(EMITTED + fileName)};`;
    },
    renderChunk(code, chunk) {
      if (!code.includes(EMITTED)) return null;
      return code.replaceAll(new RegExp(`${EMITTED}([^"']+)`, "g"), (_, fileName) => {
        const path = relative(dirname(chunk.fileName), fileName);
        return path.startsWith(".") ? path : `./${path}`;
      });
    },
    writeBundle(options) {
      for (const [fileName, file] of files) {
        const dest = join(options.dir ?? "", fileName);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
      }
    },
  };
}
