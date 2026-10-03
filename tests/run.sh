#!/bin/sh
# Tests for the served installer: each case pipes it into sh, the way `curl | sh`
# does, with a throwaway HOME and stub commands on a PATH that holds nothing else
# but basic tools. The script's SYSTEM_APPLICATIONS line is pointed at a folder
# inside the test, so no case can touch the real /Applications. Cases run the built
# installer (install with the Paperland installer inlined), as served; the Paperland
# half has its own suite in paperland/tests.
#
#   sh tests/run.sh               all cases
#   TEST_SH=dash sh tests/run.sh  the same, with dash running the installer
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/getpaper-tests.XXXXXX")" && pwd -P)
# Running-PaperMac stand-ins are detached sleeps; kill whatever is left of them.
finish() {
  while read -r pid; do kill -KILL "$pid" 2>/dev/null; done < "$work/pids"
  chmod -R u+w "$work" 2>/dev/null
  rm -rf "$work"
}
trap finish EXIT
: > "$work/pids"
pass=0
failed=0
SHA=$(sed -n 's/^PAPERMAC_DMG_SHA256=//p' "$root/install")
URL=$(sed -n 's/^PAPERMAC_DMG_URL=//p' "$root/install")
MANIFEST_URL=https://dl.getpaper.sh/papermac/latest.json
M_URL=https://dl.getpaper.sh/papermac/PaperMac-27.0.0-alpha.4.dmg
M_SHA=1111111111111111111111111111111111111111111111111111111111111111
STUBS="id uname sw_vers curl shasum plutil ps osascript sleep hdiutil ditto codesign open"

tools=$work/tools
mkdir -p "$tools"
for tool in env sed grep awk mkdir mv rm rmdir mktemp cat cp ln touch chmod head find pkill; do
  ln -s "$(command -v "$tool")" "$tools/$tool"
done
ln -s "$(command -v "${TEST_SH:-sh}")" "$tools/sh"
# The served file: a preview build of the working tree.
sh "$root/scripts/build-site.sh" "$work/built" > /dev/null || { echo "build-site.sh failed"; exit 1; }

new_case() { # NAME [EXTRA_STUB...]: fresh HOME, system Applications folder, stubs, log
  case_dir=$work/cases/$1
  shift
  home=$case_dir/home
  apps=$case_dir/Applications
  bin=$case_dir/bin
  mkdir -p "$home" "$apps" "$bin" "$case_dir/tmp"
  : > "$case_dir/log"
  for stub in $STUBS "$@"; do ln -s "$root/tests/stub.sh" "$bin/$stub"; done
  # Every case starts in pin mode, whatever the shipped default; manifest_mode switches it.
  sed -e "s|^SYSTEM_APPLICATIONS=/Applications\$|SYSTEM_APPLICATIONS=$apps|" \
    -e 's|^PAPERMAC_MANIFEST_URL=.*$|PAPERMAC_MANIFEST_URL=|' "$work/built/install" > "$case_dir/install"
}

