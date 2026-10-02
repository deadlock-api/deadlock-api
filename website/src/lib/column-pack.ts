/**
 * Rows of numbers packed by column: `{ wins: [..], losses: [..] }` instead of one object per row. A query caches the
 * packed form, so the server dehydrates every field name once instead of once per row, and its `select` hands
 * observers the rows again. Only the listed fields survive, which is what makes a response small enough to embed.
 */
export type PackedColumns<K extends string> = { [Key in K]: number[] };

export function packColumns<K extends string>(rows: readonly { [Key in K]: number }[], fields: readonly K[]) {
  const packed = {} as PackedColumns<K>;
  for (const field of fields) packed[field] = rows.map((row) => row[field]);
  return packed;
}

export function unpackColumns<K extends string>(packed: PackedColumns<K>): { [Key in K]: number }[] {
  const fields = Object.keys(packed) as K[];
  const length = fields.length > 0 ? packed[fields[0]].length : 0;
  return Array.from({ length }, (_, i) => {
    const row = {} as { [Key in K]: number };
    for (const field of fields) row[field] = packed[field][i];
    return row;
  });
}
