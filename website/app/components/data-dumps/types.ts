export const SQL_PLAYGROUND_DEFAULT_QUERY = "SELECT count(*) FROM player_match_history";

export interface S3File {
  key: string;
  size: number;
  lastModified: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface ShardGroup {
  base: string;
  shards: S3File[];
  totalSize: number;
  lastModified: string;
}

export interface PlaygroundTable {
  name: string;
  urls: string[];
}