manifest_mode() { # [KEY JSON_VALUE]...: switch the case's script to the manifest, and write one
  sed "s|^PAPERMAC_MANIFEST_URL=\$|PAPERMAC_MANIFEST_URL=$MANIFEST_URL|" "$case_dir/install" > "$case_dir/install.m"
  mv "$case_dir/install.m" "$case_dir/install"
  if [ "${1:-}" = raw ]; then printf '%s\n' "$2" > "$case_dir/latest.json"; return; fi
  # The fields are named variables, overridden and read back through eval.
  # shellcheck disable=SC2034,SC2154
  version='"27.0.0-alpha.4"' build=412 dmg_url="\"$M_URL\"" sha256="\"$M_SHA\"" min_macos='"27"' notarized=false
  while [ $# -gt 0 ]; do eval "$1=\$2"; shift 2; done
  {
    echo '{'
    for key in version build dmg_url sha256 min_macos notarized; do
      eval "value=\$$key"
      # shellcheck disable=SC2154 # set by the eval above
      if [ "$value" != - ]; then printf '  "%s": %s,\n' "$key" "$value"; fi
    done
    echo '  "end": 0'
    echo '}'
  } > "$case_dir/latest.json"
}

run() { # [ARG...] [-- VAR=value...]: run the installer with ARGs, the environment extended by VARs
  args=
  while [ $# -gt 0 ] && [ "$1" != -- ]; do args="$args $1"; shift; done
  if [ $# -gt 0 ]; then shift; fi
  # shellcheck disable=SC2086 # args are simple words
  env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" \
    STUB_DMG_SHA="$SHA" STUB_MANIFEST="$case_dir/latest.json" "$@" \
    sh -s -- $args < "$case_dir/install" > "$case_dir/out" 2>&1
  echo $? > "$case_dir/status"
}

check() { # DESCRIPTION COMMAND...
  desc=$1
  shift
  if "$@"; then
    pass=$((pass + 1))
  else
    failed=$((failed + 1))
    printf 'FAIL [%s] %s\n--- output\n%s\n--- calls\n%s\n' "${case_dir##*/}" "$desc" \
      "$(cat "$case_dir/out" 2>/dev/null)" "$(cat "$case_dir/log" 2>/dev/null)"
  fi
}
fails() { ! "$@" 2>/dev/null; }
status() { [ "$(cat "$case_dir/status")" = "$1" ]; }
says() { grep -qF -- "$1" "$case_dir/out"; }
silent() { ! says "$1"; }
called() { grep -qF -- "$1" "$case_dir/log"; }
not_called() { ! called "$1"; }
calls() { # EXPECTED: the calls after the version checks, one per line, random names as X
  grep -Ev '^(id|uname|sw_vers|sleep)( |$)' "$case_dir/log" |
    sed -e 's/papermac\.[A-Za-z0-9]*/papermac.X/g' -e 's/\.PaperMac-install\.[A-Za-z0-9]*/.PaperMac-install.X/g' \
    > "$case_dir/calls"
  printf '%s\n' "$1" | diff -u - "$case_dir/calls" >&2
}
app_is() { [ "$(cat "$1/Contents/version" 2>/dev/null)" = "$2" ]; }
no_staging() { [ -z "$(find "$apps" "$home" -name '.PaperMac-*' 2>/dev/null)" ]; }
tmp_empty() { [ -z "$(ls -A "$case_dir/tmp")" ]; }
existing() { # DIR: an installed older PaperMac
  mkdir -p "$1/PaperMac.app/Contents"
  echo old > "$1/PaperMac.app/Contents/version"
  printf '{\n  "CFBundleIdentifier": "dev.jsonmartin.papermac"\n}\n' > "$1/PaperMac.app/Contents/Info.plist"
}
sleeper() { # [ignore-term]: a detached process; sets PID
  if [ "${1:-}" = ignore-term ]; then
    PID=$(sh -c 'trap "" TERM; /bin/sleep 120 </dev/null >/dev/null 2>&1 & echo $!')
  else
    PID=$(sh -c '/bin/sleep 120 </dev/null >/dev/null 2>&1 & echo $!')
  fi
  echo "$PID" >> "$work/pids"
}
running() { # UID BUNDLE [ignore-term]: a running PaperMac stand-in; sets PID
  sleeper "${3:-}"
  echo "$1 $PID $2/Contents/MacOS/PaperMac" >> "$home/.stub-procs"
}
exists() { [ -e "$1" ] || [ -L "$1" ]; }
alive() { kill -0 "$1" 2>/dev/null; }
dead() { ! alive "$1"; }

DMG="\$TMPDIR/papermac.X/PaperMac.dmg"
MNT="\$TMPDIR/papermac.X/mnt"
STAGED="/Applications/.PaperMac-install.X/PaperMac.app"
CURL="curl [-fsSL] [--proto] [=https] [--tlsv1.2] [-o]"
ID_CHECK="plutil [-extract] [CFBundleIdentifier] [raw] [-o] [-] [/Applications/PaperMac.app/Contents/Info.plist]"
QUIT="osascript [-e] [quit app id \"dev.jsonmartin.papermac\"]"

# --- install --------------------------------------------------------------------

new_case fresh
run
check "install succeeds" status 0
check "install says what and where" says "Installing PaperMac 27.0.0-alpha.3 (not notarized)."
check "install names the destination" says "Installing to $apps/PaperMac.app"
check "install runs the steps in order" calls "$CURL [$DMG] [$URL]
shasum [-a] [256] [$DMG]
hdiutil [attach] [-nobrowse] [-readonly] [-mountpoint] [$MNT] [$DMG]
ditto [$MNT/PaperMac.app] [$STAGED]
codesign [--verify] [--deep] [--strict] [$STAGED]
ps [-axo] [uid=,pid=,comm=]
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]
at open: lock held"
check "install holds its lock until PaperMac is opened" called "at open: lock held"
check "install puts the app in /Applications" app_is "$apps/PaperMac.app" new
check "install hides hdiutil's deprecation warning" silent "deprecated"
check "install leaves no private copy or lock" no_staging
check "install removes the download" tmp_empty

new_case upgrade-while-running
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
running 502 "/Users/other/Applications/PaperMac.app"
other=$PID
run -- STUB_QUIT_POLLS=2 STUB_QUIT_SEES=1
check "upgrade succeeds" status 0
check "upgrade says it replaces" says "Replacing the PaperMac at $apps/PaperMac.app"
check "upgrade quits PaperMac only after the new copy is ready, right before the swap" calls "$ID_CHECK
$CURL [$DMG] [$URL]
shasum [-a] [256] [$DMG]
hdiutil [attach] [-nobrowse] [-readonly] [-mountpoint] [$MNT] [$DMG]
ditto [$MNT/PaperMac.app] [$STAGED]
codesign [--verify] [--deep] [--strict] [$STAGED]
$ID_CHECK
ps [-axo] [uid=,pid=,comm=]
$QUIT
at quit: installed=old staged=new
$ID_CHECK
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]
at open: lock held"
check "upgrade prints the backup path before swapping" says "Moving the current PaperMac to $apps/.PaperMac-install."
check "upgrade quit PaperMac" dead "$app"
check "upgrade never sends SIGTERM after a clean quit" silent "SIGTERM"
check "another user's PaperMac elsewhere is left running" alive "$other"
check "upgrade replaces the old app" app_is "$apps/PaperMac.app" new
check "upgrade leaves no private copy, old app or lock" no_staging
check "upgrade removes the download" tmp_empty

new_case quit-ignored-then-term
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
running 502 "$home/elsewhere/PaperMac.app"
other=$PID
run -- STUB_QUIT=ignore
check "a PaperMac that ignores the quit still upgrades" status 0
check "the wait is reported" says "PaperMac did not quit within 20 seconds."
check "then SIGTERM" says "Sending PaperMac SIGTERM..."
check "the full wait passed before SIGTERM" [ "$(grep -c '^sleep' "$case_dir/log")" -ge 40 ]
check "SIGTERM stopped PaperMac" dead "$app"
check "SIGTERM went only to that PaperMac" alive "$other"
check "the app was replaced" app_is "$apps/PaperMac.app" new

new_case quit-request-hangs mv
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_QUIT=hang
check "a hung quit request is bounded" status 0
check "the hung quit request is ended before the swap" called "at swap: quit request gone"
check "the hung quit request is gone afterwards" dead "$(cat "$home/.stub-osascript")"
check "the hang is reported" says "PaperMac did not quit within 20 seconds."
check "SIGTERM after the hung request" dead "$app"
check "the app was replaced after a hung request" app_is "$apps/PaperMac.app" new

new_case quit-refused
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_QUIT=refuse STUB_SLEEP=0.1
check "a refused quit still upgrades" status 0
check "the refusal is shown" says "PaperMac did not accept the request to quit: execution error: Not authorized to send Apple events to PaperMac. (-1743)"
check "SIGTERM follows the refusal without the full wait" [ "$(grep -c '^sleep' "$case_dir/log")" -lt 40 ]
check "SIGTERM stopped the refusing PaperMac" dead "$app"

new_case term-ignored
existing "$apps"
running 501 "$apps/PaperMac.app" ignore-term
app=$PID
run -- STUB_QUIT=ignore
check "a PaperMac that will not quit stops the install" status 1
check "it says so" says "PaperMac is still running. Quit it from its menu bar icon, then run this again. The installed PaperMac was not changed."
check "it never sends SIGKILL" alive "$app"
check "it keeps the old app" app_is "$apps/PaperMac.app" old
check "it leaves no private copy or lock" no_staging
check "it removes the download" tmp_empty

new_case running-elsewhere
existing "$apps"
running 501 "$home/Downloads/PaperMac.app"
app=$PID
run
check "a PaperMac running from another folder stops the install" status 1
check "it names that folder" says "PaperMac is running from $home/Downloads/PaperMac.app. Quit it, then run this again. The installed PaperMac was not changed."
check "it is not quit" not_called osascript
check "it keeps running" alive "$app"
check "the installed app is kept" app_is "$apps/PaperMac.app" old
check "no private copy is left" no_staging

new_case running-other-user
existing "$apps"
running 502 "$apps/PaperMac.app"
app=$PID
run
check "another user's PaperMac in the same folder stops the install" status 1
check "it says another user runs it" says "Another user on this Mac is running PaperMac from $apps/PaperMac.app. It must be quit first."
check "it is not quit or signalled" alive "$app"
check "the shared app is kept" app_is "$apps/PaperMac.app" old

new_case ps-fails
existing "$apps"
run -- STUB_PS_FAILS=1
check "a failed process listing stops before the swap" status 1
check "it says so" says "Could not list running processes to look for PaperMac. The installed PaperMac was not changed."
check "the app is kept when ps fails" app_is "$apps/PaperMac.app" old

new_case tampered-checksum
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_DMG_SHA=0000000000000000000000000000000000000000000000000000000000000000
check "a tampered download fails" status 1
check "a tampered download is named" says "Checksum mismatch for the PaperMac download"
check "a tampered download says nothing changed" says "Nothing was changed."
check "a tampered download leaves the app" app_is "$apps/PaperMac.app" old
check "a tampered download never quits PaperMac" not_called osascript
check "a tampered download leaves PaperMac running" alive "$app"
check "a tampered download never mounts or copies" not_called hdiutil
check "a tampered download writes nothing to Applications" [ "$(ls -A "$apps")" = PaperMac.app ]
check "a tampered download is removed" tmp_empty

new_case user-applications
chmod 555 "$apps"
run
check "without write access to /Applications the install succeeds" status 0
check "it installs to ~/Applications" app_is "$home/Applications/PaperMac.app" new
check "it says so" says "Installing to $home/Applications/PaperMac.app"
check "it opens that copy" called "open [~/Applications/PaperMac.app]"
check "nothing is left in ~/Applications" [ "$(ls -A "$home/Applications")" = PaperMac.app ]

new_case admin-installed
existing "$apps"
chmod 555 "$apps"
run
check "an unwritable Applications folder is refused" says "This user cannot change $apps, so PaperMac cannot be installed or updated there."
check "no second copy is made" [ ! -e "$home/Applications/PaperMac.app" ]
check "nothing is downloaded" not_called curl

new_case other-users-app
existing "$apps"
chmod 555 "$apps/PaperMac.app"
run
check "an app this user cannot move is refused" status 1
check "it says it belongs to another user" says "$apps/PaperMac.app belongs to another user, so this user cannot replace or remove it."
check "the old app is kept" app_is "$apps/PaperMac.app" old
check "nothing is downloaded for another user's app" not_called curl

new_case user-upgrade
existing "$home/Applications"
run
check "an existing ~/Applications copy is upgraded in place" app_is "$home/Applications/PaperMac.app" new
check "no second copy appears in /Applications" [ ! -e "$apps/PaperMac.app" ]

for kind in file symlink dangling-symlink foreign-app plain-folder; do
  new_case "not-papermac-$kind"
  case $kind in
    file) echo notes > "$apps/PaperMac.app" ;;
    symlink) existing "$home/real"; ln -s "$home/real/PaperMac.app" "$apps/PaperMac.app" ;;
    dangling-symlink) ln -s "$home/missing/PaperMac.app" "$apps/PaperMac.app" ;;
    foreign-app)
      mkdir -p "$apps/PaperMac.app/Contents"
      printf '{\n  "CFBundleIdentifier": "com.example.other"\n}\n' > "$apps/PaperMac.app/Contents/Info.plist" ;;
    plain-folder) mkdir -p "$apps/PaperMac.app/notes"; echo keep > "$apps/PaperMac.app/notes/a" ;;
  esac
  ls -lR "$apps" > "$case_dir/before"
  run
  check "a $kind at the destination is refused" status 1
  check "a $kind is called not PaperMac" says "$apps/PaperMac.app is not PaperMac, so it was left alone."
  # shellcheck disable=SC2016 # expanded by the inner sh
  check "a $kind is left exactly as it was" sh -c 'ls -lR "$1" | diff - "$2"' _ "$apps" "$case_dir/before"
  check "a $kind stops before downloading" not_called curl
  if [ "$kind" = symlink ]; then check "the symlink's target is kept" app_is "$home/real/PaperMac.app" old; fi
