export interface Salts {
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
  return processFileObject(file);
}

async function processFileObject(file: File): Promise<Salts | null> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const replayUrl = extractReplayUrl(data);
  return replayUrl ? urlToSalts(replayUrl) : null;
}

export async function scanDirHandle(
  dirHandle: FileSystemDirectoryHandle,
  onSaltFound: () => void,
): Promise<Set<Salts>> {
  const salts: Set<Salts> = new Set();
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      const salt = await processFile(entry);
      if (salt) {
        salts.add(salt);
        onSaltFound();
      }
    } else if (entry.kind === "directory") {
      const subSalts = await scanDirHandle(entry, onSaltFound);
      for (const subSalt of subSalts) {
        salts.add(subSalt);
      }
    }
  }
  return salts;
}

export async function scanFileList(files: FileList, onSaltFound: () => void): Promise<Set<Salts>> {
  const salts: Set<Salts> = new Set();
  const results = await Promise.all(Array.from(files).map((file) => processFileObject(file)));
  for (const salt of results) {
    if (salt) {
      salts.add(salt);
      onSaltFound();
    }
  }
  return salts;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
        } else {
          entries.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

function getFileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

export async function scanEntry(entry: FileSystemEntry, onSaltFound: () => void): Promise<Set<Salts>> {
  const salts: Set<Salts> = new Set();
  if (entry.isFile) {
    const file = await getFileFromEntry(entry as FileSystemFileEntry);
    const salt = await processFileObject(file);
    if (salt) {
      salts.add(salt);
      onSaltFound();
    }
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(reader);
    const allSubSalts = await Promise.all(entries.map((childEntry) => scanEntry(childEntry, onSaltFound)));
    for (const subSalts of allSubSalts) {
      for (const s of subSalts) {
        salts.add(s);
      }
    }
  }
  return salts;
}
