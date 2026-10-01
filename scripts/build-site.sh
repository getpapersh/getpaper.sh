#!/bin/sh
# Builds the deployable site/ from its committed sources: install (served at /install)
# and index.html. site/ is committed too, so a deployed file always maps to a commit.
# Usage: scripts/build-site.sh [OUT_DIR]   (OUT_DIR for a preview or test build)
set -eu

die() { printf 'build-site: %s\n' "$*" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$root/site}

if [ "$out" = "$root/site" ]; then
  for source in install index.html; do
    git -C "$root" ls-files --error-unmatch "$source" >/dev/null 2>&1 ||
      die "$source is not committed; commit it first so site/ maps to a commit"
  done
  [ -z "$(git -C "$root" status --porcelain -- install index.html)" ] ||
    die "install or index.html has uncommitted changes; commit them first so site/ maps to a commit"
fi
sh -n "$root/install" || die "install has a syntax error"

mkdir -p "$out"
cp "$root/install" "$out/install.tmp"
chmod 644 "$out/install.tmp"
mv "$out/install.tmp" "$out/install"
cp "$root/index.html" "$out/index.html.tmp"
mv "$out/index.html.tmp" "$out/index.html"
echo "Built $out/install and $out/index.html"