done

new_case lock-held
existing "$apps"
sleeper
holder=$PID
mkdir "$apps/.PaperMac-install.lock"
echo "$holder" > "$apps/.PaperMac-install.lock/pid"
run
check "a held lock stops the install" status 1
check "it names the running process" says "Another PaperMac install or uninstall may be running (process $holder): $apps/.PaperMac-install.lock exists. If none is running, remove that folder and run this again."
check "a held lock is kept" [ "$(cat "$apps/.PaperMac-install.lock/pid")" = "$holder" ]
check "nothing is downloaded while locked" not_called curl
check "the app is kept while locked" app_is "$apps/PaperMac.app" old

new_case lock-stale
existing "$apps"
sleeper
kill -KILL "$PID"
sleep 0.2
mkdir "$apps/.PaperMac-install.lock"
echo "$PID" > "$apps/.PaperMac-install.lock/pid"
run
check "a stale lock is taken over" status 0
check "it says so" says "Took over the lock left by process $PID, which is no longer running."
check "the install completes" app_is "$apps/PaperMac.app" new
check "the lock is released" no_staging

new_case lock-without-pid
mkdir "$apps/.PaperMac-install.lock"
run
check "a lock without a process is not taken over" status 1
check "it says how to clear it" says "If none is running, remove that folder and run this again."

