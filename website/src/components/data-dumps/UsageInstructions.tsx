import { useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { HighlightedCode, type HighlightLanguage } from "~/components/HighlightedCode";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { Tabs, TabsContent } from "~/components/ui/tabs";

import { McpInstructions } from "./McpSection";
import { CATALOG_URL, LAKE_URL, MANIFEST_URL } from "./utils";

function CodeBlock({ code, language }: { code: string; language: HighlightLanguage }) {
  return (
    <div className="relative">
      <HighlightedCode code={code} language={language} />
      <CopyButton
        iconOnly
        text={code}
        title="Copy code"
        className="absolute top-1.5 right-1.5 bg-background/60 backdrop-blur"
      />
    </div>
  );
}

const DUCKLAKE_EXAMPLE = `-- DuckDB 1.4+ (CLI or any client). Attach the catalog over plain HTTPS; no secrets, no S3 setup.
INSTALL ducklake; LOAD ducklake;
INSTALL httpfs;   LOAD httpfs;
ATTACH 'ducklake:${CATALOG_URL}' AS lake (READ_ONLY);

SHOW TABLES;
SELECT count(*) FROM lake.leaderboard;

-- match_player is exported incrementally: hourly delta files plus one base file per partition.
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
        { "key": "v1/tables/match_player/g1/base/part-105/....parquet", "kind": "base", "partition": 105, "hi": 1789640000, ... },
        { "key": "v1/tables/match_player/g1/delta/....parquet", "kind": "delta", "lo": 1789644480, "hi": 1789648080, ... }
      ]
    }
  }
}

# Files of the current generation only:  generation == table.generation  (snapshots: all files)
# Base files hold rows with watermark <= hi; deltas/residuals hold rows with watermark in (lo, hi].
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

# pandas / polars work on single files directly:
#   pd.read_parquet(urls("leaderboard")[0])
#   pl.scan_parquet(urls("match_player")).filter(pl.col("match_id") > 105_000_000)`;

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
  { id: "manifest", label: "Manifest", language: "json", code: MANIFEST_EXAMPLE },
  { id: "curl", label: "curl", language: "bash", code: CURL_EXAMPLE },
  { id: "js", label: "JavaScript", language: "javascript", code: JS_EXAMPLE },
] as const;
const USAGE_TAB_OPTIONS = STATIC_TABS.map((t) => ({ value: t.id, label: t.label }));

export function UsageInstructions() {
  const [tab, setTab] = useState<string>(STATIC_TABS[0].id);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <Tabs value={tab} onValueChange={setTab}>
        <ResponsiveTabsList value={tab} onValueChange={setTab} options={USAGE_TAB_OPTIONS} ariaLabel="Usage guides" />
        {STATIC_TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-2">
            {t.id === "mcp" ? <McpInstructions /> : <CodeBlock code={t.code} language={t.language} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
