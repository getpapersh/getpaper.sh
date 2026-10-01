#!/bin/sh
# One stub for every external command the installer calls on macOS. It records argv
# to $LOG ($HOME as ~, the test's system Applications folder as /Applications, its
# TMPDIR as $TMPDIR) and fakes just enough behavior, steered by STUB_* variables.
#
# Running PaperMac copies are real detached `sleep` processes, so the installer's own
# `kill -0` and `kill -TERM` act on them; $HOME/.stub-procs lists them for `ps` as
# "UID PID EXECUTABLE" lines.
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
# One write per call: concurrent stubs must not interleave lines.
printf '%s\n' "$line" >> "$LOG"

last=
for arg in "$@"; do last=$arg; done
procs=$HOME/.stub-procs
polls=$HOME/.stub-quit-polls
me=${STUB_UID:-501}
lock=$APPS/.PaperMac-install.lock
foreign() { printf '{\n  "CFBundleIdentifier": "com.example.other"\n}\n' > "$APPS/PaperMac.app/Contents/Info.plist"; }

case "$name" in
  id) echo "$me" ;;
  uname) echo "${STUB_OS:-Darwin}" ;;
  sw_vers) echo "${STUB_MACOS:-27.0}" ;;
  curl)
    out=
    while [ $# -gt 0 ]; do
      if [ "$1" = -o ]; then out=$2; fi
      shift
    done
    case "$last" in
      *.json) [ -n "${STUB_MANIFEST:-}" ] || exit 22; cp "$STUB_MANIFEST" "$out" ;;
      *)
        [ -z "${STUB_CURL_FAILS:-}" ] || exit 22
        if [ "${STUB_DEST_FOREIGN:-}" = download ]; then foreign; fi
        # Another run's pid in this run's lock: this run must not remove it.
        if [ -n "${STUB_STEAL_LOCK:-}" ]; then echo "$STUB_STEAL_LOCK" > "$lock/pid"; fi
        echo dmg > "$out" ;;
    esac ;;
  shasum) echo "${STUB_DMG_SHA:-0}  $last" ;;
  plutil) # plutil -extract KEY raw [-expect TYPE] -o - FILE, for one-key-per-line JSON
    key=$2 expect=
    if [ "$4" = -expect ]; then expect=$5; fi
    value=$(sed -n "s/^[[:space:]]*\"$key\"[[:space:]]*:[[:space:]]*//p" "$last" 2>/dev/null |
      head -n 1 | sed 's/[[:space:]]*,[[:space:]]*$//')
    case "$value" in
      '') echo "$last: No value at that key path: $key" >&2; exit 1 ;;
      \"*\") type=string value=${value#\"} value=${value%\"} ;;
      true|false) type=bool ;;
      *[!0-9]*) echo "$last: Property List error" >&2; exit 1 ;;
      *) type=integer ;;
    esac
    if [ -n "$expect" ] && [ "$expect" != "$type" ]; then
      echo "$last: Value at [$key] expected to be $expect but is $type" >&2
      exit 1
    fi
    printf '%s\n' "$value" ;;
  ps)
    if [ "$1" = -p ]; then
      # Another run takes the stale lock over between this run's check and its takeover.
      if [ -n "${STUB_LOCK_RACE:-}" ]; then echo "$STUB_LOCK_RACE" > "$lock/pid"; exit 1; fi
      kill -0 "$2" 2>/dev/null
      exit
    fi
    [ -z "${STUB_PS_FAILS:-}" ] || exit 1
    echo "    0     1 /sbin/launchd"
    [ -f "$procs" ] || exit 0
    while read -r uid pid exe; do
      if kill -0 "$pid" 2>/dev/null; then printf '%5s %5s %s\n' "$uid" "$pid" "$exe"; fi
    done < "$procs" ;;
  osascript) # runs in the background; STUB_QUIT says how PaperMac answers
    case "${STUB_QUIT:-accept}" in
      accept) # this user's copies quit after STUB_QUIT_POLLS more polls
        if [ -n "${STUB_QUIT_SEES:-}" ]; then
          printf 'at quit: installed=%s staged=%s\n' \
            "$(cat "$APPS/PaperMac.app/Contents/version" 2>/dev/null)" \
            "$(cat "$APPS"/.PaperMac-install.*/PaperMac.app/Contents/version 2>/dev/null)" >> "$LOG"
        fi
        if [ "${STUB_DEST_FOREIGN:-}" = quit ]; then foreign; fi
        echo "${STUB_QUIT_POLLS:-0}" > "$polls" ;;
      ignore) ;;
      refuse) echo "execution error: Not authorized to send Apple events to PaperMac. (-1743)" >&2; exit 1 ;;
      hang) echo "$$" > "$HOME/.stub-osascript"; exec /bin/sleep 60 ;;
    esac ;;
  sleep)
    /bin/sleep "${STUB_SLEEP:-0.01}"
    if [ -f "$polls" ]; then
      left=$(cat "$polls")
      if [ "$left" -le 0 ]; then
        rm -f "$polls"
        while read -r uid pid exe; do
          if [ "$uid" = "$me" ]; then kill -KILL "$pid" 2>/dev/null; fi
        done < "$procs"
      else
        echo $((left - 1)) > "$polls"
      fi
    fi ;;
  hdiutil)
    case "$1" in
      attach)
        echo "hdiutil: WARNING: 'hdiutil attach' is deprecated." >&2
        [ -z "${STUB_ATTACH_FAILS:-}" ] || { echo "hdiutil: attach failed - no mountable file systems" >&2; exit 1; }
        prev=
        for arg in "$@"; do
          if [ "$prev" = -mountpoint ]; then mkdir -p "$arg/PaperMac.app/Contents"; fi
          prev=$arg
        done
        echo "/dev/disk9s1	Apple_HFS	$last" ;;
      detach)
        case "${STUB_DETACH_FAILS:-}" in
          once) if [ ! -f "$HOME/.stub-detach-failed" ]; then touch "$HOME/.stub-detach-failed"; exit 1; fi ;;
          ?*) exit 1 ;;
        esac
        rm -rf "$last/PaperMac.app" ;;
    esac ;;
  ditto)
    mkdir -p "$last/Contents"
    [ -z "${STUB_DITTO_FAILS:-}" ] || exit 1
    echo new > "$last/Contents/version"
    printf '{\n  "CFBundleIdentifier": "dev.jsonmartin.papermac"\n}\n' > "$last/Contents/Info.plist" ;;
  codesign) [ -z "${STUB_CODESIGN_FAILS:-}" ] || exit 1 ;;
  open) if [ -d "$lock" ]; then echo "at open: lock held" >> "$LOG"; fi ;;
  rm) # only in cases that link it: deleting the renamed-aside bundle fails on request
    case "${STUB_RM:-}:$last" in fail:*/.PaperMac-uninstall.*) exit 1 ;; esac
    exec /bin/rm "$@" ;;
  mv) # only in cases that link it: fails or interrupts the swap's renames on request
    if [ "$1" = "$APPS/PaperMac.app" ] && [ -f "$HOME/.stub-osascript" ]; then
      if kill -0 "$(cat "$HOME/.stub-osascript")" 2>/dev/null; then state=running; else state=gone; fi
      echo "at swap: quit request $state" >> "$LOG"
    fi
    case "${STUB_MV:-}:$1" in
      *aside*:"$APPS"/PaperMac.app) # the old app moves aside, then something else lands in its place
        /bin/mv "$@" && mkdir "$1" && exit 0 ;;
      *promote*:*/.PaperMac-install.*/PaperMac.app) echo "mv: rename failed" >&2; exit 1 ;;
      *interrupt*:*/.PaperMac-install.*/PaperMac.app) kill -TERM "$PPID"; exit 1 ;;
      *restore*:*/previous.app) echo "mv: rename failed" >&2; exit 1 ;;
    esac
    exec /bin/mv "$@" ;;
esac
exit 0