new_case codesign-fails
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_CODESIGN_FAILS=1
check "a codesign failure fails" status 1
check "a codesign failure is named" says "failed code signature verification. The installed PaperMac was not changed."
check "a codesign failure keeps the old app" app_is "$apps/PaperMac.app" old
check "a codesign failure never quits PaperMac" alive "$app"
check "a codesign failure detaches" called "hdiutil [detach]"
check "a codesign failure never opens" not_called open
check "a codesign failure leaves no private copy" no_staging
check "a codesign failure removes the download" tmp_empty

new_case copy-fails
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_DITTO_FAILS=1
check "a copy failure fails" status 1
check "a copy failure says nothing changed" says "Could not copy PaperMac into $apps. The installed PaperMac was not changed."
check "a copy failure keeps the old app" app_is "$apps/PaperMac.app" old
check "a copy failure never quits PaperMac" alive "$app"
check "a copy failure leaves no partial copy" no_staging

new_case attach-fails
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_ATTACH_FAILS=1
check "an attach failure fails" status 1
check "an attach failure says what happened" says "Could not open the PaperMac disk image. The installed PaperMac was not changed."
check "an attach failure shows hdiutil's error" says "attach failed - no mountable file systems"
check "an attach failure does not try to detach" not_called "hdiutil [detach]"
check "an attach failure never quits PaperMac" alive "$app"
check "an attach failure keeps the old app" app_is "$apps/PaperMac.app" old
check "an attach failure removes the download" tmp_empty

new_case detach-fails
run -- STUB_DETACH_FAILS=1
check "a detach failure fails" status 1
check "a detach failure still installed the app" app_is "$apps/PaperMac.app" new
check "a detach failure says the app is installed" says "PaperMac 27.0.0-alpha.3 is installed at $apps/PaperMac.app. Open it with:"
check "a detach failure gives the detach command" says "Detach it with: hdiutil detach '"
check "a detach failure keeps the download" [ -f "$(find "$case_dir/tmp" -name PaperMac.dmg | head -n 1)" ]
check "a detach failure says where the download is" says "The download is kept at"
check "a detach failure does not open the app" not_called open
check "a detach failure releases the lock" no_staging

new_case promote-fails mv
existing "$apps"
run -- STUB_MV=promote
check "a failed swap fails" status 1
check "a failed swap puts the old app back" app_is "$apps/PaperMac.app" old
check "a failed swap says so" says "The previous PaperMac was put back at $apps/PaperMac.app."
check "a failed swap leaves no private copy" no_staging

new_case restore-fails mv
existing "$apps"
run -- STUB_MV=promote,restore
check "a failed restore fails" status 1
backup=$(find "$apps" -path '*/.PaperMac-install.*/previous.app' 2>/dev/null | head -n 1)
check "a failed restore keeps the backup" app_is "$backup" old
check "a failed restore prints where it is" says "The previous PaperMac is kept at $backup"
check "a failed restore prints the restore command" says "  mv '$backup' '$apps/PaperMac.app'"
check "a failed restore removes only the new copy" [ ! -e "${backup%/previous.app}/PaperMac.app" ]
check "a failed restore releases the lock" [ ! -e "$apps/.PaperMac-install.lock" ]

new_case restore-skipped mv
existing "$apps"
run -- STUB_MV=aside
check "something appearing at the destination stops the swap" status 1
check "it says so" says "Something else appeared at $apps/PaperMac.app during the install."
backup=$(find "$apps" -path '*/.PaperMac-install.*/previous.app' 2>/dev/null | head -n 1)
check "a skipped restore keeps the backup" app_is "$backup" old
check "a skipped restore explains the new arrival" says "Something else is now at $apps/PaperMac.app. Move it away, then put PaperMac back with:"
check "a skipped restore leaves the newcomer alone" [ -d "$apps/PaperMac.app" ]

new_case interrupted-mid-swap mv
existing "$apps"
run -- STUB_MV=interrupt
check "an interrupted swap exits 130" status 130
check "an interrupted swap puts the old app back" app_is "$apps/PaperMac.app" old
check "an interrupted swap leaves no private copy or lock" no_staging
check "an interrupted swap still detaches" called "hdiutil [detach]"

new_case lock-takeover-race
existing "$apps"
sleeper
dead_pid=$PID
kill -KILL "$dead_pid"
sleeper
winner=$PID
sleep 0.2
mkdir "$apps/.PaperMac-install.lock"
echo "$dead_pid" > "$apps/.PaperMac-install.lock/pid"
run -- STUB_LOCK_RACE="$winner"
check "losing a stale-lock takeover stops the install" status 1
check "it says the other run took over first" says "Another PaperMac install or uninstall took over $apps/.PaperMac-install.lock first."
check "the winner's lock is kept" [ "$(cat "$apps/.PaperMac-install.lock/pid")" = "$winner" ]
check "the takeover lock is released" [ ! -e "$apps/.PaperMac-install.lock.takeover" ]
check "nothing is downloaded after losing a takeover" not_called curl

