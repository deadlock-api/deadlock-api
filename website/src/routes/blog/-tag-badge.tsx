import { Tag } from "lucide-react";
import type { ComponentProps } from "react";

import { Badge } from "~/components/ui/badge";

const TAG_VARIANT: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  announcement: "chart-1",
  data: "chart-2",
  guide: "chart-3",
  community: "chart-4",
  patch: "chart-5",
  engineering: "chart-6",
  infrastructure: "chart-7",
  meta: "chart-8",
};

export function TagBadge({ tag }: { tag: string }) {
  return (
    <Badge variant={TAG_VARIANT[tag] ?? "muted"}>
      <Tag />
      {tag}
    </Badge>
  );
}
