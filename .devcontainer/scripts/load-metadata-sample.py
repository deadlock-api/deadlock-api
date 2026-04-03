#!/usr/bin/env python3
"""
Download match metadata samples from the public S3 and upload them to the local rustfs.

Source: https://s3-cache.deadlock-api.com/metadata-sample/processed/metadata/
Destination: local rustfs "test" bucket at processed/metadata/

The API fetches metadata from S3 at:
  - s3 (primary):  processed/metadata/{match_id}.meta.bz2
  - s3_cache:      {match_id}.meta.bz2 (root level)
"""

import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore import UNSIGNED
from botocore.config import Config

SOURCE_URL = "https://s3-cache.deadlock-api.com"
SOURCE_BUCKET = "metadata-sample"
SOURCE_PREFIX = "processed/metadata/"

LOCAL_URL = os.environ.get("S3_ENDPOINT", "http://rustfs:9000")
LOCAL_BUCKET = os.environ.get("S3_BUCKET", "test")
LOCAL_KEY = os.environ.get("S3_ACCESS_KEY_ID", "devcontainer-access-key")
LOCAL_SECRET = os.environ.get("S3_SECRET_ACCESS_KEY", "devcontainer-secret-key-at-least-32-chars")

MAX_WORKERS = 10


def main():
    source = boto3.client(
        "s3",
        config=Config(signature_version=UNSIGNED),
        endpoint_url=SOURCE_URL,
    )

    dest = boto3.client(
        "s3",
        endpoint_url=LOCAL_URL,
        aws_access_key_id=LOCAL_KEY,
        aws_secret_access_key=LOCAL_SECRET,
        region_name="us-east-1",
    )

    # List all metadata files
    keys = []
    paginator = source.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=SOURCE_BUCKET, Prefix=SOURCE_PREFIX):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])

    print(f"Found {len(keys)} metadata files to sync")

    def sync_file(key):
        """Download from source and upload to local rustfs."""
        data = source.get_object(Bucket=SOURCE_BUCKET, Key=key)["Body"].read()
        dest.put_object(Bucket=LOCAL_BUCKET, Key=key, Body=data)
        return key

    uploaded = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(sync_file, key): key for key in keys}
        for future in as_completed(futures):
            try:
                future.result()
                uploaded += 1
            except Exception as e:
                failed += 1
                print(f"  Failed: {futures[future]}: {e}")

            if uploaded % 20 == 0 and uploaded > 0:
                print(f"  Progress: {uploaded}/{len(keys)} files uploaded")

    print(f"Done: {uploaded} uploaded, {failed} failed")


if __name__ == "__main__":
    main()
