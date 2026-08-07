// Resolves a DOM node back to the React source that rendered it, via the
// `data-dl` ids stamped in by plugins/annotate-source.mjs and the manifest
// emitted alongside the bundle.

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  component?: string;
  /** Components that rendered this element, outermost first. */
  chain: string[];
}

interface Fiber {
  return: Fiber | null;
  type: unknown;
}

interface Manifest {
  buildId: string;
  files: string[];
  locations: Record<string, [number, number, number, string?]>;
}

const MAX_CHAIN_LENGTH = 5;
const MAX_SELECTOR_DEPTH = 4;

export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? "unknown";

let manifestPromise: Promise<Manifest | null> | undefined;
let manifest: Manifest | null = null;

export function prefetchManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch("/annotation-manifest.json")
    .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
    .catch(() => null)
    .then((loaded) => {
      manifest = loaded;
      return loaded;
    });
  return manifestPromise;
}

function lookup(manifest: Manifest, id: string): Omit<SourceLocation, "chain"> | null {
  const entry = manifest.locations[id];
  if (!entry) return null;
  const [fileIndex, line, column, component] = entry;
  const file = manifest.files[fileIndex];
  if (!file) return null;
  return { file, line, column, component };
}

export function annotatedAncestor(node: Element | null): HTMLElement | null {
  return node?.closest<HTMLElement>("[data-dl]") ?? null;
}

function componentName(type: unknown): string | undefined {
  // Both a plain function component and a memo/forwardRef object carry it.
  if (typeof type !== "function" && typeof type !== "object") return undefined;
  const name = (type as { dlName?: unknown } | null)?.dlName;
  return typeof name === "string" ? name : undefined;
}

/**
 * Walks React's fiber tree for the components that actually rendered this
 * element. The DOM cannot answer this: a component that delegates its host
 * element to a library — `SmartLink` rendering the router's `<Link>` — leaves no
 * mark of its own in the tree, so ancestry read off the DOM skips straight past
 * it. Names come from the `dlName` property stamped in by
 * plugins/annotate-source.mjs, so the chain only ever holds components whose
 * source the reader can open.
 */
function componentChain(element: HTMLElement): string[] {
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? ((element as unknown as Record<string, Fiber | undefined>)[key] ?? null) : null;

  const chain: string[] = [];
  while (fiber && chain.length < MAX_CHAIN_LENGTH) {
    const name = componentName(fiber.type);
    if (name && name !== chain[0]) chain.unshift(name);
    fiber = fiber.return;
  }
  return chain;
}

export function resolveSource(element: HTMLElement): SourceLocation | null {
  const id = element.dataset.dl;
  if (!manifest || !id) return null;

  const location = lookup(manifest, id);
  if (!location) return null;

  return { ...location, chain: componentChain(element) };
}

export function buildSelector(element: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && parts.length < MAX_SELECTOR_DEPTH && node !== document.body) {
    const tag = node.tagName.toLowerCase();
    const parent: HTMLElement | null = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === node?.tagName);
      const index = siblings.indexOf(node);
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index + 1})` : tag);
    } else {
      parts.unshift(tag);
    }
    node = parent;
  }
  return parts.join(" > ");
}

export function formatSource(source: SourceLocation): string {
  return `${source.file}:${source.line}:${source.column}`;
}
