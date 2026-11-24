#!/bin/sh
# Installs a pinned, checksum-verified sccache release into /usr/local/bin for the Rust image builds.
# See with-sccache.sh for how the builds use it.
set -eu

version=0.20.0
arch=$(uname -m)
case "$arch" in
    x86_64) sha256=c3c5db9cd7e3be12b7bab350d8fe8ae7dcfb7269d5432b269e0dffa1a87c6ed2 ;;
    aarch64) sha256=1bd78037804baeb9655f6baf8791f99c43388fae6d6b16944d3d93542fa5711a ;;
    *) echo "install-sccache: no sccache build for $arch" >&2; exit 1 ;;
esac

name="sccache-v${version}-${arch}-unknown-linux-musl"
curl -fsSL -o /tmp/sccache.tar.gz "https://github.com/mozilla/sccache/releases/download/v${version}/${name}.tar.gz"
echo "${sha256}  /tmp/sccache.tar.gz" | sha256sum -c -
tar -xzf /tmp/sccache.tar.gz -C /usr/local/bin --strip-components=1 "${name}/sccache"
rm /tmp/sccache.tar.gz
sccache --version
