import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

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
    if (name && /^[A-Z]/.test(name)) return name;
    fn = fn.getFunctionParent();
  }
  return undefined;
}

/** Creates the Babel plugin and the Vite plugin that share one registry. */
export function annotateSource() {
  /** @type {Map<string, {file: string, line: number, column: number, component?: string}>} */
  const locations = new Map();
  let root = process.cwd();
  const id = buildId();

  const babelPlugin = ({ types: t }) => ({
    name: "annotate-jsx-source",
    visitor: {
      JSXOpeningElement(elementPath, state) {
        const name = elementPath.node.name;
        if (name.type !== "JSXIdentifier" || !/^[a-z]/.test(name.name) || SKIPPED_ELEMENTS.has(name.name)) return;

        const filename = state.filename;
        if (!filename) return;
        // Route components arrive as `index.tsx?tsr-split=component`.
        const file = path.relative(root, filename.split("?")[0]).split(path.sep).join("/");
        if (!file.startsWith("src/")) return;

        const loc = elementPath.node.loc;
        if (!loc) return;

        const alreadyStamped = elementPath.node.attributes.some(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "data-dl",
        );
        if (alreadyStamped) return;

        const { line, column } = loc.start;
        const key = locationId(file, line, column);
        const existing = locations.get(key);
        const entry = { file, line, column, component: enclosingComponent(elementPath) };
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

  const vitePlugin = {
    name: "annotation-manifest",
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

  return { babelPlugin, vitePlugin };
}
