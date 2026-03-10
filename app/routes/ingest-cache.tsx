import { AlertCircle, CheckCircle2, FolderOpen, Upload } from "lucide-react";
import type { MetaFunction } from "react-router";

import { DirectoryGuide } from "~/components/ingest-cache/DirectoryGuide";
import { LoadingLogo } from "~/components/LoadingLogo";
import { PatronCTA } from "~/components/PatronCTA";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useIngestUpload } from "~/hooks/useIngestUpload";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Community Data Ingestion | Deadlock API",
    description: "Upload match replay data from your Steam cache to help expand the Deadlock API database.",
    path: "/ingest-cache",
  });
};

export default function IngestCache() {
  const { state, closeDialog, fileInputRef, openDirectoryPicker, handleFileInput, dragHandlers } = useIngestUpload();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Steam Cache Ingestion</h1>
        <p className="mt-1 text-sm text-muted-foreground">Help improve Deadlock API by sharing your match data</p>
      </div>

      <div>
        <PatronCTA />
      </div>

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
