import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle, CheckCircle2, FolderOpen, FolderSearch, Terminal, Upload } from "lucide-react";

import { DirectoryGuide } from "~/components/features/ingest-cache/DirectoryGuide";
import { CopyableCode } from "~/components/patterns/code/CopyableCode";
import { BulletItem, BulletList } from "~/components/patterns/content/BulletList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useIngestUpload } from "~/hooks/useIngestUpload";
import { pageTitle, seo } from "~/lib/seo";

const WINDOWS_INSTALL_COMMAND =
  "irm https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-windows.ps1 | iex";
const LINUX_INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-linux.sh | bash";
const DOCKER_INSTALL_COMMAND = `docker run -d --restart unless-stopped \\
  -v ~/.steam/steam/appcache/httpcache:/root/.steam/steam/appcache/httpcache \\
  ghcr.io/deadlock-api/deadlock-api-ingest:latest`;

function InstallCommand({ intro, code, children }: { intro: string; code: string; children?: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text as="p" tone="muted">
        {intro}
      </Text>
      <CopyableCode language="bash" code={code} copyLabel="Copy command" />
      {children}
    </Stack>
  );
}

export const Route = createFileRoute("/ingest-cache")({
  component: IngestCache,
  head: () =>
    seo({
      title: pageTitle("Community Data Ingestion"),
      description: "Upload match replay data from your Steam cache to help expand the Deadlock API database.",
      path: "/ingest-cache",
    }),
});

function IngestCache() {
  const { state, closeDialog, fileInputRef, openDirectoryPicker, handleFileInput, dragHandlers } = useIngestUpload();

  return (
    <PageShell density="content">
      <PageHeader
        size="lg"
        title="Steam Cache Ingestion"
        description="Help improve Deadlock API by sharing your match data"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-5" />
            Automatic Ingestion (Recommended)
          </CardTitle>
          <CardDescription>
            Install the background service and it will automatically submit your match data whenever you play
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent>
          <Stack gap={4}>
            <Tabs defaultValue="windows" className="gap-5">
              <TabsList className="w-full">
                <TabsTrigger value="windows" className="flex-1">
                  🪟 Windows
                </TabsTrigger>
                <TabsTrigger value="linux" className="flex-1">
                  🐧 Linux
                </TabsTrigger>
                <TabsTrigger value="docker" className="flex-1">
                  🐳 Docker
                </TabsTrigger>
              </TabsList>
              <TabsContent value="windows">
                <InstallCommand
                  intro="Run in PowerShell as Administrator (right-click PowerShell, then Run as administrator):"
                  code={WINDOWS_INSTALL_COMMAND}
                >
                  <Text as="p" variant="caption" tone="muted">
                    Auto-start needs Administrator rights: the installer registers a scheduled task that starts the
                    service when you sign in, and it turns auto-start on if you don&apos;t answer within 10 seconds. In
                    a normal PowerShell window, press N when it asks about auto-start and let it create desktop
                    shortcuts to start the service yourself. Otherwise it stops with &quot;Administrator privileges are
                    required&quot;.
                  </Text>
                </InstallCommand>
              </TabsContent>
              <TabsContent value="linux">
                <InstallCommand intro="Run in a terminal:" code={LINUX_INSTALL_COMMAND} />
              </TabsContent>
              <TabsContent value="docker">
                <InstallCommand intro="Run the pre-built image:" code={DOCKER_INSTALL_COMMAND} />
              </TabsContent>
            </Tabs>
            <BulletList orientation="horizontal">
              <BulletItem>Privacy-focused: only match IDs are submitted</BulletItem>
              <BulletItem>Lightweight background service</BulletItem>
              <BulletItem>No root needed on Linux</BulletItem>
            </BulletList>
            <TextLink
              href="https://github.com/deadlock-api/deadlock-api-ingest"
              external
              className="self-start text-sm font-medium"
            >
              View on GitHub
            </TextLink>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Upload Match Data
          </CardTitle>
          <CardDescription>
            Select your Steam httpcache directory to contribute match information and enhance our database
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent {...dragHandlers}>
          <Stack gap={6}>
            {/* The folder picker the button below opens; it is never shown itself. */}
            <Input
              ref={fileInputRef}
              type="file"
              webkitdirectory=""
              aria-label="Select httpcache directory"
              className="hidden"
              onChange={async (e) => {
                await handleFileInput(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              onClick={openDirectoryPicker}
              disabled={state.isLoading}
              aria-busy={state.isLoading}
              className="h-32 w-full text-lg"
              variant={state.isDragging ? "soft" : "outline"}
            >
              {state.isLoading ? (
                <Stack align="center">
                  <Spinner size="lg" />
                  {state.phase === "uploading" ? (
                    <Stack gap={1} align="center">
                      <span className="font-semibold">Uploading...</span>
                      <Text numeric="tabular">
                        {state.uploadHandled.toLocaleString("en-US")} of {state.uploadTotal.toLocaleString("en-US")}{" "}
                        matches
                      </Text>
                    </Stack>
                  ) : (
                    <Stack gap={1} align="center">
                      <span className="font-semibold">Scanning directory...</span>
                      <Text numeric="tabular">{state.saltsFound.toLocaleString("en-US")} salts found</Text>
                    </Stack>
                  )}
                </Stack>
              ) : state.isDragging ? (
                <Stack align="center" className="pointer-events-none">
                  <Upload className="size-8" />
                  <span>Drop directory here</span>
                </Stack>
              ) : (
                <Stack align="center">
                  <FolderOpen className="size-8" />
                  <span>Select Directory or Drop Here</span>
                </Stack>
              )}
            </Button>

            <Alert>
              <AlertDescription className="text-sm">
                <strong>Privacy Note:</strong> Only match IDs (salts) are uploaded. No personal information is
                collected.
              </AlertDescription>
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <DirectoryGuide />

      <Dialog open={state.dialog.open} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {state.dialog.type === "success" ? (
                <CheckCircle2 aria-hidden="true" className="size-5 text-positive" />
              ) : state.dialog.type === "partial" ? (
                <AlertTriangle aria-hidden="true" className="size-5 text-warning" />
              ) : state.dialog.type === "empty" ? (
                <FolderSearch aria-hidden="true" className="size-5 text-muted-foreground" />
              ) : (
                <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
              )}
              {state.dialog.title}
            </DialogTitle>
            <DialogDescription className="pt-2">{state.dialog.description}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
