interface TableSize {
  rows: number;
}

export interface APIInfo {
  fetched_matches_per_day: number;
  missed_matches: number;
  table_sizes?: { [table: string]: TableSize };
}
