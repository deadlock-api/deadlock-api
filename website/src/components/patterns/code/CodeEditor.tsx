import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import CodeMirror, { EditorView, type Extension, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useMemo } from "react";

import { CONTROL_SURFACE, FOCUS_WITHIN_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

// The editor's chrome and syntax colors read the semantic tokens, so a theme swap restyles it like any other control.
const chrome = EditorView.theme(
  {
    "&": { color: "var(--foreground)", backgroundColor: "transparent", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
    ".cm-content": { caretColor: "var(--foreground)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--subtle-hover)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "transparent",
      outline: "1px solid var(--muted-foreground)",
    },
    ".cm-placeholder": { color: "var(--muted-foreground)" },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-completionDetail": { color: "var(--muted-foreground)" },
  },
  { dark: true },
);

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: "var(--syntax-keyword)" },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syntax-string)" },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syntax-number)" },
    { tag: [tags.typeName, tags.standard(tags.name), tags.function(tags.variableName)], color: "var(--syntax-type)" },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
    { tag: tags.invalid, color: "var(--destructive)" },
  ]),
);

type CodeEditorName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

type CodeEditorProps = Omit<
  React.ComponentProps<"div">,
  "onChange" | "defaultValue" | "aria-label" | "aria-labelledby"
> &
  CodeEditorName & {
    value: string;
    onValueChange: (value: string) => void;
    /** The language and anything else the editor needs (`sql({ schema })`, `EditorView.lineWrapping`). */
    extensions?: Extension[];
    /** `numbers` shows line numbers in the gutter. */
    gutter?: "numbers" | "none";
    /** The CodeMirror handle, for a caller that inserts text at the cursor (`editorRef.current.view`). */
    editorRef?: React.Ref<ReactCodeMirrorRef>;
  };

/**
 * An editable block of code (a SQL query): CodeMirror in a text control's box, colored by the syntax tokens. It needs
 * a name, `aria-label` or `aria-labelledby`, which goes to the editable area itself. It grows to its parent's height.
 *
 * Browser only: the server build stubs it (plugins/client-only-modules.mjs), so it renders inside `<ClientOnly>`.
 */
export function CodeEditor({
  value,
  onValueChange,
  extensions = [],
  gutter = "numbers",
  editorRef,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
  ...props
}: CodeEditorProps) {
  const allExtensions = useMemo(() => {
    const name: Record<string, string> = ariaLabelledby
      ? { "aria-labelledby": ariaLabelledby }
      : { "aria-label": ariaLabel ?? "" };
    return [chrome, highlight, EditorView.contentAttributes.of({ ...name, "aria-multiline": "true" }), ...extensions];
  }, [ariaLabel, ariaLabelledby, extensions]);

  return (
    <div
      data-slot="code-editor"
      data-gutter={gutter}
      className={cn(CONTROL_SURFACE, FOCUS_WITHIN_RING, "min-h-0 overflow-hidden", className)}
      {...props}
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={onValueChange}
        extensions={allExtensions}
        theme="none"
        height="100%"
        className="h-full"
        // Tab moves focus on, as in any other text field, rather than trapping the keyboard in the editor.
        indentWithTab={false}
        basicSetup={{
          lineNumbers: gutter === "numbers",
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: gutter === "numbers",
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          syntaxHighlighting: false,
          tabSize: 2,
        }}
      />
    </div>
  );
}