new_case lock-takeover-busy
existing "$apps"
sleeper
kill -KILL "$PID"
sleep 0.2
mkdir "$apps/.PaperMac-install.lock" "$apps/.PaperMac-install.lock.takeover"
echo "$PID" > "$apps/.PaperMac-install.lock/pid"
run
check "a takeover in progress stops the install" says "Another run is taking over $apps/.PaperMac-install.lock."
check "a takeover in progress is left alone" [ "$(cat "$apps/.PaperMac-install.lock/pid")" = "$PID" ]

new_case lock-not-ours
sleeper
run -- STUB_STEAL_LOCK="$PID"
check "a lock that changed hands is never released" [ "$(cat "$apps/.PaperMac-install.lock/pid" 2>/dev/null)" = "$PID" ]

new_case replaced-during-download
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_DEST_FOREIGN=download
check "a destination replaced during the download is refused" says "$apps/PaperMac.app is not PaperMac, so it was left alone."
check "it is refused before PaperMac is quit" alive "$app"
check "the replacement is kept" [ -d "$apps/PaperMac.app" ]
check "it leaves no private copy" no_staging

new_case replaced-during-quit
existing "$apps"
running 501 "$apps/PaperMac.app"
run -- STUB_DEST_FOREIGN=quit
check "a destination replaced during the quit is refused" says "$apps/PaperMac.app is not PaperMac, so it was left alone."
check "it is never moved aside" [ -f "$apps/PaperMac.app/Contents/version" ]
check "the replacement is not deleted" no_staging

new_case running-bare-name
existing "$apps"
sleeper
echo "501 $PID PaperMac" >> "$home/.stub-procs"
run
check "a PaperMac started by bare name gets a clear message" says "PaperMac is running from an unknown location. Quit it, then run this again."

new_case detach-retry
run -- STUB_DETACH_FAILS=once
check "a detach that fails once is retried" status 0
check "the retry detached" [ "$(grep -c 'hdiutil \[detach\]' "$case_dir/log")" = 2 ]
check "the app is opened after a retried detach" called open

new_case download-fails
run -- STUB_CURL_FAILS=1
check "a failed download fails" status 1
check "a failed download says nothing changed" says "Could not download PaperMac. Nothing was changed."
check "a failed download releases the lock" no_staging

new_case old-macos
run -- STUB_MACOS=26.4
check "macOS 26 is refused" status 1
check "macOS 26 gets an explanation" says "PaperMac needs macOS 27 or newer; this Mac runs macOS 26.4. Nothing was changed."
check "macOS 26 downloads nothing" not_called curl

new_case root
run -- STUB_UID=0
check "root is refused" status 1
check "root message" says "Do not run this as root or with sudo"
check "root does nothing" not_called curl

new_case unknown-option
run --force
check "an unknown option is refused" says "Unknown option: --force"

# --- manifest mode ----------------------------------------------------------------

new_case manifest
manifest_mode
existing "$apps"
run -- STUB_DMG_SHA=$M_SHA
check "manifest install succeeds" status 0
check "manifest install fetches the manifest, then its disk image" calls "$CURL [\$TMPDIR/papermac.X/latest.json] [$MANIFEST_URL]
plutil [-extract] [version] [raw] [-expect] [string] [-o] [-] [\$TMPDIR/papermac.X/latest.json]
plutil [-extract] [dmg_url] [raw] [-expect] [string] [-o] [-] [\$TMPDIR/papermac.X/latest.json]
plutil [-extract] [sha256] [raw] [-expect] [string] [-o] [-] [\$TMPDIR/papermac.X/latest.json]
plutil [-extract] [min_macos] [raw] [-expect] [string] [-o] [-] [\$TMPDIR/papermac.X/latest.json]
plutil [-extract] [notarized] [raw] [-expect] [bool] [-o] [-] [\$TMPDIR/papermac.X/latest.json]
$ID_CHECK
$CURL [$DMG] [$M_URL]
shasum [-a] [256] [$DMG]
hdiutil [attach] [-nobrowse] [-readonly] [-mountpoint] [$MNT] [$DMG]
ditto [$MNT/PaperMac.app] [$STAGED]
codesign [--verify] [--deep] [--strict] [$STAGED]
$ID_CHECK
ps [-axo] [uid=,pid=,comm=]
$ID_CHECK
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]
at open: lock held"
check "manifest install names the manifest's release" says "Installing PaperMac 27.0.0-alpha.4 (not notarized)."
check "manifest install shows the manifest's checksum" says "SHA-256: $M_SHA"
check "manifest install replaced the app" app_is "$apps/PaperMac.app" new

new_case manifest-notarized
manifest_mode notarized true
run -- STUB_DMG_SHA=$M_SHA
check "a notarized release says so" says "Installing PaperMac 27.0.0-alpha.4 (notarized)."

new_case manifest-min-macos
manifest_mode min_macos '"28"'
run -- STUB_DMG_SHA=$M_SHA
check "the manifest's min_macos replaces the built-in one" says "PaperMac needs macOS 28 or newer; this Mac runs macOS 27.0. Nothing was changed."
check "a too-old Mac downloads no disk image" [ "$(grep -c '^curl' "$case_dir/log")" = 1 ]

