import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Heading } from "~/components/ui/heading";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Text } from "~/components/ui/text";
import type { PatchNotes as Notes } from "~/lib/patch-notes";
import { cn } from "~/lib/utils";

/**
 * What Valve wrote about a patch, as a panel: the opening lines of its announcement, then the full notes. Both are
 * plain text blocks, so nothing of the post's own markup reaches the page.
 */
export function PatchNotes({
  notes,
  layout = "fit",
}: {
  notes: Notes;
  /** `fit`: the notes scroll past a fixed height. `fill`: from a wide page on, the height of the block beside it. */
  layout?: "fit" | "fill";
}) {
  if (!notes.blurb && notes.blocks.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Patch Notes" size="sm" />
      {/* Stacked, the notes scroll past a fixed height. Beside the stats the panel takes their height and shows as much
          of the text as fits, scrolling for the rest; its text adds nothing to the height of the row, but a short table
          does not shrink it below a readable floor. */}
      <div className={layout === "fill" ? "@5xl:relative @5xl:min-h-64 @5xl:flex-1" : undefined}>
        <div
          className={cn(
            layout === "fill" && "@5xl:absolute @5xl:inset-0 @5xl:scroll-fade-y @5xl:overflow-y-auto",
            SCROLLBAR_THIN,
          )}
        >
          <PanelBody className="flex flex-col items-start gap-3">
            {notes.blurb && <Text as="p">{notes.blurb}</Text>}
            {notes.blocks.length > 0 && (
              <div
                className={cn(
                  "flex max-h-96 w-full flex-col gap-3 overflow-y-auto",
                  layout === "fill" && "@5xl:max-h-none",
                  SCROLLBAR_THIN,
                )}
              >
                {notes.blocks.map((block, index) => {
                  if (block.kind === "heading") {
                    return (
                      // eslint-disable-next-line react/no-array-index-key -- blocks have no id and never reorder
                      <Heading key={index} as="h3" size="sm">
                        {block.text}
                      </Heading>
                    );
                  }
                  if (block.kind === "list") {
                    return (
                      // eslint-disable-next-line react/no-array-index-key -- blocks have no id and never reorder
                      <ul key={index} className="flex list-disc flex-col gap-1.5 ps-5 type-body">
                        {block.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    // eslint-disable-next-line react/no-array-index-key -- blocks have no id and never reorder
                    <Text key={index} as="p">
                      {block.text}
                    </Text>
                  );
                })}
              </div>
            )}
          </PanelBody>
        </div>
      </div>
    </Panel>
  );
}
