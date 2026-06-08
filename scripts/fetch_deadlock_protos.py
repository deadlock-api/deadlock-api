#!/usr/bin/env python3
"""Fetch Deadlock protobuf definitions into the local cache for inspection."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_REPO = "SteamDatabase/Protobufs"
DEFAULT_REF = "master"
DEFAULT_SOURCE_DIR = "deadlock"
DEFAULT_OUTPUT = Path(".cache/deadlock-protos")
DEFAULT_USER_AGENT = "deadlock-api-proto-fetcher"
SYNTAX_RE = re.compile(r"^\s*syntax\s*=", re.MULTILINE)


def request_text(url: str, token: str | None = None) -> str:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": DEFAULT_USER_AGENT,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            charset = res.headers.get_content_charset() or "utf-8"
            return res.read().decode(charset)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"HTTP {exc.code} while fetching {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Failed to fetch {url}: {exc.reason}") from exc


def github_api_url(repo: str, path: str) -> str:
    return f"https://api.github.com/repos/{repo}/{path}"


def raw_github_url(repo: str, ref: str, path: str) -> str:
    quoted_path = urllib.parse.quote(path)
    quoted_ref = urllib.parse.quote(ref, safe="")
    return f"https://raw.githubusercontent.com/{repo}/{quoted_ref}/{quoted_path}"


def list_proto_paths(repo: str, ref: str, source_dir: str, token: str | None) -> list[str]:
    tree_url = github_api_url(repo, f"git/trees/{urllib.parse.quote(ref, safe='')}?recursive=1")
    data = json.loads(request_text(tree_url, token))
    prefix = source_dir.strip("/") + "/"
    paths = [
        item["path"]
        for item in data.get("tree", [])
        if item.get("type") == "blob"
        and item.get("path", "").startswith(prefix)
        and item.get("path", "").endswith(".proto")
    ]
    if not paths:
        raise SystemExit(f"No .proto files found in {repo}:{ref}/{source_dir}")
    return sorted(paths)


def ensure_proto_syntax(body: str) -> str:
    if SYNTAX_RE.search(body):
        return body
    return f'syntax = "proto2";\n\n{body}'


def write_manifest(
    output: Path,
    repo: str,
    ref: str,
    source_dir: str,
    proto_paths: list[str],
) -> None:
    manifest: dict[str, Any] = {
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "repo": repo,
        "ref": ref,
        "source_dir": source_dir,
        "file_count": len(proto_paths),
        "files": proto_paths,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch SteamDatabase Deadlock .proto files into .cache for local inspection.",
    )
    parser.add_argument(
        "--repo",
        default=DEFAULT_REPO,
        help=f"GitHub owner/repo to fetch from (default: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "--ref",
        default=DEFAULT_REF,
        help=f"Git ref, branch, or tag to fetch (default: {DEFAULT_REF})",
    )
    parser.add_argument(
        "--source-dir",
        default=DEFAULT_SOURCE_DIR,
        help=f"Repository directory containing protos (default: {DEFAULT_SOURCE_DIR})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Local output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN"),
        help="GitHub token for API rate limits (default: GITHUB_TOKEN env var)",
    )
    parser.add_argument(
        "--no-syntax-fix",
        action="store_true",
        help='Do not prepend syntax = "proto2"; to files missing a syntax declaration.',
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output
    proto_paths = list_proto_paths(args.repo, args.ref, args.source_dir, args.token)

    output.mkdir(parents=True, exist_ok=True)
    for proto_path in proto_paths:
        rel_path = Path(proto_path).relative_to(args.source_dir.strip("/"))
        local_path = output / rel_path
        local_path.parent.mkdir(parents=True, exist_ok=True)

        url = raw_github_url(args.repo, args.ref, proto_path)
        print(f"fetching {url} -> {local_path}", file=sys.stderr)
        body = request_text(url, args.token)
        if not args.no_syntax_fix:
            body = ensure_proto_syntax(body)
        local_path.write_text(body, encoding="utf-8")

    write_manifest(output, args.repo, args.ref, args.source_dir, proto_paths)
    print(f"fetched {len(proto_paths)} protos into {output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
