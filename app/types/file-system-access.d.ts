// Type declarations for the File System Access API
// https://wicg.github.io/file-system-access/

interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemAccessDataTransferItem extends DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}

declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
