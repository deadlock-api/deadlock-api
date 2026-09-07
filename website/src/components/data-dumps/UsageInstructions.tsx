import { useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { HighlightedCode, type HighlightLanguage } from "~/components/HighlightedCode";
import { ResponsiveTabsList } from "~/components/ResponsiveTabsList";
import { Tabs, TabsContent } from "~/components/ui/tabs";

import { McpInstructions } from "./McpSection";
import { BUCKET_BASE, BUCKET_NAME, BUCKET_URL, ROOT_PREFIX } from "./utils";

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

const AWS_CLI_EXAMPLE = `# The bucket is public and unsigned. Pass --no-sign-request to skip credentials.

# List the public folder
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 ls s3://${BUCKET_NAME}/${ROOT_PREFIX}

# Download a single file
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 cp s3://${BUCKET_NAME}/${ROOT_PREFIX}heroes.parquet ./heroes.parquet

# Mirror the whole public folder locally
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 sync s3://${BUCKET_NAME}/${ROOT_PREFIX} ./public/`;

const MC_CLI_EXAMPLE = `# Add an alias for the bucket (no credentials required for the public dataset)
mc alias set deadlock ${BUCKET_BASE} "" ""

# List the public folder
mc ls deadlock/${BUCKET_NAME}/${ROOT_PREFIX}

# Recursive listing with sizes
mc ls --recursive deadlock/${BUCKET_NAME}/${ROOT_PREFIX}

# Download a single file
mc cp deadlock/${BUCKET_NAME}/${ROOT_PREFIX}heroes.parquet ./heroes.parquet

# Mirror the public folder locally
mc mirror deadlock/${BUCKET_NAME}/${ROOT_PREFIX} ./public/`;

const PYTHON_EXAMPLE = `# pip install pandas pyarrow
import pandas as pd

URL = "${BUCKET_URL}/${ROOT_PREFIX}heroes.parquet"

df = pd.read_parquet(URL)
print(df.head())`;

const JS_EXAMPLE = `// Node 18+ / Bun: load a parquet file into Apache Arrow / JS objects
//   pnpm add apache-arrow parquet-wasm
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm";

const URL = "${BUCKET_URL}/${ROOT_PREFIX}heroes.parquet";

const buf = new Uint8Array(await fetch(URL).then((r) => r.arrayBuffer()));
const table = tableFromIPC(readParquet(buf).intoIPCStream());
console.table(table.toArray().slice(0, 5));`;

const DUCKLAKE_EXAMPLE = `# pip install duckdb
import duckdb

DUCKLAKE_URL = "ducklake:${BUCKET_BASE}/fast/db_snapshot.ducklake"

with duckdb.connect() as con:
    con.execute("""
        INSTALL ducklake; LOAD ducklake;
        INSTALL httpfs; LOAD httpfs;
        CREATE OR REPLACE SECRET deadlock_s3 (
            TYPE S3, KEY_ID '', SECRET '',
            ENDPOINT 's3-cache.deadlock-api.com', URL_STYLE 'path', USE_SSL true
        );
    """)
    con.execute(f"ATTACH '{DUCKLAKE_URL}' AS db (READ_ONLY)")
    con.execute("USE db.main")

    # Tables are now queryable directly:
    con.sql("SHOW TABLES").show()
    con.sql("SELECT count(*) FROM heroes").show()`;

const DUCKDB_EXAMPLE = `# pip install boto3 duckdb
import re
from collections import defaultdict
from typing import Generator, Iterable

import boto3
import duckdb
from botocore import UNSIGNED
from botocore.config import Config

S3_URL = "${BUCKET_BASE}"
BUCKET_URL = f"{S3_URL}/${BUCKET_NAME}"


def list_parquet_files() -> Generator[str, None, None]:
    s3 = boto3.client(
        "s3", config=Config(signature_version=UNSIGNED), endpoint_url=S3_URL
    )
    paginator = s3.get_paginator("list_objects_v2")
    page_iterator = paginator.paginate(Bucket="${BUCKET_NAME}", Prefix="${ROOT_PREFIX}")
    for page in page_iterator:
        for obj in page["Contents"]:
            key = obj["Key"]
            if not key.endswith(".parquet"):
                continue
            yield f"{BUCKET_URL}/{key}"


def group_parquet_files_by_table(file_urls: Iterable[str]) -> dict[str, list[str]]:
    table_files = defaultdict(list)
    indexed_file_pattern = re.compile(r"(.+)_(\\d+)\\.parquet$")
    simple_file_pattern = re.compile(r"(.+)\\.parquet$")

    for url in file_urls:
        filename = url.split("/")[-1]
        if match_indexed := indexed_file_pattern.match(filename):
            table_name = match_indexed.group(1)
        else:
            match_simple = simple_file_pattern.match(filename)
            table_name = match_simple.group(1) if match_simple else filename
        table_files[table_name].append(url)
    return table_files


def get_tables() -> dict[str, list[str]]:
    return group_parquet_files_by_table(list_parquet_files())


def setup_views(con):
    tables = get_tables()
    for name, urls in tables.items():
        print(f"Creating view for {name}")
        con.execute(f"DROP VIEW IF EXISTS {name}")
        con.execute(f"CREATE VIEW {name} AS FROM read_parquet({urls})")


if __name__ == "__main__":
    with duckdb.connect() as con:
        setup_views(con)
        print("DuckDB is set up")
        # Put your queries here
        # e.g. con.sql("SELECT count(*) FROM heroes").show()`;

function DuckDbInstructions() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-medium">DuckLake catalog.</span> Attach the pre-built catalog and every table is ready
          to query; no listing or view setup needed.
        </p>
        <CodeBlock code={DUCKLAKE_EXAMPLE} language="python" />
      </div>
      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-medium">Raw parquet files.</span> List the bucket yourself and register one view per
          table, useful if you want full control over which files are read.
        </p>
        <CodeBlock code={DUCKDB_EXAMPLE} language="python" />
      </div>
    </div>
  );
}

const STATIC_TABS = [
  { id: "mcp", label: "MCP Server (AI assistants)", language: "bash", code: "" },
  { id: "duckdb", label: "DuckDB", language: "python", code: "" },
  { id: "aws-cli", label: "AWS CLI", language: "bash", code: AWS_CLI_EXAMPLE },
  { id: "mc", label: "MinIO Client (mc)", language: "bash", code: MC_CLI_EXAMPLE },
  { id: "python", label: "Python", language: "python", code: PYTHON_EXAMPLE },
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
            {t.id === "mcp" ? (
              <McpInstructions />
            ) : t.id === "duckdb" ? (
              <DuckDbInstructions />
            ) : (
              <CodeBlock code={t.code} language={t.language} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
