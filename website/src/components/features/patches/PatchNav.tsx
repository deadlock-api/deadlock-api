import { Link } from "@tanstack/react-router";

import { ListDetailAside, ListDetailItem } from "~/components/patterns/list-detail/ListDetail";
import { type PatchEntry, patchDate } from "~/lib/patches";

/** Every patch, newest first; the newest lives at `/patches`. */
export function PatchNav({ patches, currentId }: { patches: readonly PatchEntry[]; currentId: string | undefined }) {
  return (
    <ListDetailAside label="Patches" selection="follow" height="viewport">
      {patches.map((patch, index) => {
        const named = patch.shortName !== "Patch";
        return (
          <ListDetailItem
            key={patch.id}
            asChild
            current={patch.id === currentId}
            title={named ? patch.shortName : "Update"}
            aside={patchDate(patch)}
          >
            {index === 0 ? (
              // Exact: `/patches` is the parent of every patch's address, and Link would mark it current on all of them.
              <Link to="/patches" activeOptions={{ exact: true }} preload="intent" />
            ) : (
              <Link to="/patches/$patchId" params={{ patchId: patch.id }} preload="intent" />
            )}
          </ListDetailItem>
        );
      })}
    </ListDetailAside>
  );
}
