/** One block of a patch's notes, as plain text: nothing here is markup, so a page can render it without escaping. */
export type NoteBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export interface PatchNotes {
  /** The announcement's opening lines, for the page header. Undefined for a changelog that is only a list. */
  blurb?: string;
  blocks: NoteBlock[];
}

const BLURB_MIN = 40;
const BLURB_MAX = 320;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x11_00_00 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The text of a line without its tags, entities decoded and the editor's `\[` escapes undone. */
function plain(html: string): string {
  return decode(html.replaceAll(/<[^>]*>/g, ""))
    .replaceAll(/\\([[\]])/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** A line that is one bold run, such as `[ General ]`: a heading. */
function isHeading(html: string): boolean {
  return /^\s*(?:<p[^>]*>)?\s*<b>[\S\s]*<\/b>\s*$/i.test(html) && !/<\/b>[\S\s]*<b>/i.test(html);
}

/** `html` is a Steam announcement: paragraphs and line breaks with bold, italic, links and images. */
export function parsePatchNotes(html: string): PatchNotes {
  // A paragraph is a line of its own, and so is whatever a `<br>` ends.
  const lines = html
    .replaceAll(/<\/p>/gi, "\n")
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .split("\n");

  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  let afterText = false;
  for (const line of lines) {
    const text = plain(line);
    const continues = afterText;
    afterText = text !== "";
    if (text === "") {
      flush();
    } else if (text.startsWith("- ")) {
      flush();
      const last = blocks.at(-1);
      const item = text.slice(2).trim();
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (isHeading(line)) {
      flush();
      blocks.push({ kind: "heading", text });
    } else {
      // An unindented line under a list item continues it ("... (convar x\nto toggle ...)").
      const last = blocks.at(-1);
      if (continues && paragraph.length === 0 && last?.kind === "list") {
        last.items[last.items.length - 1] += ` ${text}`;
      } else {
        paragraph.push(text);
      }
    }
  }
  flush();

  const lead = blocks.find((block) => block.kind === "paragraph" && block.text.length >= BLURB_MIN);
  const blurb = lead?.kind === "paragraph" ? clip(lead.text) : undefined;
  // An uncut blurb is already on the page; the notes carry the rest.
  return {
    blurb,
    blocks: lead && blurb === (lead as { text: string }).text ? blocks.filter((block) => block !== lead) : blocks,
  };
}

/** A paragraph cut at a word, with an ellipsis, when it is longer than a header should carry. */
function clip(text: string): string {
  if (text.length <= BLURB_MAX) return text;
  const cut = text.slice(0, BLURB_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
