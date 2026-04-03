#!/usr/bin/env python3
"""
Load a 10% sample of ClickHouse data from public S3 parquet dumps into the local instance.

Source: https://s3-cache.deadlock-api.com/db-snapshot/public/
Files: {table_name}.parquet or {table_name}_{index}.parquet (split tables)
"""

import os
import re
import subprocess
import tempfile
from collections import defaultdict

import boto3
import duckdb
from botocore import UNSIGNED
from botocore.config import Config

S3_URL = "https://s3-cache.deadlock-api.com"
BUCKET = "db-snapshot"
PREFIX = "public/"
SAMPLE_PERCENT = 10

CH_HOST = os.environ.get("CLICKHOUSE_HOST", "clickhouse")
CH_USER = os.environ.get("CLICKHOUSE_USERNAME", "default")
CH_PASS = os.environ.get("CLICKHOUSE_PASSWORD", "ijojdmkasd")
CH_DB = os.environ.get("CLICKHOUSE_DBNAME", "default")


def list_parquet_files():
    """List all parquet file URLs from the S3 bucket."""
    s3 = boto3.client(
        "s3", config=Config(signature_version=UNSIGNED), endpoint_url=S3_URL
    )
    paginator = s3.get_paginator("list_objects_v2")
    page_iterator = paginator.paginate(Bucket=BUCKET, Prefix=PREFIX)

    urls = []
    for page in page_iterator:
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith(".parquet"):
                urls.append(f"{S3_URL}/{BUCKET}/{key}")
    return urls


def group_by_table(file_urls):
    """Group parquet URLs by table name."""
    table_files = defaultdict(list)
    indexed_pattern = re.compile(r"(.+)_(\d+)\.parquet$")
    simple_pattern = re.compile(r"(.+)\.parquet$")

    for url in file_urls:
        filename = url.split("/")[-1]
        match = indexed_pattern.match(filename)
        if match:
            table_name = match.group(1)
        else:
            match = simple_pattern.match(filename)
            table_name = match.group(1) if match else filename
        table_files[table_name].append(url)

    return dict(table_files)


def load_table(table_name, urls):
    """Download parquet files, sample 10%, and load into ClickHouse."""
    print(f"  Processing {table_name} ({len(urls)} file(s))...")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Use DuckDB to read directly from URLs (httpfs), sample, and export
        sampled_path = os.path.join(tmpdir, f"{table_name}_sampled.parquet")
        file_list = ", ".join(f"'{u}'" for u in urls)

        con = duckdb.connect()
        con.execute("INSTALL httpfs; LOAD httpfs;")

        # Get total row count
        total = con.execute(
            f"SELECT count(*) FROM read_parquet([{file_list}])"
        ).fetchone()[0]

        if total == 0:
            print(f"    {table_name}: empty, skipping")
            con.close()
            return

        # Sample and export to local parquet
        con.execute(
            f"""
            COPY (
                SELECT * FROM read_parquet([{file_list}])
                USING SAMPLE {SAMPLE_PERCENT} PERCENT (bernoulli)
            ) TO '{sampled_path}' (FORMAT PARQUET)
            """
        )

        sampled = con.execute(
            f"SELECT count(*) FROM read_parquet('{sampled_path}')"
        ).fetchone()[0]
        con.close()

        print(f"    Sampled {sampled:,}/{total:,} rows ({SAMPLE_PERCENT}%)")

        # Load into ClickHouse
        cmd = [
            "clickhouse-client",
            "--host", CH_HOST,
            "--user", CH_USER,
            "--password", CH_PASS,
            "--database", CH_DB,
            "--query", f"INSERT INTO {table_name} FORMAT Parquet",
        ]

        with open(sampled_path, "rb") as f:
            result = subprocess.run(cmd, stdin=f, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"    WARNING: Failed to load {table_name}: {result.stderr.strip()}")
        else:
            print(f"    Loaded {table_name} successfully")


def main():
    print("Discovering parquet files from S3...")
    urls = list_parquet_files()
    tables = group_by_table(urls)
    print(f"Found {len(urls)} files across {len(tables)} tables: {', '.join(sorted(tables.keys()))}")
    print()

    for table_name in sorted(tables.keys()):
        try:
            load_table(table_name, tables[table_name])
        except Exception as e:
            print(f"    ERROR processing {table_name}: {e}")

    print()
    print("Sample data loading complete!")


if __name__ == "__main__":
    main()
