import { useReducer, useRef } from "react";

import { API_ORIGIN } from "~/lib/constants";
import type { Salts } from "~/lib/ingest-cache-scanner";
import { scanDirHandle, scanEntry, scanFileList } from "~/lib/ingest-cache-scanner";
import { type BatchResult, dedupeSalts, type UploadSummary, uploadInBatches } from "~/lib/ingest-salts";

interface DialogState {
  open: boolean;
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
  isDragging: boolean;
  dialog: DialogState;
}

type IngestAction =
  | { type: "SCAN_START" }
  | { type: "SCAN_PROGRESS" }
  | { type: "UPLOAD_START"; total: number }
  | { type: "UPLOAD_PROGRESS"; handled: number }
  | { type: "SCAN_DONE" }
  | { type: "SET_DRAGGING"; value: boolean }
  | { type: "SHOW_DIALOG"; dialog: Omit<DialogState, "open"> }
  | { type: "CLOSE_DIALOG" };

function ingestReducer(state: IngestState, action: IngestAction): IngestState {
  switch (action.type) {
    case "SCAN_START":
      return { ...state, isLoading: true, phase: "scanning", saltsFound: 0, uploadTotal: 0, uploadHandled: 0 };
    case "SCAN_PROGRESS":
      return { ...state, saltsFound: state.saltsFound + 1 };
    case "UPLOAD_START":
      return { ...state, phase: "uploading", uploadTotal: action.total, uploadHandled: 0 };
    case "UPLOAD_PROGRESS":
      return { ...state, uploadHandled: action.handled };
    case "SCAN_DONE":
      return { ...state, isLoading: false };
    case "SET_DRAGGING":
      return { ...state, isDragging: action.value };
    case "SHOW_DIALOG":
      return { ...state, dialog: { ...action.dialog, open: true } };
    case "CLOSE_DIALOG":
      return { ...state, dialog: { ...state.dialog, open: false } };
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
  isDragging: false,
  dialog: { open: false, title: "", description: "", type: "success" },
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

function resultDialog(summary: UploadSummary): Omit<DialogState, "open"> {
  const total = summary.sent + summary.failed;
  const newOnes = `${matches(summary.ingested)} ${summary.ingested === 1 ? "was" : "were"} new to the database.`;
  if (summary.failed === 0) {
    return {
      title: "Success!",
      description: `Uploaded ${matches(summary.sent)}. ${newOnes}`,
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
    description: `Uploaded ${count.format(summary.sent)} of ${matches(total)}; ${newOnes} The other ${count.format(summary.failed)} failed (${summary.error}). Select the folder again to retry them.`,
    type: "partial",
  };
}

export function useIngestUpload() {
  const [state, dispatch] = useReducer(ingestReducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoadingRef = useRef(false);

  const showError = (title: string, description: string) => {
    dispatch({ type: "SHOW_DIALOG", dialog: { title, description, type: "error" } });
  };

  const incrementSalts = () => dispatch({ type: "SCAN_PROGRESS" });

  const runScanAndUpload = async (scanFn: () => Promise<Iterable<Salts>>) => {
    dispatch({ type: "SCAN_START" });
    isLoadingRef.current = true;
    try {
      const salts = dedupeSalts(await scanFn());

      if (salts.length === 0) {
        dispatch({
          type: "SHOW_DIALOG",
          dialog: {
            title: "No match data found",
            description:
              "No Deadlock match data found in this folder — did you pick the right one? It is Steam's appcache/httpcache folder; the guide below shows where it is. Nothing was uploaded.",
            type: "empty",
          },
        });
      } else {
        dispatch({ type: "UPLOAD_START", total: salts.length });
        const summary = await uploadInBatches(salts, sendBatch, (handled) =>
          dispatch({ type: "UPLOAD_PROGRESS", handled }),
        );
        dispatch({ type: "SHOW_DIALOG", dialog: resultDialog(summary) });
      }
    } catch (error) {
      showError(
        "Error",
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
          "Error",
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: "SET_DRAGGING", value: false });

    if (isLoadingRef.current) return;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const item = e.dataTransfer.items[0];
        if ("getAsFileSystemHandle" in item) {
          const handle = await (item as FileSystemAccessDataTransferItem).getAsFileSystemHandle();
          if (handle && handle.kind === "directory") {
            await runScanAndUpload(() => scanDirHandle(handle as FileSystemDirectoryHandle, incrementSalts));
          } else {
            showError("Invalid Drop", "Please drop a directory, not a file.");
          }
        } else {
          const entry = item.webkitGetAsEntry();
          if (entry?.isDirectory) {
            await runScanAndUpload(() => scanEntry(entry, incrementSalts));
          } else {
            showError("Invalid Drop", "Please drop a directory, not a file.");
          }
        }
      } catch (error) {
        showError(
          "Error",
          error instanceof Error
            ? `Failed to process dropped item: ${error.message}`
            : "Failed to process the dropped item. Please ensure you're dropping a directory.",
        );
        console.error("Drop handling failed:", error);
      }
    }
  };

  const closeDialog = () => dispatch({ type: "CLOSE_DIALOG" });

  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        dispatch({ type: "SET_DRAGGING", value: true });
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "SET_DRAGGING", value: false });
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: handleDrop,
  };

  return {
    state,
    closeDialog,
    fileInputRef,
    openDirectoryPicker,
    handleFileInput,
    dragHandlers,
  };
}
