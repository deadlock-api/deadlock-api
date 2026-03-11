import posthogClient from "posthog-js";
import { useReducer, useRef } from "react";

import { API_ORIGIN } from "~/lib/constants";
import type { Salts } from "~/lib/ingest-cache-scanner";
import { scanDirHandle, scanEntry, scanFileList } from "~/lib/ingest-cache-scanner";

interface DialogState {
  open: boolean;
  title: string;
  description: string;
  type: "success" | "error";
}

interface IngestState {
  isLoading: boolean;
  saltsFound: number;
  isDragging: boolean;
  dialog: DialogState;
}

type IngestAction =
  | { type: "SCAN_START" }
  | { type: "SCAN_PROGRESS" }
  | { type: "SCAN_DONE" }
  | { type: "SET_DRAGGING"; value: boolean }
  | { type: "SHOW_DIALOG"; dialog: Omit<DialogState, "open"> }
  | { type: "CLOSE_DIALOG" };

function ingestReducer(state: IngestState, action: IngestAction): IngestState {
  switch (action.type) {
    case "SCAN_START":
      return { ...state, isLoading: true, saltsFound: 0 };
    case "SCAN_PROGRESS":
      return { ...state, saltsFound: state.saltsFound + 1 };
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
  saltsFound: 0,
  isDragging: false,
  dialog: { open: false, title: "", description: "", type: "success" },
};

export function useIngestUpload() {
  const [state, dispatch] = useReducer(ingestReducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoadingRef = useRef(false);

  const showError = (title: string, description: string) => {
    dispatch({ type: "SHOW_DIALOG", dialog: { title, description, type: "error" } });
  };

  const incrementSalts = () => dispatch({ type: "SCAN_PROGRESS" });

  const runScanAndUpload = async (scanFn: () => Promise<Set<Salts>>) => {
    dispatch({ type: "SCAN_START" });
    isLoadingRef.current = true;
    try {
      const salts = Array.from(await scanFn());

      const response = await fetch(`${API_ORIGIN}/v1/matches/salts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salts),
      });

      if (response.ok) {
        dispatch({
          type: "SHOW_DIALOG",
          dialog: {
            title: "Success!",
            description: `${salts.length} salts uploaded successfully!`,
            type: "success",
          },
        });
        posthogClient.capture("cache_upload_completed", { salt_count: salts.length });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.message ?? errorData.error ?? `HTTP ${response.status}`;
        showError("Upload Failed", `Failed to upload salts: ${detail}`);
        posthogClient.capture("cache_upload_failed", { reason: detail });
      }
    } catch (error) {
      showError(
        "Error",
        error instanceof Error
          ? `Failed to scan or upload: ${error.message}`
          : "Failed to scan directory or upload salts. Please try again.",
      );
      posthogClient.capture("cache_upload_failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      console.error("Scan/upload failed:", error);
    } finally {
      dispatch({ type: "SCAN_DONE" });
      isLoadingRef.current = false;
    }
  };

  const openDirectoryPicker = async () => {
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        posthogClient.capture("cache_upload_initiated", { method: "directory_picker" });
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
      posthogClient.capture("cache_upload_initiated", { method: "file_input" });
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
