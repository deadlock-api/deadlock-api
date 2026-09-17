export const SQL_PLAYGROUND_DEFAULT_QUERY = "SELECT region, count(*) AS entries FROM leaderboard GROUP BY ALL";

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface PlaygroundTable {
  name: string;
  urls: string[];
}

// Shape of https://data.deadlock-api.com/v1/manifest.json (written by the API's data_dump service).
export type FileKind = "base" | "delta" | "residual" | "snapshot";

export interface ManifestFile {
  key: string;
  kind: FileKind;
  generation?: number;
  partition?: number;
  lo?: number;
  hi?: number;
  rows: number;
  bytes: number;
  built_at: string;
}

export interface ManifestTable {
  policy: "incremental" | "snapshot";
  status: "building" | "ready";
  columns: ColumnInfo[];
  watermark?: string;
  partition_expr?: string;
  generation?: number;
  building?: number;
  watermark_hi?: number;
  files: ManifestFile[];
}

export interface Manifest {
  format_version: number;
  version: number;
  generated_at: string | null;
  public_url: string;
  catalog: string | null;
  duckdb_version: string | null;
  tables: Record<string, ManifestTable>;
}

/** A table as shown on the page: the manifest entry plus the files readers should union. */
export interface LakeTable extends ManifestTable {
  name: string;
  /** Files of the current generation, each with its public URL. */
  files: (ManifestFile & { url: string })[];
  totalBytes: number;
  totalRows: number;
  lastBuiltAt: string | null;
}

export function lakeTables(manifest: Manifest): LakeTable[] {
  const base = manifest.public_url.replace(/\/$/, "");
  return Object.entries(manifest.tables)
    .map(([name, t]) => {
      const generation = t.generation ?? 0;
      const files = t.files
        .filter((f) => t.policy === "snapshot" || (f.generation ?? 0) === generation)
        .map((f) => Object.assign({ url: `${base}/${f.key}` }, f))
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      const table: LakeTable = Object.assign({}, t, {
        name,
        files,
        totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
        totalRows: files.reduce((sum, f) => sum + f.rows, 0),
        lastBuiltAt: files.reduce<string | null>(
          (latest, f) => (!latest || f.built_at > latest ? f.built_at : latest),
          null,
        ),
      });
      return table;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
