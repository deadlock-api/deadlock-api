import { useReducer, useRef } from "react";

import { API_ORIGIN } from "~/lib/constants";
import type { Salts } from "~/lib/ingest-cache-scanner";
import { scanDirHandle, scanEntry, scanFileList } from "~/lib/ingest-cache-scanner";
import { type BatchResult, dedupeSalts, type UploadSummary, uploadInBatches } from "~/lib/ingest-salts";

export interface IngestResult {
  title: string;
  description: string;
  /** `partial`: some batches were sent, some failed. `empty`: the folder held no match data, nothing was sent. */
  type: "success" | "partial" | "error" | "empty";
}

interface IngestState {
  isLoading: boolean;
  phase: "scanning" | "uploading";
  saltsFound: number;
  /** Matches to send after removing duplicates, and how many of them are sent or failed so far. */
  uploadTotal: number;
  uploadHandled: number;
  /** The outcome of the last scan, shown until the next one starts. */
  result: IngestResult | null;
}

type IngestAction =
  | { type: "SCAN_START" }
  | { type: "SCAN_PROGRESS" }
  | { type: "UPLOAD_START"; total: number }
  | { type: "UPLOAD_PROGRESS"; handled: number }
  | { type: "SCAN_DONE" }
  | { type: "SHOW_RESULT"; result: IngestResult }
  | { type: "CLEAR_RESULT" };

function ingestReducer(state: IngestState, action: IngestAction): IngestState {
  switch (action.type) {
    case "SCAN_START":
      return {
        ...state,
        isLoading: true,
        phase: "scanning",
        saltsFound: 0,
        uploadTotal: 0,
        uploadHandled: 0,
        result: null,
      };
    case "SCAN_PROGRESS":
      return { ...state, saltsFound: state.saltsFound + 1 };
    case "UPLOAD_START":
      return { ...state, phase: "uploading", uploadTotal: action.total, uploadHandled: 0 };
    case "UPLOAD_PROGRESS":
      return { ...state, uploadHandled: action.handled };
    case "SCAN_DONE":
      return { ...state, isLoading: false };
    case "SHOW_RESULT":
      return { ...state, result: action.result };
    case "CLEAR_RESULT":
      return { ...state, result: null };
    default:
      return state;
  }
}

const initialState: IngestState = {
  isLoading: false,
  phase: "scanning",
  saltsFound: 0,
  uploadTotal: 0,
  uploadHandled: 0,
  result: null,
};

const count = new Intl.NumberFormat("en-US");

function matches(n: number) {
  return `${count.format(n)} ${n === 1 ? "match" : "matches"}`;
}

async function sendBatch(batch: Salts[]): Promise<BatchResult> {
  const response = await fetch(`${API_ORIGIN}/v1/matches/salts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: body.message ?? body.error ?? `HTTP ${response.status}` };
  }
  return { ok: true, ingested: typeof body.salts_ingested === "number" ? body.salts_ingested : null };
}

function uploadResult(summary: UploadSummary): IngestResult {
  const total = summary.sent + summary.failed;
  const newOnes = `${matches(summary.ingested)} ${summary.ingested === 1 ? "was" : "were"} new to the database.`;
  if (summary.failed === 0) {
    return {
      title: `Sent ${matches(summary.sent)}`,
      description: newOnes,
      type: "success",
    };
  }
  if (summary.sent === 0) {
    return {
      title: "Upload failed",
      description: `None of the ${matches(total)} could be uploaded (${summary.error}). Please try again later.`,
      type: "error",
    };
  }
  return {
    title: "Partly uploaded",
    description: `Uploaded ${count.format(summary.sent)} of ${matches(total)}; ${newOnes} The other ${count.format(summary.failed)} failed (${summary.error}). Choose the folder again to retry them.`,
    type: "partial",
  };
}

export function useIngestUpload() {
  const [state, dispatch] = useReducer(ingestReducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoadingRef = useRef(false);

  const showError = (title: string, description: string) => {
    dispatch({ type: "SHOW_RESULT", result: { title, description, type: "error" } });
  };

  const incrementSalts = () => dispatch({ type: "SCAN_PROGRESS" });

  const runScanAndUpload = async (scanFn: () => Promise<Iterable<Salts>>) => {
    dispatch({ type: "SCAN_START" });
    isLoadingRef.current = true;
    try {
      const salts = dedupeSalts(await scanFn());

      if (salts.length === 0) {
        dispatch({
          type: "SHOW_RESULT",
          result: {
            title: "No match data found",
            description: "Nothing was sent. Choose the httpcache folder inside Steam's appcache folder.",
            type: "empty",
          },
        });
      } else {
        dispatch({ type: "UPLOAD_START", total: salts.length });
        const summary = await uploadInBatches(salts, sendBatch, (handled) =>
          dispatch({ type: "UPLOAD_PROGRESS", handled }),
        );
        dispatch({ type: "SHOW_RESULT", result: uploadResult(summary) });
      }
    } catch (error) {
      showError(
        "Something went wrong",
        error instanceof Error
          ? `Failed to scan or upload: ${error.message}`
          : "Failed to scan directory or upload salts. Please try again.",
      );
      console.error("Scan/upload failed:", error);
    }
    dispatch({ type: "SCAN_DONE" });
    isLoadingRef.current = false;
  };

  const openDirectoryPicker = async () => {
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        await runScanAndUpload(() => scanDirHandle(dirHandle, incrementSalts));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        showError(
          "Something went wrong",
          error instanceof Error
            ? `Failed to open directory picker: ${error.message}`
            : "Failed to open directory picker. Please try again.",
        );
        console.error("Directory picker failed:", error);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = async (files: FileList | null) => {
    if (files && files.length > 0) {
      await runScanAndUpload(() => scanFileList(files, incrementSalts));
    }
  };

  /** For `useDropZone`'s `onDrop`: scans the dropped folder. */
  const handleDrop = async (e: React.DragEvent) => {
    if (isLoadingRef.current) return;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const item = e.dataTransfer.items[0];
        if ("getAsFileSystemHandle" in item) {
          const handle = await (item as FileSystemAccessDataTransferItem).getAsFileSystemHandle();
          if (handle && handle.kind === "directory") {
            await runScanAndUpload(() => scanDirHandle(handle as FileSystemDirectoryHandle, incrementSalts));
          } else {
            showError("That is a file", "Drop the httpcache folder itself, not a file from inside it.");
          }
        } else {
          const entry = item.webkitGetAsEntry();
          if (entry?.isDirectory) {
            await runScanAndUpload(() => scanEntry(entry, incrementSalts));
          } else {
            showError("That is a file", "Drop the httpcache folder itself, not a file from inside it.");
          }
        }
      } catch (error) {
        showError(
          "Something went wrong",
          error instanceof Error
            ? `Failed to process dropped item: ${error.message}`
            : "Failed to process the dropped item. Please ensure you're dropping a directory.",
        );
        console.error("Drop handling failed:", error);
      }
    }
  };

  const clearResult = () => dispatch({ type: "CLEAR_RESULT" });

  return {
    state,
    clearResult,
    fileInputRef,
    openDirectoryPicker,
    handleFileInput,
    handleDrop,
  };
}