manifest_failure() { # NAME EXPECTED_MESSAGE [KEY JSON_VALUE]...
  name=$1 expected=$2
  shift 2
  new_case "manifest-$name"
  manifest_mode "$@"
  existing "$apps"
  running 501 "$apps/PaperMac.app"
  app=$PID
  run -- STUB_DMG_SHA=$M_SHA
  check "manifest $name fails closed" status 1
  check "manifest $name says why" says "$expected"
  check "manifest $name never downloads a disk image, pinned or not" not_called "PaperMac.dmg]"
  check "manifest $name never mounts" not_called hdiutil
  check "manifest $name never quits PaperMac" alive "$app"
  check "manifest $name keeps the app" app_is "$apps/PaperMac.app" old
  check "manifest $name leaves nothing behind" tmp_empty
}
invalid() { echo "The PaperMac release manifest at $MANIFEST_URL has a missing or invalid \"$1\". Nothing was changed."; }

new_case manifest-unreachable
manifest_mode
existing "$apps"
run -- STUB_MANIFEST=
check "an unreachable manifest fails closed" status 1
check "it says so" says "Could not download the PaperMac release manifest from $MANIFEST_URL. Nothing was changed."
check "it never falls back to the pinned release" not_called "$URL"

manifest_failure not-json "$(invalid version)" raw 'not json'

for field in version dmg_url sha256 min_macos notarized; do
  manifest_failure "missing-$field" "$(invalid $field)" "$field" -
done
manifest_failure version-word "$(invalid version)" version '"latest"'
manifest_failure version-short "$(invalid version)" version '"27.0"'
manifest_failure version-injection "$(invalid version)" version '"27.0.0; rm -rf ~"'
manifest_failure version-number "$(invalid version)" version 27
manifest_failure url-other-host "$(invalid dmg_url)" dmg_url '"https://evil.example/papermac/PaperMac.dmg"'
manifest_failure url-lookalike-host "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh.evil.example/papermac/PaperMac.dmg"'
manifest_failure url-http "$(invalid dmg_url)" dmg_url '"http://dl.getpaper.sh/papermac/PaperMac.dmg"'
manifest_failure url-subfolder "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh/papermac/../x/PaperMac.dmg"'
manifest_failure url-not-dmg "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh/papermac/PaperMac.zip"'
manifest_failure url-bare-dmg "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh/papermac/.dmg"'
manifest_failure url-query "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh/papermac/PaperMac.dmg?x=1"'
manifest_failure url-space "$(invalid dmg_url)" dmg_url '"https://dl.getpaper.sh/papermac/Paper Mac.dmg"'
manifest_failure sha-upper "$(invalid sha256)" sha256 "\"$(printf '%s' "$M_SHA" | tr 1 A)\""
manifest_failure sha-short "$(invalid sha256)" sha256 "\"${M_SHA%1}\""
manifest_failure sha-long "$(invalid sha256)" sha256 "\"${M_SHA}1\""
manifest_failure min-dotted "$(invalid min_macos)" min_macos '"27.1"'
manifest_failure min-number "$(invalid min_macos)" min_macos 27
manifest_failure min-huge "$(invalid min_macos)" min_macos '"99999999999999999999"'
manifest_failure notarized-string "$(invalid notarized)" notarized '"false"'

# --- uninstall ------------------------------------------------------------------

new_case uninstall
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
mkdir -p "$home/.config/papermac" "$home/Library/Application Support/PaperMac"
run --uninstall
warning="If PaperMac crashed or was force-quit, open it once and quit it before uninstalling, so it can return any hidden windows."
check "uninstall succeeds" status 0
check "uninstall prints the warning first" [ "$(head -n 1 "$case_dir/out")" = "$warning" ]
check "uninstall quits PaperMac" called "$QUIT"
check "uninstall quit it" dead "$app"
check "uninstall removes the app" [ ! -e "$apps/PaperMac.app" ]
check "uninstall leaves only an empty Applications folder" [ -z "$(ls -A "$apps")" ]
check "uninstall keeps the config folder" [ -d "$home/.config/papermac" ]
check "uninstall keeps Application Support" [ -d "$home/Library/Application Support/PaperMac" ]
check "uninstall prints the config cleanup command" says "rm -rf ~/.config/papermac"
check "uninstall prints the Application Support cleanup command" says "rm -rf ~/'Library/Application Support/PaperMac'"

new_case uninstall-both
existing "$apps"
existing "$home/Applications"
echo keep > "$home/Applications/Notes.txt"
run --uninstall
check "uninstall removes the /Applications copy" [ ! -e "$apps/PaperMac.app" ]
check "uninstall removes the ~/Applications copy" [ ! -e "$home/Applications/PaperMac.app" ]
check "uninstall removes nothing else" [ "$(ls -A "$home/Applications")" = Notes.txt ]

new_case uninstall-user-applications
existing "$home/Applications"
run --uninstall
check "uninstall finds ~/Applications" [ ! -e "$home/Applications/PaperMac.app" ]

for kind in file symlink foreign-app; do
  new_case "uninstall-not-papermac-$kind"
  existing "$home/Applications"
  case $kind in
    file) echo notes > "$apps/PaperMac.app" ;;
    symlink) existing "$home/real"; ln -s "$home/real/PaperMac.app" "$apps/PaperMac.app" ;;
    foreign-app)
      mkdir -p "$apps/PaperMac.app/Contents"
      printf '{\n  "CFBundleIdentifier": "com.example.other"\n}\n' > "$apps/PaperMac.app/Contents/Info.plist" ;;
  esac
  run --uninstall
  check "uninstall refuses a $kind" status 1
  check "uninstall calls a $kind not PaperMac" says "$apps/PaperMac.app is not PaperMac, so it was left alone."
  check "uninstall keeps a $kind" exists "$apps/PaperMac.app"
  check "uninstall with a $kind removes nothing at all" app_is "$home/Applications/PaperMac.app" old
  if [ "$kind" = symlink ]; then check "uninstall keeps the symlink's target" app_is "$home/real/PaperMac.app" old; fi
done

