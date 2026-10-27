import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Gamepad2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Field } from "~/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Stack } from "~/components/ui/stack";
import { Textarea } from "~/components/ui/textarea";
import { useHeroBuildCodec } from "~/hooks/useHeroBuildCodec";
import { type DesignerBuild, designerBuildFromGame, gameBuildFromDesigner } from "~/lib/build-designer-code";
import { loadHeroBuildCodec } from "~/lib/wasm/load-hero-build";
import { WasmCallError } from "~/lib/wasm/module";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

/** "Import": reads a build code copied in game into the designer. */
export function ImportGameBuildButton({
  stageNames,
  onImport,
}: {
  /** The designer's stages: a game build's item groups map onto them. */
  stageNames: readonly string[];
  onImport: (build: DesignerBuild) => void;
}) {
  const codec = useHeroBuildCodec();
  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inputId = useId();

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) {
      setError("Paste a build code copied in game.");
      return;
    }
    setReading(true);
    try {
      const reader = codec ?? (await loadHeroBuildCodec());
      const build = designerBuildFromGame(reader.decode(draft), stageNames);
      // Items the shop no longer has (a build from an older patch) cannot be planned.
      const known = upgrades ? new Set(upgrades.map((item) => item.id)) : null;
      onImport(known ? { ...build, path: build.path.filter((key) => known.has(Number(key.split(":")[1]))) } : build);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof WasmCallError
          ? "This is not a Deadlock build code."
          : "The build code reader did not load. Try again.",
      );
    } finally {
      setReading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft("");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          <ClipboardPaste />
          Import
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Import a game build" className="w-80">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <Stack gap={2}>
            <Field label="Build code from the game" htmlFor={inputId} error={error}>
              <Textarea
                id={inputId}
                syntax="identifier"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                className="max-h-32 font-mono text-xs break-all"
              />
            </Field>
            <Button type="submit" size="sm" loading={reading} loadingLabel="Reading the build code">
              Import
            </Button>
          </Stack>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** "Copy game code": the build as a code to paste in game. */
export function CopyGameBuildButton({
  disabled = false,
  ...build
}: Parameters<typeof gameBuildFromDesigner>[0] & {
  /** Nothing to copy yet: the button keeps its place on the row. */
  disabled?: boolean;
}) {
  const codec = useHeroBuildCodec();
  return (
    <CopyButton
      variant="ghost"
      size="xs"
      icon={Gamepad2}
      // Ready before a press can come: the code is written at once, while the press still allows a clipboard write.
      disabled={disabled || codec == null}
      text={() => codec?.encode(gameBuildFromDesigner(build)) ?? ""}
    >
      Copy game code
    </CopyButton>
  );
}
