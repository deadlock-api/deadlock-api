/** A wasm file compiled for server code (`plugins/wasm-modules.mjs`, `wasmModuleImports`). */
declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}
