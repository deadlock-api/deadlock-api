#!/bin/sh
# Installs a pinned, checksum-verified sccache release into /usr/local/bin for the Rust image builds.
# See with-sccache.sh for how the builds use it.
set -eu

version=0.19.0
arch=$(uname -m)
case "$arch" in
    x86_64) sha256=aa73c7270c997894038c0d8f0d297865f57569e1687883322bc431713d4bb9dd ;;
    aarch64) sha256=3e47fc4a71b1ddd1b4294a0de9d34498922fdf41e3cd0bda5df3954e3d6deb9d ;;
    *) echo "install-sccache: no sccache build for $arch" >&2; exit 1 ;;
esac

name="sccache-v${version}-${arch}-unknown-linux-musl"
curl -fsSL -o /tmp/sccache.tar.gz "https://github.com/mozilla/sccache/releases/download/v${version}/${name}.tar.gz"
echo "${sha256}  /tmp/sccache.tar.gz" | sha256sum -c -
tar -xzf /tmp/sccache.tar.gz -C /usr/local/bin --strip-components=1 "${name}/sccache"
rm /tmp/sccache.tar.gz
sccache --version
