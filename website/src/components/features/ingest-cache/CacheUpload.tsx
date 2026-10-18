import { AlertCircle, AlertTriangle, CheckCircle2, FolderOpen, FolderSearch, Upload } from "lucide-react";
import { useState } from "react";

import { CopyableCode } from "~/components/patterns/code/CopyableCode";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { Step, Steps } from "~/components/patterns/content/Steps";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { DropZone, DropZoneStatus } from "~/components/ui/drop-zone";
import { useDropZone } from "~/components/ui/hooks/use-drop-zone";
import { IconTile } from "~/components/ui/icon-tile";
import { Input } from "~/components/ui/input";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";
import { type IngestResult, useIngestUpload } from "~/hooks/useIngestUpload";
import { useIsLinux } from "~/hooks/useIsLinux";

import { STEAM_CACHE_PATHS } from "./faq";

function CachePath({ path }: { path: string }) {
  return <CopyableCode size="sm" code={path} copyLabel={`Copy ${path}`} />;
}

function CachePaths() {
  const isLinux = useIsLinux();
  const [picked, setPicked] = useState<string>();
  return (
    <Tabs value={picked ?? (isLinux ? "linux" : "windows")} onValueChange={setPicked} className="gap-3">
      <TabsList aria-label="Operating system">
        <TabsTrigger value="windows">Windows</TabsTrigger>
        <TabsTrigger value="macos">macOS</TabsTrigger>
        <TabsTrigger value="linux">Linux</TabsTrigger>
      </TabsList>
      <TabsPanels>
        <TabsContent value="windows">
          <CachePath path={STEAM_CACHE_PATHS.windows} />
        </TabsContent>
        <TabsContent value="macos">
          <CachePath path={STEAM_CACHE_PATHS.macos} />
        </TabsContent>
        <TabsContent value="linux" className="flex flex-col gap-2">
          {STEAM_CACHE_PATHS.linux.map((path) => (
            <CachePath key={path} path={path} />
          ))}
          <Disclosure variant="inline" title="Flatpak, Snap and other installs">
            <Stack gap={2}>
              {STEAM_CACHE_PATHS.linuxMore.map((path) => (
                <CachePath key={path} path={path} />
              ))}
            </Stack>
          </Disclosure>
        </TabsContent>
      </TabsPanels>
    </Tabs>
  );
}

const RESULT_ICON: Record<IngestResult["type"], React.ReactNode> = {
  success: (
    <IconTile tone="positive" shape="circle" size="lg">
      <CheckCircle2 />
    </IconTile>
  ),
  partial: (
    <IconTile tone="warning" shape="circle" size="lg">
      <AlertTriangle />
    </IconTile>
  ),
  empty: (
    <IconTile tone="muted" shape="circle" size="lg">
      <FolderSearch />
    </IconTile>
  ),
  error: (
    <IconTile tone="negative" shape="circle" size="lg">
      <AlertCircle />
    </IconTile>
  ),
};

const count = new Intl.NumberFormat("en-US");

/** The one-time upload: find Steam's cache folder, then drop or choose it. Progress and the result show in the zone. */
export function CacheUpload() {
  const { state, fileInputRef, openDirectoryPicker, handleFileInput, handleDrop } = useIngestUpload();
  const { over, dropZoneProps } = useDropZone({ onDrop: handleDrop, disabled: state.isLoading });
  const { result } = state;

  return (
    <Card className="h-full">
      <CardContent>
        <Steps>
          <Step title="Find the httpcache folder inside your Steam install.">
            <CachePaths />
          </Step>
          <Step title="Drop the folder here, or choose it. Your browser reads it, only match IDs are sent.">
            {/* The folder picker for browsers without showDirectoryPicker; the button opens it. */}
            <Input
              ref={fileInputRef}
              type="file"
              webkitdirectory=""
              aria-label="Choose the httpcache folder"
              className="hidden"
              onChange={async (e) => {
                await handleFileInput(e.target.files);
                e.target.value = "";
              }}
            />
            <DropZone state={over ? "over" : "idle"} aria-busy={state.isLoading} {...dropZoneProps}>
              {state.isLoading ? (
                <Spinner size="lg" aria-hidden="true" />
              ) : over ? (
                <IconTile tone="primary" shape="circle" size="lg">
                  <Upload />
                </IconTile>
              ) : result ? (
                RESULT_ICON[result.type]
              ) : (
                <IconTile tone="muted" shape="circle" size="lg">
                  <FolderOpen />
                </IconTile>
              )}
              <DropZoneStatus>
                {state.isLoading ? (
                  <Text variant="label" numeric="tabular">
                    {state.phase === "uploading"
                      ? `Sending ${count.format(state.uploadHandled)} of ${count.format(state.uploadTotal)} matches`
                      : `Scanning, ${count.format(state.saltsFound)} found`}
                  </Text>
                ) : over ? (
                  <Text variant="label">Drop to scan and upload</Text>
                ) : result ? (
                  <>
                    <Text variant="label">{result.title}</Text>
                    <Text as="p" variant="caption" tone="muted" className="max-w-md text-balance">
                      {result.description}
                    </Text>
                  </>
                ) : (
                  <Text variant="label">Drop the httpcache folder here</Text>
                )}
              </DropZoneStatus>
              {state.isLoading && state.phase === "uploading" && (
                <ProgressBar value={state.uploadHandled} max={state.uploadTotal} className="w-full max-w-xs" />
              )}
              {!state.isLoading && !over && (
                <Button
                  variant={result ? "outline" : "default"}
                  size={result ? "sm" : "default"}
                  onClick={openDirectoryPicker}
                >
                  {result && <FolderOpen aria-hidden="true" />}
                  {result
                    ? result.type === "success"
                      ? "Upload another folder"
                      : "Choose the folder again"
                    : "Choose folder"}
                </Button>
              )}
            </DropZone>
          </Step>
        </Steps>
      </CardContent>
    </Card>
  );
}
