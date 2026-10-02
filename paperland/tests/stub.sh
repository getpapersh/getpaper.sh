#!/bin/sh
# One stub for every external command the installers call. It records argv to $LOG
# (with $HOME shown as ~, and git's -c options left out) and fakes just enough
# behavior, steered by STUB_* variables.
name=${0##*/}
case "$0" in "$HOME"/*) shown="~${0#"$HOME"}" ;; *) shown=$name ;; esac

if [ "$name" = git ]; then
  # The installers must run git isolated; record any call that is not.
  case " $* " in
    *" core.hooksPath=/dev/null "*" core.attributesFile=/dev/null "*" http.sslVerify=true "*" protocol.allow=never "*" protocol.https.allow=always "*) ;;
    *) echo "UNSAFE GIT (flags): $*" >> "$LOG" ;;
  esac
  # Only the installers' own GIT_* settings may reach git.
  extra=$(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p' |
    grep -Evx 'GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_NO_REPLACE_OBJECTS|GIT_TERMINAL_PROMPT')
  if [ "${GIT_CONFIG_GLOBAL:-}" != /dev/null ] || [ "${GIT_CONFIG_NOSYSTEM:-}" != 1 ] ||
     [ "${GIT_NO_REPLACE_OBJECTS:-}" != 1 ] || [ -n "$extra" ]; then
    echo "UNSAFE GIT (environment): $extra $*" >> "$LOG"
  fi
  while [ "${1:-}" = -c ]; do shift 2; done
fi

# One write per call: concurrent stubs in a pipeline must not interleave lines.
line=$shown
for arg in "$@"; do
  case "$arg" in "$HOME"/*) arg="~${arg#"$HOME"}" ;; esac
  line="$line [$arg]"
done
printf '%s\n' "$line" >> "$LOG"

plugin=$HOME/.config/omarchy/plugins/json.paperland
runtime=$HOME/.local/share/paperland
enabled=$HOME/.stub-enabled
last=
for arg in "$@"; do last=$arg; done

case "$name" in
  id) echo "${STUB_UID:-1000}" ;;
  uname) echo "${STUB_OS:-Linux}" ;;
  omarchy-version) echo "${STUB_OMARCHY:-4.0.4-1}" ;;
  Hyprland) echo "Hyprland ${STUB_HYPR:-0.56.2} built from branch v0.56.2 at commit 0 clean" ;;
  hyprctl)
    case "$1" in
      version) echo "Hyprland ${STUB_HYPR:-0.56.2} built from branch v0.56.2 at commit 0 clean" ;;
      -j) echo '[]' ;;
      repl) sed -n 's/^_G.paperland_setup_revision = "\([a-f0-9]*\)"$/\1/p' "$HOME/.config/hypr/paperland.lua" 2>/dev/null ;;
    esac ;;
  git)
    dir=
    if [ "$1" = -C ]; then dir=$2; shift 2; fi
    while [ "${1:-}" = -c ]; do shift 2; done
    case "$1" in
      config) echo "${STUB_ORIGIN:-}" ;;
      clone) # a release tree shaped by STUB_MANIFEST_ID and STUB_SYMLINK
        [ -z "${STUB_CLONE_FAILS:-}" ] || exit 128
        mkdir -p "$last/.git" "$last/paperland"
        printf '{"id": "%s"}\n' "${STUB_MANIFEST_ID:-json.paperland}" > "$last/manifest.json"
        echo "Widget" > "$last/Widget.qml"
        cp "$STUB" "$last/paperland/paperland"
        # The committed tree: cksum stands in for blob ids.
        for f in manifest.json Widget.qml paperland/paperland; do
          printf '100644 blob %s\t%s\n' "$(cksum < "$last/$f" | sed 's/ .*//')" "$f"
        done > "$last/.git/stub-tree"
        if [ -n "${STUB_SYMLINK:-}" ]; then ln -s /etc/passwd "$last/paperland/link"; fi ;;
      checkout)
        [ -z "${STUB_PIN_MISSING:-}" ] || exit 1
        # A checkout that writes other bytes (a smudge filter) or an extra file.
        if [ -n "${STUB_SMUDGE:-}" ]; then echo "smudged" >> "$dir/Widget.qml"; fi
        if [ -n "${STUB_STAGE_DIRTY:-}" ]; then touch "$dir/extra.qml"; fi
        echo "${STUB_CHECKOUT_HEAD:-$last}" > "$dir/.git/stub-head" ;;
      rev-parse) if [ -f "$dir/.git/stub-head" ]; then cat "$dir/.git/stub-head"; else echo "${STUB_HEAD:-}"; fi ;;
      ls-tree) cat "$dir/.git/stub-tree" ;;
      hash-object) while read -r f; do cksum < "$dir/$f" | sed 's/ .*//'; done ;;
      merge-base) [ -n "${STUB_OLD_NEWER:-}" ] || exit 1 ;;
    esac ;;
  omarchy-plugin-validate) exit "${STUB_VALIDATE_STATUS:-0}" ;;
  omarchy-shell)
    case "$*" in
      "shell listPlugins") [ -z "${STUB_SHELL_DOWN:-}" ] || exit 1 ;;
    esac ;;
  omarchy-plugin-list)
    if [ -d "$plugin" ]; then
      if [ -f "$enabled" ]; then state=true; else state=false; fi
      echo "[{\"id\":\"json.paperland\",\"enabled\":$state}]"
    else
      echo '[]'
    fi ;;
  sw_vers) echo "${STUB_MACOS:-27.0}" ;;
  shasum) echo "${STUB_DMG_SHA:-0}  $last" ;;
  curl)
    while [ $# -gt 0 ]; do
      if [ "$1" = -o ]; then echo dmg > "$2"; fi
      shift
    done ;;
  hdiutil)
    case "$1" in
      attach)
        prev=
        for arg in "$@"; do
          if [ "$prev" = -mountpoint ]; then mkdir -p "$arg/PaperMac.app"; fi
          prev=$arg
        done ;;
      detach) [ -z "${STUB_DETACH_FAILS:-}" ] || exit 1; rm -rf "$last/PaperMac.app" ;;
    esac ;;
  ditto)
    mkdir -p "$last/Contents"
    [ -z "${STUB_DITTO_FAILS:-}" ] || exit 1 ;;
  omarchy)
    case "$1 $2" in
      "plugin enable") touch "$enabled" ;;
      "plugin remove") rm -rf "$plugin" "$enabled" ;;
    esac ;;
  paperland)
    case "$1" in
      install)
        [ -z "${STUB_RUNTIME_FAILS:-}" ] || exit 1
        mkdir -p "$runtime" "$HOME/.local/bin"
        ln -sf "$STUB" "$runtime/paperland"
        echo "Paperland CLI installation v1" > "$runtime/.installed-by-paperland"
        ln -sf "$runtime/paperland" "$HOME/.local/bin/paperland" ;;
      setup) exit "${STUB_SETUP_STATUS:-0}" ;;
      uninstall)
        rm -f "$HOME/.local/bin/paperland"
        rm -rf "$runtime" "$HOME/.config/hypr/paperland.lua"
        main=$HOME/.config/hypr/hyprland.lua
        if [ -f "$main" ]; then grep -v 'Paperland setup' "$main" > "$main.tmp"; mv "$main.tmp" "$main"; fi ;;
    esac ;;
esac
exit 0
