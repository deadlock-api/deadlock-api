import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ExternalLink, FolderOpen, Terminal, Upload } from "lucide-react";

import { HighlightedCode } from "~/components/HighlightedCode";
import { DirectoryGuide } from "~/components/ingest-cache/DirectoryGuide";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useIngestUpload } from "~/hooks/useIngestUpload";
import { seo } from "~/lib/seo";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/ingest-cache")({
  component: IngestCache,
  head: () =>
    seo({
      title: "Community Data Ingestion | Deadlock API",
      description: "Upload match replay data from your Steam cache to help expand the Deadlock API database.",
      path: "/ingest-cache",
    }),
});

function IngestCache() {
  const { state, closeDialog, fileInputRef, openDirectoryPicker, handleFileInput, dragHandlers } = useIngestUpload();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Steam Cache Ingestion</h1>
        <p className="mt-1 text-sm text-muted-foreground">Help improve Deadlock API by sharing your match data</p>
      </div>

      {/* Auto Ingest */}
      <Card className="pt-0 shadow-lg">
        <CardHeader className="rounded-t-2xl border-b border-border bg-linear-to-r from-primary/10 to-transparent py-4">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Automatic Ingestion (Recommended)
          </CardTitle>
          <CardDescription>
            Install the background service and it will automatically submit your match data whenever you play
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Tabs defaultValue="windows">
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
            <TabsContent value="windows" className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Run in PowerShell:</p>
              <div className="rounded-lg border border-border bg-background p-3">
                <HighlightedCode
                  language="bash"
                  code="irm https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-windows.ps1 | iex"
                />
              </div>
            </TabsContent>
            <TabsContent value="linux" className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Run in a terminal:</p>
              <div className="rounded-lg border border-border bg-background p-3">
                <HighlightedCode
                  language="bash"
                  code="curl -fsSL https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-linux.sh | bash"
                />
              </div>
            </TabsContent>
            <TabsContent value="docker" className="mt-3">
              <p className="mb-2 text-sm text-muted-foreground">Run the pre-built image:</p>
              <div className="rounded-lg border border-border bg-background p-3">
                <HighlightedCode
                  language="bash"
                  code={`docker run -d --restart unless-stopped \\
  -v ~/.steam/steam/appcache/httpcache:/root/.steam/steam/appcache/httpcache \\
  ghcr.io/deadlock-api/deadlock-api-ingest:latest`}
                />
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              Privacy-focused — only match IDs are submitted
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              Lightweight background service
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              No admin rights required
            </div>
          </div>
          <a
            href="https://github.com/deadlock-api/deadlock-api-ingest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            View on GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <Card className="pt-0 shadow-lg">
        <CardHeader className="rounded-t-2xl border-b border-border bg-linear-to-r from-primary/10 to-transparent py-4">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Match Data
          </CardTitle>
          <CardDescription>
            Select your Steam httpcache directory to contribute match information and enhance our database
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6" {...dragHandlers}>
          <input
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
            className={cn(
              "group relative h-32 w-full overflow-hidden border-2 border-dashed border-primary text-lg transition-colors",
              state.isDragging && "border-primary bg-primary/10",
            )}
            variant="secondary"
          >
            {state.isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <LoadingLogo />
                <div className="text-center">
                  <p className="font-semibold">Scanning directory...</p>
                  <p className="mt-1 text-sm font-normal">{state.saltsFound} salts found</p>
                </div>
              </div>
            ) : state.isDragging ? (
              <div className="pointer-events-none flex flex-col items-center gap-3">
                <Upload className="size-8" />
                <span>Drop directory here</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FolderOpen className="size-8 transition-transform group-hover:scale-110" />
                <span>Select Directory or Drop Here</span>
              </div>
            )}
          </Button>

          <Alert className="mt-6">
            <AlertDescription className="text-sm">
              <strong>Privacy Note:</strong> Only match IDs (salts) are uploaded. No personal information is collected.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <DirectoryGuide />

      <Dialog open={state.dialog.open} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {state.dialog.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              {state.dialog.title}
            </DialogTitle>
            <DialogDescription className="pt-2">{state.dialog.description}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
