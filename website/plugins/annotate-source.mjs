import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

import * as babel from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

/**
 * Stamps every host JSX element with a short `data-dl` id and emits a manifest
 * mapping those ids back to `file:line:column` plus the enclosing component.
 * React drops `_debugSource` outside development builds, so a minified DOM node
 * has no other route back to its source.
 *
 * Ids are content-derived rather than sequential: the client and server bundles
 * are traversed independently, and a counter would number the same element
 * differently in the prerendered HTML and in the hydrating bundle.
 */

const MANIFEST_FILE_NAME = "annotation-manifest.json";

const INCLUDED_MODULES = /src[\\/].*\.[jt]sx?(\?.*)?$/;

const SKIPPED_ELEMENTS = new Set([
  "html",
  "head",
  "body",
  "title",
  "meta",
  "link",
  "script",
  "style",
  "base",
  "noscript",
]);

function buildId() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

function locationId(file, line, column) {
  return createHash("sha1").update(`${file}:${line}:${column}`).digest("hex").slice(0, 10);
}

function functionName(fn) {
  if (fn.node.id?.name) return fn.node.id.name;
  const parent = fn.parentPath;
  if (!parent) return undefined;
  if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") return parent.node.id.name;
  if (parent.isObjectProperty() && parent.node.key.type === "Identifier") return parent.node.key.name;
  // memo(() => ...) / forwardRef(() => ...) assigned to a variable
  if (parent.isCallExpression()) {
    const grandparent = parent.parentPath;
    if (grandparent?.isVariableDeclarator() && grandparent.node.id.type === "Identifier") {
      return grandparent.node.id.name;
    }
  }
  return undefined;
}

function enclosingComponent(elementPath) {
  let fn = elementPath.getFunctionParent();
  while (fn) {
    const name = functionName(fn);
    if (name && /^[A-Z]/.test(name)) return { fn, name };
    fn = fn.getFunctionParent();
  }
  return undefined;
}

/**
 * The name under which the surrounding scope can reach this function, or
 * undefined when it has none. `functionName` is happy to name an object method
 * or a named function expression after something that is not in scope at the
 * declaration site; assigning to those would throw at module load.
 */
function bindingName(fn) {
  if (fn.isFunctionDeclaration() && fn.node.id?.name) return fn.node.id.name;
  const parent = fn.parentPath;
  if (parent?.isVariableDeclarator() && parent.node.id.type === "Identifier") return parent.node.id.name;
  if (parent?.isCallExpression()) {
    const grandparent = parent.parentPath;
    if (grandparent?.isVariableDeclarator() && grandparent.node.id.type === "Identifier") {
      return grandparent.node.id.name;
    }
  }
  return undefined;
}

/** The enclosing statement to hang a sibling off, unwrapping `export` and `const`. */
function statementSlot(fn) {
  let node = fn;
  while (node.parentPath && !node.parentPath.isBlockStatement() && !node.parentPath.isProgram()) {
    node = node.parentPath;
  }
  return node.parentPath ? node : undefined;
}

