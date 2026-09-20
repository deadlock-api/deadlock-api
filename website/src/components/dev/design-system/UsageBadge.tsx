import { usageOf } from "~/components/dev/design-system/usage";
import { Badge } from "~/components/ui/badge";
import { DetailPopover } from "~/components/ui/detail-popover";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { TooltipHeader } from "~/components/ui/panel-tooltip";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

const MOST_FILES = 12;

/** How often a specimen's module is used across the codebase, counted live from the source. Click to pin the list. */
export function UsageBadge({ source }: { source: string }) {
  const usage = usageOf(source);
  if (!/(^|·\s*)(ui|patterns|domain)\//.test(source)) return null;

  if (usage.files.length === 0) {
    return (
      <Badge variant="warning" size="sm">
        unused
      </Badge>
    );
  }

  const label = `${usage.uses.toLocaleString("en-US")}× in ${usage.files.length} ${usage.files.length === 1 ? "file" : "files"}`;
  return (
    <DetailPopover
      label="Usage"
      size="xs"
      details={
        <Stack gap={2}>
          <TooltipHeader title={label} subtitle={usage.byArea.map(([area, files]) => `${area} ${files}`).join(" · ")} />
          <KeyValueList variant="plain">
            {usage.files.slice(0, MOST_FILES).map(({ file, uses }) => (
              <KeyValue key={file} label={file} value={`${uses}×`} />
            ))}
          </KeyValueList>
          {usage.files.length > MOST_FILES && (
            <Text variant="caption" tone="muted">
              and {usage.files.length - MOST_FILES} more files
            </Text>
          )}
        </Stack>
      }
    >
      <Text variant="meta" numeric="tabular">
        {label}
      </Text>
    </DetailPopover>
  );
}
