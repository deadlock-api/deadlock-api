// Resolves a DOM node back to the React source that rendered it, via the
// `data-dl` ids stamped in by plugins/annotate-source.mjs and the manifest
// emitted alongside the bundle.

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  component?: string;
  /** Enclosing component names from the DOM ancestry, outermost first. */
  chain: string[];
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

export function resolveSource(element: HTMLElement): SourceLocation | null {
  const id = element.dataset.dl;
  if (!manifest || !id) return null;

  const location = lookup(manifest, id);
  if (!location) return null;

  const chain: string[] = [];
  let ancestor: HTMLElement | null = element.parentElement?.closest<HTMLElement>("[data-dl]") ?? null;
  while (ancestor && chain.length < MAX_CHAIN_LENGTH) {
    const component = ancestor.dataset.dl ? lookup(manifest, ancestor.dataset.dl)?.component : undefined;
    if (component && component !== chain[0] && component !== location.component) chain.unshift(component);
    ancestor = ancestor.parentElement?.closest<HTMLElement>("[data-dl]") ?? null;
  }

  return { ...location, chain };
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
