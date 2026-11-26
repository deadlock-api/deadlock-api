import { useState } from "react";

import { HighlightedCode } from "~/components/patterns/code/HighlightedCode";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent } from "~/components/ui/tabs";

import { McpInstructions } from "./McpSection";
import { CATALOG_URL, LAKE_URL, MANIFEST_URL } from "./utils";

const DUCKLAKE_EXAMPLE = `-- DuckDB 1.4+ (CLI or any client). Attach the catalog over plain HTTPS; no secrets, no S3 setup.
INSTALL ducklake; LOAD ducklake;
INSTALL httpfs;   LOAD httpfs;
ATTACH 'ducklake:${CATALOG_URL}' AS lake (READ_ONLY);

SHOW TABLES;
SELECT count(*) FROM lake.leaderboard;

-- match_player is exported incrementally: hourly delta files plus base files per partition (each under 500 MB).
-- The catalog keeps per-file statistics, so filtering on match_id / account_id / start_time
-- reads only the files that matter.
SELECT hero_id, count(*) AS games, avg(kills) AS kills
FROM lake.match_player
WHERE match_id BETWEEN 105000000 AND 105100000
GROUP BY ALL ORDER BY games DESC;

-- A row can appear twice (base + newer delta). match_player_latest keeps the newest per (match_id, account_id).
SELECT * FROM lake.match_player_latest WHERE match_id = 105000042;`;

const MANIFEST_EXAMPLE = `# ${MANIFEST_URL}
# Every table lists the parquet files readers should union (all URLs are plain HTTPS).
{
  "version": 123,
  "generated_at": "2026-09-17T14:03:00Z",
  "public_url": "${LAKE_URL}",
  "catalog": "v1/catalog/123.ducklake",
  "tables": {
    "leaderboard": {
      "policy": "snapshot", "status": "ready",
      "columns": [{ "name": "region", "type": "Enum8(...)" }, ...],
      "files": [{ "key": "v1/tables/leaderboard/snapshot/20260917T140000Z-ab12.parquet",
                  "kind": "snapshot", "rows": 14516322, "bytes": 12390978, "built_at": "..." }]
    },
    "match_player": {
      "policy": "incremental", "status": "ready", "watermark": "created_at",
      "partition_expr": "intDiv(match_id, 1000000)", "generation": 1, "watermark_hi": 1789648080,
      "files": [
        { "key": "v1/tables/match_player/g1/base/part-105/....parquet", "kind": "base", "partition": 105, "hi": 1789640000,
          "min_match_id": 105000000, "max_match_id": 105041312, "min_start_time": 1786111200, "max_start_time": 1786190400, ... },
        { "key": "v1/tables/match_player/g1/delta/....parquet", "kind": "delta", "lo": 1789644480, "hi": 1789648080, ... }
      ]
    }
  }
}

# Files of the current generation only:  generation == table.generation  (snapshots: all files)
# Base files hold rows with watermark <= hi; deltas/residuals hold rows with watermark in (lo, hi].
# Base files carry min/max_match_id and min/max_start_time (unix seconds): pick files by range without opening them.
# Files are immutable and uniquely named; the manifest is the only object that changes.`;

const PYTHON_EXAMPLE = `# pip install duckdb requests
import duckdb, requests

manifest = requests.get("${MANIFEST_URL}").json()
base = manifest["public_url"]

def urls(table: str) -> list[str]:
    t = manifest["tables"][table]
    gen = t.get("generation", 0)
    return [f"{base}/{f['key']}" for f in t["files"]
            if t["policy"] == "snapshot" or f.get("generation", 0) == gen]

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
for name in manifest["tables"]:
    con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet({urls(name)!r}, union_by_name = true)")

print(con.sql("SELECT count(*) FROM leaderboard"))

# pandas works on single files directly:
#   pd.read_parquet(urls("leaderboard")[0])`;