/** Creates the Vite plugin: one Babel pass plus the manifest it fills. */
export function annotateSource() {
  /** @type {Map<string, {file: string, line: number, column: number, component?: string}>} */
  const locations = new Map();
  let root = process.cwd();
  const id = buildId();

  /** Function nodes already named, so each is stamped once. */
  const named = new WeakSet();

  /**
   * Pins the component's name to the function object so it survives minification —
   * the picker reads the rendered component chain off React's fiber tree, where
   * `type.name` is a mangled identifier in a production bundle.
   *
   * Deliberately not `displayName`: a chain is at most a handful of entries, and
   * libraries that set `displayName` on their own internals (Radix wraps each
   * primitive in a `*Provider` and a `*Context`) would fill it with names from
   * code the reader cannot open.
   */
  function stampComponentName(t, fn, path) {
    if (named.has(path.node)) return;
    named.add(path.node);
    const name = bindingName(path);
    const slot = name && statementSlot(path);
    if (!slot) return;
    slot.insertAfter(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(t.identifier(name), t.identifier("dlName")),
          t.stringLiteral(fn),
        ),
      ),
    );
  }

  const babelPlugin = ({ types: t }) => ({
    name: "annotate-jsx-source",
    visitor: {
      JSXOpeningElement(elementPath, state) {
        // Runs for component elements too, so a wrapper that renders nothing but
        // another component still gets a name in the chain.
        const enclosing = enclosingComponent(elementPath);
        if (enclosing) stampComponentName(t, enclosing.name, enclosing.fn);

        const name = elementPath.node.name;
        if (name.type !== "JSXIdentifier" || !/^[a-z]/.test(name.name) || SKIPPED_ELEMENTS.has(name.name)) return;

        const loc = elementPath.node.loc;
        if (!loc) return;

        const alreadyStamped = elementPath.node.attributes.some(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "data-dl",
        );
        if (alreadyStamped) return;

        const resolved = state.opts.resolveLocation(loc.start.line, loc.start.column);
        if (!resolved) return;

        const { file, line, column } = resolved;
        const key = locationId(file, line, column);
        const existing = locations.get(key);
        const entry = { file, line, column, component: enclosing?.name };
        if (existing && (existing.file !== file || existing.line !== line || existing.column !== column)) {
          throw new Error(
            `data-dl id collision between ${existing.file}:${existing.line}:${existing.column} and ${file}:${line}:${column}`,
          );
        }
        locations.set(key, entry);

        elementPath.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("data-dl"), t.stringLiteral(key)));
      },
    },
  });

  const manifest = () => {
    const files = [];
    const fileIndex = new Map();
    /** @type {Record<string, [number, number, number, string?]>} */
    const entries = {};
    for (const [key, loc] of locations) {
      let index = fileIndex.get(loc.file);
      if (index === undefined) {
        index = files.push(loc.file) - 1;
        fileIndex.set(loc.file, index);
      }
      entries[key] = loc.component ? [index, loc.line, loc.column, loc.component] : [index, loc.line, loc.column];
    }
    return JSON.stringify({ buildId: id, files, locations: entries });
  };

  /**
   * Maps a position in the module Babel is looking at back to the position in
   * the file a human would open. TanStack regenerates route files — the
   * component moves into a `?tsr-split=component` module and the reference
   * module loses it again — so a route element's line number in the code we see
   * has nothing to do with its line number on disk. Every such rewrite ships a
   * source map, which is the only thing that survives the move.
   */
  function locationResolver(context, id) {
    const generatedFile = id.split("?")[0];
    /** @type {TraceMap | null | undefined} undefined until first lookup, null when unmapped. */
    let trace;

    return (line, column) => {
      if (trace === undefined) {
        let map;
        try {
          map = context.getCombinedSourcemap();
        } catch {
          map = undefined;
        }
        trace = map?.mappings ? new TraceMap(map) : null;
      }

      let file = generatedFile;
      if (trace) {
        const original = originalPositionFor(trace, { line, column });
        if (original.source && original.line !== null) {
          // TanStack names the split module's source after its own module id,
          // query and all: `src/routes/index.tsx?tsr-split=component`.
          file = path.resolve(path.dirname(generatedFile), original.source.split("?")[0]);
          line = original.line;
          column = original.column;
        }
      }

      const relative = path.relative(root, file).split(path.sep).join("/");
      return relative.startsWith("src/") ? { file: relative, line, column } : null;
    };
  }

  const vitePlugin = {
    name: "annotation-manifest",
    // Must observe route modules after TanStack's code splitter (also `pre`)
    // has rewritten them, so the source map above is there to be read.
    enforce: "pre",
    async transform(code, id) {
      if (process.env.VITE_ANNOTATE === "0") return null;
      if (id.includes("node_modules") || !INCLUDED_MODULES.test(id)) return null;

      const result = await babel.transformAsync(code, {
        filename: id.split("?")[0],
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: [[presetTypescript, { isTSX: true, allExtensions: true }]],
        plugins: [[babelPlugin, { resolveLocation: locationResolver(this, id) }]],
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
    config() {
      return { define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(id) } };
    },
    configResolved(config) {
      root = config.root;
    },
    // Dev has no bundle step, so serve the registry as it fills during transforms.
    configureServer(server) {
      server.middlewares.use(`/${MANIFEST_FILE_NAME}`, (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(manifest());
      });
    },
    generateBundle() {
      if (this.environment?.name !== "client") return;
      this.emitFile({ type: "asset", fileName: MANIFEST_FILE_NAME, source: manifest() });
    },
  };

  return { vitePlugin };
}