new_case uninstall-other-users-app
existing "$apps"
chmod 555 "$apps/PaperMac.app"
run --uninstall
check "uninstall refuses another user's app" says "belongs to another user, so this user cannot replace or remove it. Ask that user or an administrator to remove it. Nothing was removed."
check "uninstall keeps another user's app" app_is "$apps/PaperMac.app" old

new_case uninstall-quit-fails
existing "$apps"
running 501 "$apps/PaperMac.app" ignore-term
run --uninstall -- STUB_QUIT=ignore
check "uninstall stops when PaperMac does not quit" status 1
check "uninstall says nothing was removed" says "Nothing was removed."
check "uninstall keeps the app when PaperMac does not quit" app_is "$apps/PaperMac.app" old

new_case uninstall-locked
existing "$apps"
sleeper
holder=$PID
running 501 "$apps/PaperMac.app"
app=$PID
mkdir "$apps/.PaperMac-install.lock"
echo "$holder" > "$apps/.PaperMac-install.lock/pid"
run --uninstall
check "uninstall waits for a running install" says "Another PaperMac install or uninstall may be running (process $holder)"
check "uninstall removes nothing while locked" app_is "$apps/PaperMac.app" old
check "uninstall takes the lock before quitting" not_called osascript
check "uninstall leaves PaperMac running while locked" alive "$app"

new_case uninstall-protected-files
existing "$apps"
mkdir -p "$apps/PaperMac.app/Contents/MacOS"
echo binary > "$apps/PaperMac.app/Contents/MacOS/PaperMac"
chmod 555 "$apps/PaperMac.app/Contents/MacOS"
running 501 "$apps/PaperMac.app"
app=$PID
find "$apps/PaperMac.app" | sort > "$case_dir/before"
run --uninstall
check "uninstall refuses a bundle it cannot fully delete" status 1
check "it names the protected folder" says "This user cannot delete $apps/PaperMac.app/Contents/MacOS, inside $apps/PaperMac.app."
# shellcheck disable=SC2016 # expanded by the inner sh
check "every file of that bundle is kept" sh -c 'find "$1" | sort | diff - "$2"' _ "$apps/PaperMac.app" "$case_dir/before"
check "PaperMac is not quit for a refused uninstall" alive "$app"

new_case uninstall-leftover rm
existing "$apps"
run --uninstall -- STUB_RM=fail
check "a failed delete makes uninstall fail" status 1
check "the real path is never left half-deleted" [ ! -e "$apps/PaperMac.app" ]
leftover=$(find "$apps" -name '.PaperMac-uninstall.*' | head -n 1)
check "the leftover is reported where it is" says "PaperMac was removed from $apps/PaperMac.app, but some of its files could not be deleted. They are in $leftover; delete that folder."
check "the leftover is that folder" app_is "$leftover/PaperMac.app" old

new_case uninstall-nothing
run --uninstall
check "uninstall without PaperMac" says "PaperMac is not installed"
check "uninstall without PaperMac still warns first" [ "$(head -n 1 "$case_dir/out")" = "$warning" ]

# --- options, Linux and other systems ----------------------------------------------

# Linux runs the inlined Paperland installer; paperland/tests covers it in full, also
# against this combined file. These cases check that each option reaches it. The
# PaperMac stubs include no Omarchy, so Paperland's own first check stops it.
paperland_needs_omarchy="Paperland installs as an Omarchy plugin and needs Omarchy 4 or newer (omarchy-version was not found on PATH)."
only_os_checks() { [ "$(grep -Ecv '^(id|uname)( |$)' "$case_dir/log")" = 0 ]; }

new_case linux
run -- STUB_OS=Linux
check "Linux runs the Paperland installer" says "$paperland_needs_omarchy"
check "Linux without Omarchy fails" status 1
check "Linux runs nothing of PaperMac's" only_os_checks

new_case linux-edit-dotfiles
run --edit-dotfiles -- STUB_OS=Linux
check "Linux passes --edit-dotfiles to the Paperland installer" says "$paperland_needs_omarchy"
check "Linux accepts --edit-dotfiles" silent "Unknown option"

new_case linux-uninstall
run --uninstall -- STUB_OS=Linux
check "Linux --uninstall runs the Paperland uninstaller" says "Paperland is not installed; nothing to do."
check "Linux --uninstall with nothing installed succeeds" status 0
check "Linux --uninstall runs nothing of PaperMac's" only_os_checks

new_case linux-uninstall-edit-dotfiles
run --uninstall --edit-dotfiles -- STUB_OS=Linux
check "--edit-dotfiles with --uninstall is refused" status 1
check "--edit-dotfiles with --uninstall says why" says "--edit-dotfiles applies only to the installer, not to --uninstall."
check "--edit-dotfiles with --uninstall runs nothing" only_os_checks

new_case linux-root
run -- STUB_OS=Linux STUB_UID=0
check "Linux refuses root" says "Do not run this installer as root or with sudo"

new_case macos-edit-dotfiles
run --edit-dotfiles
check "--edit-dotfiles is refused on macOS" status 1
check "--edit-dotfiles on macOS says why" says "--edit-dotfiles applies only to Paperland on Linux; PaperMac has no Hyprland config."
check "--edit-dotfiles on macOS changes nothing" not_called curl

new_case other-os
run -- STUB_OS=FreeBSD
check "another system is refused" status 1
check "another system is named" says "Unsupported system: FreeBSD. Paper supports macOS (PaperMac) and Linux with Omarchy and Hyprland (Paperland)."
check "another system runs nothing" only_os_checks

new_case help
run --help
check "--help succeeds" status 0
check "--help lists --uninstall" says "--uninstall      Remove PaperMac (macOS) or Paperland (Linux)."
check "--help lists --edit-dotfiles" says "--edit-dotfiles  Linux only."
check "--help runs nothing" [ ! -s "$case_dir/log" ]

new_case unknown-option-first
run --force --uninstall -- STUB_OS=Linux
check "an unknown option stops before anything runs" [ ! -s "$case_dir/log" ]