const POLARS_EXAMPLE = `# pip install polars requests
import polars as pl
import requests

manifest = requests.get("${MANIFEST_URL}").json()
base = manifest["public_url"]

def urls(table: str, partition: int | None = None) -> list[str]:
    """Parquet URLs of a table; for match_player optionally only the files holding one match_id // 1_000_000 partition."""
    t = manifest["tables"][table]
    files = [f for f in t["files"] if t["policy"] == "snapshot" or f.get("generation", 0) == t["generation"]]
    if partition is not None:
        files = [f for f in files if f.get("partition") == partition or str(partition) in f.get("rows_by_partition", {})]
    return [f"{base}/{f['key']}" for f in files]

# Big snapshot tables (steam_profiles, match_salts) are split into several files
leaderboard = pl.scan_parquet(urls("leaderboard")).collect()
print(leaderboard.head())

# match_player: scan lazily, so only the needed columns and row groups are downloaded
matches = (
    pl.scan_parquet(urls("match_player", partition=136), missing_columns="insert")
    .filter(pl.col("match_id").is_between(136_000_000, 136_009_999))
    .select("match_id", "account_id", "hero_id", "kills", "deaths", "won", "created_at")
    # base + newer delta can hold the same row: keep the newest per (match_id, account_id)
    .sort("created_at")
    .unique(["match_id", "account_id"], keep="last")
    .group_by("hero_id")
    .agg(games=pl.len(), win_rate=pl.col("won").mean(), kills=pl.col("kills").mean())
    .sort("games", descending=True)
    .collect()
)
print(matches)`;

const CURL_EXAMPLE = `# List the tables and their files
curl -s ${MANIFEST_URL} | jq '.tables | map_values({policy, status, files: (.files | length)})'

# Download every file of one table (all URLs are public HTTPS, no signing)
curl -s ${MANIFEST_URL} \\
  | jq -r --arg t leaderboard '.public_url as $b | .tables[$t].files[] | "\\($b)/\\(.key)"' \\
  | xargs -n1 curl -sO

# The DuckLake catalog is a plain file too
curl -sO ${CATALOG_URL}`;

const JS_EXAMPLE = `// Node 18+ / Bun: load a parquet file into Apache Arrow / JS objects
//   pnpm add apache-arrow parquet-wasm
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm";

const manifest = await fetch("${MANIFEST_URL}").then((r) => r.json());
const { key } = manifest.tables.leaderboard.files[0];

const buf = new Uint8Array(await fetch(\`\${manifest.public_url}/\${key}\`).then((r) => r.arrayBuffer()));
const table = tableFromIPC(readParquet(buf).intoIPCStream());
console.table(table.toArray().slice(0, 5));`;

const STATIC_TABS = [
  { id: "mcp", label: "MCP Server (AI assistants)", language: "bash", code: "" },
  { id: "duckdb", label: "DuckDB / DuckLake", language: "sql", code: DUCKLAKE_EXAMPLE },
  { id: "python", label: "Python", language: "python", code: PYTHON_EXAMPLE },
  { id: "polars", label: "Polars", language: "python", code: POLARS_EXAMPLE },
  { id: "manifest", label: "Manifest", language: "json", code: MANIFEST_EXAMPLE },
  { id: "curl", label: "curl", language: "bash", code: CURL_EXAMPLE },
  { id: "js", label: "JavaScript", language: "javascript", code: JS_EXAMPLE },
] as const;

export function UsageInstructions() {
  const [tab, setTab] = useState<string>(STATIC_TABS[0].id);
  return (
    <Card tone="glass" size="sm" radius="lg">
      <CardContent>
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <ResponsiveTabsList variant="line" aria-label="Usage guides">
            {STATIC_TABS.map((t) => (
              <ResponsiveTab key={t.id} value={t.id}>
                {t.label}
              </ResponsiveTab>
            ))}
          </ResponsiveTabsList>
          {STATIC_TABS.map((t) => (
            <TabsContent key={t.id} value={t.id}>
              {t.id === "mcp" ? (
                <McpInstructions />
              ) : (
                <HighlightedCode code={t.code} language={t.language} actions="copy" />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
