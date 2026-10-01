#!/bin/sh
# One stub for every external command the installer calls on macOS. It records argv
# to $LOG ($HOME as ~, the test's system Applications folder as /Applications, its
# TMPDIR as $TMPDIR) and fakes just enough behavior, steered by STUB_* variables.
name=${0##*/}

line=$name
for arg in "$@"; do
  case "$arg" in
    "$HOME"/*) arg="~${arg#"$HOME"}" ;;
    "$APPS"/*) arg="/Applications${arg#"$APPS"}" ;;
    "$TMPDIR"/*) arg="\$TMPDIR/${arg#"$TMPDIR"/}" ;;
  esac
  line="$line [$arg]"
done
# One write per call: concurrent stubs in a pipeline must not interleave lines.
printf '%s\n' "$line" >> "$LOG"

last=
for arg in "$@"; do last=$arg; done
running=$HOME/.stub-running
polls=$HOME/.stub-quit-polls

case "$name" in
  id) echo "${STUB_UID:-501}" ;;
  uname) echo "${STUB_OS:-Darwin}" ;;
  sw_vers) echo "${STUB_MACOS:-27.0}" ;;
  curl)
    [ -z "${STUB_CURL_FAILS:-}" ] || exit 22
    while [ $# -gt 0 ]; do
      if [ "$1" = -o ]; then echo dmg > "$2"; fi
      shift
    done ;;
  shasum) echo "${STUB_DMG_SHA:-0}  $last" ;;
  pgrep) # running until osascript asked it to quit and STUB_QUIT_POLLS polls passed
    [ -f "$running" ] || exit 1
    [ -f "$polls" ] || exit 0
    left=$(cat "$polls")
    if [ "$left" -le 0 ]; then rm -f "$running" "$polls"; exit 1; fi
    echo $((left - 1)) > "$polls" ;;
  osascript) [ -n "${STUB_QUIT_HANGS:-}" ] || echo "${STUB_QUIT_POLLS:-0}" > "$polls" ;;
  sleep) ;;
  hdiutil)
    case "$1" in
      attach)
        prev=
        for arg in "$@"; do
          if [ "$prev" = -mountpoint ]; then mkdir -p "$arg/PaperMac.app/Contents"; fi
          prev=$arg
        done ;;
      detach) [ -z "${STUB_DETACH_FAILS:-}" ] || exit 1; rm -rf "$last/PaperMac.app" ;;
    esac ;;
  ditto)
    mkdir -p "$last/Contents"
    [ -z "${STUB_DITTO_FAILS:-}" ] || exit 1
    echo new > "$last/Contents/version" ;;
  codesign) [ -z "${STUB_CODESIGN_FAILS:-}" ] || exit 1 ;;
  open) ;;
esac
exit 0
