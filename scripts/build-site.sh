#!/bin/sh
# Builds the deployable site/ from its committed sources: install (served at /install),
# index.html and _headers (Cloudflare's response headers). site/ is committed too, so a
# deployed file always maps to a commit. wrangler.jsonc deploys site/; the build checks
# that it still points there.
# Usage: scripts/build-site.sh [OUT_DIR]   (OUT_DIR for a preview or test build)
set -eu

die() { printf 'build-site: %s\n' "$*" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$root/site}
sources="install index.html _headers wrangler.jsonc"

if [ "$out" = "$root/site" ]; then
  for source in $sources; do
    git -C "$root" ls-files --error-unmatch "$source" >/dev/null 2>&1 ||
      die "$source is not committed; commit it first so site/ maps to a commit"
  done
  # shellcheck disable=SC2086 # sources are plain file names
  [ -z "$(git -C "$root" status --porcelain -- $sources)" ] ||
    die "a source ($sources) has uncommitted changes; commit it first so site/ maps to a commit"
fi
sh -n "$root/install" || die "install has a syntax error"
grep -qF '"directory": "./site"' "$root/wrangler.jsonc" || die "wrangler.jsonc must deploy ./site"

mkdir -p "$out"
for file in install index.html _headers; do
  cp "$root/$file" "$out/$file.tmp"
  chmod 644 "$out/$file.tmp"
  mv "$out/$file.tmp" "$out/$file"
done
echo "Built $out/install, $out/index.html and $out/_headers"
