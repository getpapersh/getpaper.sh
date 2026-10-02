#!/bin/sh
# Builds the Paperland installer: install and uninstall with release.env inlined.
# scripts/build-site.sh calls it and inlines the result into the served /install.
# Usage: build.sh RELEASE_ENV OUT_DIR
set -eu

die() { printf 'build: %s\n' "$*" >&2; exit 1; }

root=$(cd "$(dirname "$0")" && pwd)
[ $# -eq 2 ] || die "usage: build.sh RELEASE_ENV OUT_DIR"
env_file=$1
out=$2
KEYS="PLUGIN_URL PLUGIN_SHA MIN_HYPRLAND"

# Inlined into scripts that run as the user: only the known keys, each once, as bare words.
lines=$(grep -Ev '^[[:space:]]*(#.*)?$' "$env_file")
bad=$(printf '%s\n' "$lines" | grep -Ev '^[A-Z][A-Z0-9_]*=[A-Za-z0-9._:/+-]*$' || true)
[ -z "$bad" ] || die "unsafe line in $env_file: $bad"
for key in $(printf '%s\n' "$lines" | sed 's/=.*//'); do
  case " $KEYS " in *" $key "*) ;; *) die "unknown key in $env_file: $key" ;; esac
done
for key in $KEYS; do
  [ "$(printf '%s\n' "$lines" | grep -c "^$key=")" = 1 ] || die "$env_file must set $key exactly once"
done

mkdir -p "$out"
# The uninstaller needs only the plugin URL.
for script in install uninstall; do
  [ "$(grep -c '^# @RELEASE_ENV@$' "$root/$script")" = 1 ] || die "$script needs exactly one # @RELEASE_ENV@ line"
  if [ "$script" = install ]; then keep='^[A-Z]'; else keep='^PLUGIN_URL='; fi
  awk -v env_file="$env_file" -v keep="$keep" '
    $0 == "# @RELEASE_ENV@" {
      while ((getline line < env_file) > 0) if (line ~ keep) print line
      next
    }
    { print }
  ' "$root/$script" > "$out/$script"
  chmod 755 "$out/$script"
done
