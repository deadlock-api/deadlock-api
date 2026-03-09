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
        <p className="text-sm text-muted-foreground mt-1">Help improve Deadlock API by sharing your match data</p>
      </div>

      <div>
        <PatronCTA />
      </div>

      <Card className="shadow-lg pt-0">
        <CardHeader className="bg-linear-to-r from-primary/10 to-transparent py-4 border-b border-border rounded-t-2xl">
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
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
              "w-full h-32 text-lg relative overflow-hidden group border-primary border-2 border-dashed transition-colors",
              state.isDragging && "bg-primary/10 border-primary",
            )}
            variant="secondary"
          >
            {state.isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <LoadingLogo />
                <div className="text-center">
                  <p className="font-semibold">Scanning directory...</p>
                  <p className="text-sm font-normal mt-1">{state.saltsFound} salts found</p>
                </div>
              </div>
            ) : state.isDragging ? (
              <div className="flex flex-col items-center gap-3 pointer-events-none">
                <Upload className="size-8" />
                <span>Drop directory here</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FolderOpen className="size-8 group-hover:scale-110 transition-transform" />
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
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
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
