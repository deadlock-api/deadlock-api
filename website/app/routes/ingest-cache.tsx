import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FolderOpen, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";

interface Salts {
  cluster_id: number;
  match_id: number;
  metadata_salt: number | null;
  replay_salt: number | null;
}

const valveNetPattern = new TextEncoder().encode(".valve.net");

function findSubarrayIndex(haystack: Uint8Array, needle: Uint8Array, startIndex: number = 0): number {
  if (needle.length === 0) return startIndex;
  if (needle.length > haystack.length - startIndex) return -1;
  if (startIndex < 0 || startIndex >= haystack.length) return -1;

  for (let i = startIndex; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}

function isValidHostChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 46;
}

function extractReplayUrl(data: Uint8Array): string | null {
  let i = -1;
  while (true) {
    i = findSubarrayIndex(data, valveNetPattern, i + 1);
    if (i === -1) {
      break;
    }
    let host_start = i;
    while (host_start > 0 && isValidHostChar(data[host_start - 1])) {
      host_start--;
    }

    const host_end = i + valveNetPattern.length;
    const host = new TextDecoder().decode(data.subarray(host_start, host_end));

    if (!(host.startsWith("replay") && host.includes(".valve.net"))) {
      continue;
    }

    let path_start = -1;
    for (let j = host_end; j < host_end + 200 && j < data.length; j++) {
      if (data[j] === 47) {
        path_start = j;
        break;
      }
    }
    if (path_start === -1) {
      continue;
    }

    const search_slice = data.subarray(path_start, Math.min(path_start + 300, data.length));
    let min_end = search_slice.length;
    const end_markers = [0, 10, 13, 32, 34, 39];
    for (const marker of end_markers) {
      const pos = search_slice.indexOf(marker);
      if (pos !== -1) {
        min_end = Math.min(min_end, pos);
      }
    }
    const path = new TextDecoder().decode(search_slice.subarray(0, min_end));
    const url = `http://${host}${path}`;
    if (url.includes("1422450")) {
      return url;
    }
  }

  return null;
}

const replayUrlRegex = /http:\/\/replay(\d+)\.valve\.net\/1422450\/(\d+)_(\d+)\.(meta|dem)\.bz2/;

function urlToSalts(url: string): Salts | null {
  const pipePos = url.indexOf("?");
  const cleanUrl = pipePos !== -1 ? url.substring(0, pipePos) : url;
  const match = cleanUrl.match(replayUrlRegex);
  if (!match) return null;

  const [, cluster_id, match_id, salt, type] = match;
  return {
    cluster_id: parseInt(cluster_id, 10),
    match_id: parseInt(match_id, 10),
    metadata_salt: type === "meta" ? parseInt(salt, 10) : null,
    replay_salt: type === "dem" ? parseInt(salt, 10) : null,
  };
}

async function processFile(fileHandle: FileSystemFileHandle): Promise<Salts | null> {
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const replayUrl = extractReplayUrl(data);
  return replayUrl ? urlToSalts(replayUrl) : null;
}

async function scanDirHandle(
  dirHandle: FileSystemDirectoryHandle,
  setSaltsFound: (count: number) => void,
): Promise<Set<Salts>> {
  const salts: Set<Salts> = new Set();
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      const salt = await processFile(entry);
      if (salt) {
        salts.add(salt);
        setSaltsFound((prev) => prev + 1);
      }
    } else if (entry.kind === "directory") {
      const subSalts = await scanDirHandle(entry, setSaltsFound);
      for (const subSalt of subSalts) {
        salts.add(subSalt);
      }
    }
  }
  return salts;
}

import { cn } from "~/lib/utils";

export default function () {
  const [isLoading, setIsLoading] = useState(false);
  const [saltsFound, setSaltsFound] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogType, setDialogType] = useState<"success" | "error">("success");
  const [openSection, setOpenSection] = useState<string | null>("windows");
  const [isDragging, setIsDragging] = useState(false);

  const handleDirectory = async (dirHandle: FileSystemDirectoryHandle) => {
    setIsLoading(true);
    setSaltsFound(0);
    try {
      const salts = Array.from(await scanDirHandle(dirHandle, setSaltsFound));
      setIsLoading(false);

      const response = await fetch("https://api.deadlock-api.com/v1/matches/salts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salts),
      });

      if (response.ok) {
        setDialogType("success");
        setDialogTitle("Success!");
        setDialogDescription(`${salts.length} salts uploaded successfully!`);
      } else {
        setDialogType("error");
        setDialogTitle("Upload Failed");
        setDialogDescription("Failed to upload salts. Please try again.");
      }
    } catch (error) {
      setIsLoading(false);
      setDialogType("error");
      setDialogTitle("Error");
      setDialogDescription("An error occurred while processing the directory.");
      console.error(error);
    }
    setDialogOpen(true);
  };

  const openDirectoryPicker = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      await handleDirectory(dirHandle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return; // User cancelled the picker
      }
      setIsLoading(false);
      setDialogType("error");
      setDialogTitle("Error");
      setDialogDescription("An error occurred while opening the directory picker.");
      console.error(error);
      setDialogOpen(true);
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
        const handle = await (e.dataTransfer.items[0] as any).getAsFileSystemHandle();
        if (handle && handle.kind === "directory") {
          await handleDirectory(handle as FileSystemDirectoryHandle);
        } else {
          setDialogType("error");
          setDialogTitle("Invalid Drop");
          setDialogDescription("Please drop a directory, not a file.");
          setDialogOpen(true);
        }
      } catch (error) {
        setIsLoading(false);
        setDialogType("error");
        setDialogTitle("Error");
        setDialogDescription("Could not process the dropped item. Is it a directory?");
        console.error(error);
        setDialogOpen(true);
      }
    }
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Steam Cache Ingestion</h1>
        <p className="text-gray-600">Help improve Deadlock API by sharing your match data</p>
      </div>

      <Card className="mb-6 shadow-lg pt-0">
        <CardHeader className="bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 py-4 rounded-t-2xl">
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
                <Loader2 className="w-8 h-8 animate-spin" />
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
            Find the <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">httpcache</code> folder in your
            Steam installation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Collapsible open={openSection === "windows"} onOpenChange={() => toggleSection("windows")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="font-semibold flex items-center gap-2">🪟 Windows</span>
              {openSection === "windows" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Default Steam installation path:</p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm overflow-x-auto">
                C:\Program Files (x86)\Steam\appcache\httpcache
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={openSection === "macos"} onOpenChange={() => toggleSection("macos")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="font-semibold flex items-center gap-2">🍎 macOS</span>
              {openSection === "macos" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm overflow-x-auto">
                ~/Library/Application Support/Steam/appcache/httpcache
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={openSection === "linux"} onOpenChange={() => toggleSection("linux")}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="font-semibold flex items-center gap-2">🐧 Linux</span>
              {openSection === "linux" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 pl-4 pb-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Common locations (try these in order):</p>
              <div className="space-y-2 text-sm">
                <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                  ~/.local/share/Steam/appcache/httpcache
                </div>
                <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                  ~/.steam/steam/appcache/httpcache
                </div>
                <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                  ~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache
                </div>
                <details className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <summary className="hover:text-gray-700 dark:hover:text-gray-300">
                    Show all possible locations...
                  </summary>
                  <div className="space-y-2 mt-2">
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/.steam/root/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/.steam/debian-installation/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/snap/steam/common/.local/share/Steam/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
                      ~/snap/steam/common/.steam/steam/appcache/httpcache
                    </div>
                    <div className="bg-gray-900 text-gray-100 p-2 rounded font-mono overflow-x-auto">
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
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
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