new_case unbuilt
cp "$root/install" "$case_dir/install"
run -- STUB_OS=Linux
check "the unbuilt source refuses Linux" says "This installer was not built: run scripts/build-site.sh and use site/install."

# --- truncation -----------------------------------------------------------------

# A download cut short must run nothing. The one exception is losing only the final
# newline: that is the complete script, and it must still do what was asked.
new_case truncated
existing "$apps"
size=$(wc -c < "$case_dir/install")
lines=$(wc -l < "$case_dir/install")
ran=
installed=
cuts=
n=1
while [ "$n" -lt "$lines" ]; do cuts="$cuts L$n"; n=$((n + 1)); done
n=1
while [ "$n" -le 20 ]; do cuts="$cuts B$n"; n=$((n + 1)); done
for cut in $cuts; do
  case $cut in
    L*) head -n "${cut#L}" "$case_dir/install" > "$case_dir/prefix" ;;
    B*) head -c $((size - ${cut#B})) "$case_dir/install" > "$case_dir/prefix" ;;
  esac
  for run in Darwin: Darwin:--uninstall Linux: Linux:--uninstall; do
    os=${run%%:*} args=${run#*:}
    : > "$case_dir/log"
    # shellcheck disable=SC2086 # args is one simple word or nothing
    env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" \
      STUB_DMG_SHA="$SHA" STUB_OS="$os" sh -s -- $args < "$case_dir/prefix" >/dev/null 2>&1
    if [ "$args" = --uninstall ] && called curl; then installed="$installed $cut"; fi
    if [ -s "$case_dir/log" ] && [ "$cut" != B1 ]; then ran="$ran $cut:$run"; fi
    existing "$apps"
  done
done
: > "$case_dir/out"
check "no truncated script runs anything (ran:${ran:- none})" [ -z "$ran" ]
check "no truncated uninstall installs (installed:${installed:- none})" [ -z "$installed" ]

# --- site -----------------------------------------------------------------------

case_dir=$work/cases/site
mkdir -p "$case_dir"
: > "$case_dir/out"
: > "$case_dir/log"
sh "$root/scripts/build-site.sh" "$case_dir/site" > /dev/null
check "committed site/ equals a fresh build" diff -r "$root/site" "$case_dir/site"
for file in _headers index.html install; do check "site/ has $file" [ -f "$root/site/$file" ]; done
for file in OFL-monasans.txt OFL-jetbrainsmono.txt LOGOS-SOURCE.txt; do
  check "site/licenses/ has $file" cmp -s "$root/licenses/$file" "$root/site/licenses/$file"
done
check "site/ has nothing else" [ "$(find "$root/site" -mindepth 1 | wc -l | tr -d ' ')" = 7 ]
check "/install is served as plain text" grep -qxF '  Content-Type: text/plain; charset=utf-8' "$root/site/_headers"
check "/install is never cached stale" grep -qxF '  Cache-Control: no-cache' "$root/site/_headers"
check "wrangler.jsonc names the Worker getpaper-sh" grep -qF '"name": "getpaper-sh"' "$root/wrangler.jsonc"
check "wrangler.jsonc serves site/" grep -qF '"directory": "./site"' "$root/wrangler.jsonc"
check "wrangler.jsonc has no Worker script" fails grep -qF '"main"' "$root/wrangler.jsonc"
check "the page has no external scripts" fails grep -Eq '<script[^>]+src=' "$root/site/index.html"
check "the page shows the universal one-liner" grep -qF 'curl -fsSL https://getpaper.sh/install | sh</code>' "$root/site/index.html"
# PaperMac is notarized from Alpha 5, so a browser-downloaded DMG opens; the page may link
# one, but only a release on PaperMac's own download host.
page_dmg_links() { grep -oiE 'href="[^"]*\.dmg"' "$root/site/index.html"; }
check "the page links a DMG" page_dmg_links
check "every DMG link is a PaperMac release on dl.getpaper.sh" \
  fails sh -c "grep -oiE 'href=\"[^\"]*\\.dmg\"' '$root/site/index.html' | grep -vxE 'href=\"https://dl\\.getpaper\\.sh/papermac/PaperMac-[0-9][0-9a-z.-]*\\.dmg\"'"
check "the page shows no brew command" fails grep -qF 'brew install' "$root/site/index.html"
# The page builds its command boxes in script, with <wbr> break hints inside the commands.
page_text() { sed 's/<wbr>//g' "$root/site/index.html"; }
page_text_has() { page_text | grep -qF "$1"; }
check "both platform panels have the uninstall command" \
  [ "$(page_text | grep -oF 'curl -fsSL https://getpaper.sh/install | sh -s -- --uninstall' | wc -l | tr -d ' ')" = 2 ]
check "the page's install command is the universal one-liner" page_text_has 'const CURL = "curl -fsSL https://getpaper.sh/install | sh";'
check "the Linux panel shows the install command" \
  sh -c "sed -n '/data-os=\"lin\"/,/class=\"rejoin\"/p' '$root/site/index.html' | grep -qF '\${F.cmd(CURL)}'"
check "the page no longer calls Paperland coming soon" fails grep -qiE 'Paperland[^<]*coming soon' "$root/site/index.html"
check "the served installer inlines the Paperland installer" grep -qx 'paperland_install() (' "$root/site/install"
check "the served installer pins the Paperland release" grep -qx "$(grep '^PLUGIN_SHA=' "$root/paperland/release.env")" "$root/site/install"
check "the page carries the uninstall warning" grep -qF "$warning" "$root/site/index.html"
check "the page announces copying to screen readers" grep -qF 'aria-live="polite"' "$root/site/index.html"
check "no tracker IDs in served files" fails grep -Eq '(PAP|PAPER)-[0-9]' "$root/site/install" "$root/site/index.html"

printf '%s passed, %s failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
