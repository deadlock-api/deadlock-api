// Builds the website's wasm modules: every crate under wasm/ whose crate-type has "cdylib" (a member of the root
// cargo workspace) becomes src/wasm/<crate>.wasm, which is not tracked. `vite dev` and `vite build` run this through
// plugins/wasm-modules.mjs; run it by hand for the unit tests. Needs cargo and protoc (for valveprotos); the wasm
// target is added on first use.
//
//   node scripts/build-wasm.mjs [crate...]

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const website = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WASM_CRATES = join(website, "wasm");
export const WASM_OUT = join(website, "src", "wasm");
const TARGET = "wasm32-unknown-unknown";
const PROFILE = "wasm";

/** The crate names of the wasm modules. */
export function wasmModules() {
  return readdirSync(WASM_CRATES).flatMap((dir) => {
    const manifest = readFileSync(join(WASM_CRATES, dir, "Cargo.toml"), "utf8");
    if (!/crate-type\s*=\s*\[[^\]]*"cdylib"/.test(manifest)) return [];
    const name = manifest.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    return name ? [name] : [];
  });
}

function ensureTarget() {
  let installed;
  try {
    installed = execFileSync("rustup", ["target", "list", "--installed"], { cwd: website, encoding: "utf8" });
  } catch {
    // No rustup: a toolchain installed some other way has to bring the target itself.
    return;
  }
  if (!installed.split("\n").includes(TARGET)) {
    execFileSync("rustup", ["target", "add", TARGET], { cwd: website, stdio: "inherit" });
  }
}

/** Builds `names` (every module by default) into src/wasm/; answers the files written. */
export function buildWasmModules(names = []) {
  const modules = wasmModules();
  const unknown = names.filter((name) => !modules.includes(name));
  if (unknown.length > 0) throw new Error(`No wasm module ${unknown.join(", ")} (modules: ${modules.join(", ")})`);
  const building = names.length > 0 ? names : modules;

  ensureTarget();
  const { target_directory: targetDir, workspace_root: root } = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], { cwd: website, encoding: "utf8" }),
  );
  execFileSync(
    "cargo",
    ["build", "--locked", "--profile", PROFILE, "--target", TARGET, ...building.flatMap((name) => ["-p", name])],
    { cwd: root, stdio: "inherit" },
  );
  mkdirSync(WASM_OUT, { recursive: true });
  return building.map((name) => {
    const dest = join(WASM_OUT, `${name}.wasm`);
    copyFileSync(join(targetDir, TARGET, PROFILE, `${name.replaceAll("-", "_")}.wasm`), dest);
    return dest;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of buildWasmModules(process.argv.slice(2))) {
    console.log(`${file.slice(website.length + 1)}: ${(statSync(file).size / 1024).toFixed(1)} KiB`);
  }
}
