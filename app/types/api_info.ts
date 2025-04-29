interface TableSize {
  rows: number;
}

export interface APIInfo {
  fetched_matches_per_day: number;
  table_sizes: { [table: string]: TableSize };
}
