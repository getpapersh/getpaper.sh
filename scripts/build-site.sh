#!/bin/sh
# Builds the deployable site/ from its committed sources: install (served at /install,
# with the Paperland installer from paperland/ inlined by scripts/assemble-install.sh),
# index.html and _headers (Cloudflare's response headers). site/ is committed too, so a
# deployed file always maps to a commit. wrangler.jsonc deploys site/; the build checks
# that it still points there.
# Usage: scripts/build-site.sh [OUT_DIR]   (OUT_DIR for a preview or test build)
set -eu

die() { printf 'build-site: %s\n' "$*" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$root/site}
sources="install index.html _headers wrangler.jsonc scripts/assemble-install.sh paperland/install paperland/uninstall paperland/build.sh paperland/release.env"

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
paperland=$(mktemp -d "${TMPDIR:-/tmp}/build-site.XXXXXX")
trap 'rm -rf "$paperland"' EXIT
sh "$root/paperland/build.sh" "$root/paperland/release.env" "$paperland" >/dev/null
sh "$root/scripts/assemble-install.sh" "$root/install" "$paperland" "$paperland/served-install"
for file in install index.html _headers; do
  if [ "$file" = install ]; then cp "$paperland/served-install" "$out/$file.tmp"; else cp "$root/$file" "$out/$file.tmp"; fi
  chmod 644 "$out/$file.tmp"
  mv "$out/$file.tmp" "$out/$file"
done
echo "Built $out/install, $out/index.html and $out/_headers"
