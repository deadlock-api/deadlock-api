import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FolderOpen, Upload } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import type { MetaFunction } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import { PatronCTA } from "~/components/PatronCTA";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { API_ORIGIN } from "~/lib/constants";
import { type Salts, scanDirHandle, scanEntry, scanFileList } from "~/lib/ingest-cache-scanner";
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
  const [isLoading, setIsLoading] = useState(false);
  const [saltsFound, setSaltsFound] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogType, setDialogType] = useState<"success" | "error">("success");
  const [openSection, setOpenSection] = useState<string | null>("windows");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runScanAndUpload = async (scanFn: () => Promise<Set<Salts>>) => {
    setIsLoading(true);
    setSaltsFound(0);
    try {
      const salts = Array.from(await scanFn());
      setIsLoading(false);

      const response = await fetch(`${API_ORIGIN}/v1/matches/salts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salts),
      });

      if (response.ok) {
        setDialogType("success");
        setDialogTitle("Success!");
        setDialogDescription(`${salts.length} salts uploaded successfully!`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.message ?? errorData.error ?? `HTTP ${response.status}`;
        setDialogType("error");
        setDialogTitle("Upload Failed");
        setDialogDescription(`Failed to upload salts: ${detail}`);
      }
    } catch (error) {
      setIsLoading(false);
      setDialogType("error");
      setDialogTitle("Error");
      setDialogDescription(
        error instanceof Error
          ? `Failed to scan or upload: ${error.message}`
          : "Failed to scan directory or upload salts. Please try again.",
      );
      console.error("Scan/upload failed:", error);
    }
    setDialogOpen(true);
  };

  const openDirectoryPicker = async () => {
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        await runScanAndUpload(() => scanDirHandle(dirHandle, setSaltsFound));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setIsLoading(false);
        setDialogType("error");
        setDialogTitle("Error");
        setDialogDescription(
          error instanceof Error
            ? `Failed to open directory picker: ${error.message}`
            : "Failed to open directory picker. Please try again.",
        );
        console.error("Directory picker failed:", error);
        setDialogOpen(true);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isLoading) return;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const item = e.dataTransfer.items[0];
        if ("getAsFileSystemHandle" in item) {
          const handle = await (item as any).getAsFileSystemHandle();
          if (handle && handle.kind === "directory") {
            await runScanAndUpload(() => scanDirHandle(handle as FileSystemDirectoryHandle, setSaltsFound));
          } else {
            setDialogType("error");
            setDialogTitle("Invalid Drop");
            setDialogDescription("Please drop a directory, not a file.");
            setDialogOpen(true);
          }
        } else {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            await runScanAndUpload(() => scanEntry(entry, setSaltsFound));
          } else {
            setDialogType("error");
            setDialogTitle("Invalid Drop");
            setDialogDescription("Please drop a directory, not a file.");
            setDialogOpen(true);
          }
        }
      } catch (error) {
        setIsLoading(false);
        setDialogType("error");
        setDialogTitle("Error");
        setDialogDescription(
          error instanceof Error
            ? `Failed to process dropped item: ${error.message}`
            : "Failed to process the dropped item. Please ensure you're dropping a directory.",
        );
        console.error("Drop handling failed:", error);
        setDialogOpen(true);
      }
    }
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

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
        <CardContent
          className="pt-6"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in standard types
            webkitdirectory=""
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0) {
                await runScanAndUpload(() => scanFileList(e.target.files!, setSaltsFound));
                e.target.value = "";
              }
            }}
          />
          <Button
            onClick={openDirectoryPicker}
            disabled={isLoading}
            className={cn(
              "w-full h-32 text-lg relative overflow-hidden group border-primary border-2 border-dashed transition-colors",
              isDragging && "bg-primary/10 border-primary",
            )}
            variant="secondary"
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <LoadingLogo />
                <div className="text-center">
                  <p className="font-semibold">Scanning directory...</p>
                  <p className="text-sm font-normal mt-1">{saltsFound} salts found</p>
                </div>
              </div>
            ) : isDragging ? (
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

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">📁 Directory Location Guide</CardTitle>
          <CardDescription>
            Find the <code className="bg-muted px-2 py-1 rounded">httpcache</code> folder in your Steam installation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Collapsible open={openSection === "windows"} onOpenChange={() => toggleSection("windows")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
              <span className="font-semibold flex items-center gap-2">🪟 Windows</span>
              {openSection === "windows" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <p className="text-sm text-muted-foreground mb-3">Default Steam installation path:</p>
              <div className="bg-background text-foreground p-3 rounded font-mono text-sm overflow-x-auto">
                C:\Program Files (x86)\Steam\appcache\httpcache
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={openSection === "macos"} onOpenChange={() => toggleSection("macos")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
              <span className="font-semibold flex items-center gap-2">🍎 macOS</span>
              {openSection === "macos" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <div className="bg-background text-foreground p-3 rounded font-mono text-sm overflow-x-auto">
                ~/Library/Application Support/Steam/appcache/httpcache
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={openSection === "linux"} onOpenChange={() => toggleSection("linux")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
              <span className="font-semibold flex items-center gap-2">🐧 Linux</span>
              {openSection === "linux" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <p className="text-sm text-muted-foreground mb-3">Common locations (try these in order):</p>
              <div className="space-y-2 text-sm">
                <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                  ~/.local/share/Steam/appcache/httpcache
                </div>
                <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                  ~/.steam/steam/appcache/httpcache
                </div>
                <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                  ~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache
                </div>
                <details className="text-xs text-muted-foreground cursor-pointer">
                  <summary className="hover:text-foreground">Show all possible locations...</summary>
                  <div className="space-y-2 mt-2">
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/.steam/root/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/.steam/debian-installation/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/snap/steam/common/.local/share/Steam/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/snap/steam/common/.steam/steam/appcache/httpcache
                    </div>
                    <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                      ~/snap/steam/common/.steam/root/appcache/httpcache
                    </div>
                  </div>
                </details>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="pt-2">{dialogDescription}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
