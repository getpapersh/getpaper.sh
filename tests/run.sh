#!/bin/sh
# Tests for the served installer: each case pipes it into sh, the way `curl | sh`
# does, with a throwaway HOME and stub commands on a PATH that holds nothing else
# but basic tools. The script's SYSTEM_APPLICATIONS line is pointed at a folder
# inside the test, so no case can touch the real /Applications.
#
#   sh tests/run.sh               all cases
#   TEST_SH=dash sh tests/run.sh  the same, with dash running the installer
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/getpaper-tests.XXXXXX")" && pwd -P)
# Running-PaperMac stand-ins are detached sleeps; kill whatever is left of them.
trap 'while read -r p; do kill -KILL "$p" 2>/dev/null; done < "$work/pids" 2>/dev/null; chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT
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
for tool in env sed grep awk mkdir mv rm rmdir mktemp cat cp ln touch chmod head; do
  ln -s "$(command -v "$tool")" "$tools/$tool"
done
ln -s "$(command -v "${TEST_SH:-sh}")" "$tools/sh"

new_case() { # NAME [EXTRA_STUB...]: fresh HOME, system Applications folder, stubs, log
  case_dir=$work/cases/$1
  shift
  home=$case_dir/home
  apps=$case_dir/Applications
  bin=$case_dir/bin
  mkdir -p "$home" "$apps" "$bin" "$case_dir/tmp"
  : > "$case_dir/log"
  for stub in $STUBS "$@"; do ln -s "$root/tests/stub.sh" "$bin/$stub"; done
  sed "s|^SYSTEM_APPLICATIONS=/Applications\$|SYSTEM_APPLICATIONS=$apps|" "$root/install" > "$case_dir/install"
}

manifest_mode() { # [KEY JSON_VALUE]...: switch the case's script to the manifest, and write one
  sed "s|^PAPERMAC_MANIFEST_URL=\$|PAPERMAC_MANIFEST_URL=$MANIFEST_URL|" "$case_dir/install" > "$case_dir/install.m"
  mv "$case_dir/install.m" "$case_dir/install"
  if [ "${1:-}" = raw ]; then printf '%s\n' "$2" > "$case_dir/latest.json"; return; fi
  version='"27.0.0-alpha.4"' build=412 dmg_url="\"$M_URL\"" sha256="\"$M_SHA\"" min_macos='"27"' notarized=false
  while [ $# -gt 0 ]; do eval "$1=\$2"; shift 2; done
  {
    echo '{'
    for key in version build dmg_url sha256 min_macos notarized; do
      eval "value=\$$key"
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
no_staging() { [ -z "$(find "$apps" "$home" -name '.PaperMac-install.*' 2>/dev/null)" ]; }
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
open [/Applications/PaperMac.app]"
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
ps [-axo] [uid=,pid=,comm=]
$QUIT
at quit: installed=old staged=new
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]"
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

new_case quit-request-hangs
existing "$apps"
running 501 "$apps/PaperMac.app"
app=$PID
run -- STUB_QUIT=hang
check "a hung quit request is bounded" status 0
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
check "it names the running process" says "Another PaperMac install or uninstall is running (process $holder)."
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
check "it says so" says "Taking over the lock left by process $PID, which is no longer running."
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
ps [-axo] [uid=,pid=,comm=]
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]"
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
mkdir "$apps/.PaperMac-install.lock"
echo "$PID" > "$apps/.PaperMac-install.lock/pid"
run --uninstall
check "uninstall waits for a running install" says "Another PaperMac install or uninstall is running (process $PID)."
check "uninstall removes nothing while locked" app_is "$apps/PaperMac.app" old

new_case uninstall-nothing
run --uninstall
check "uninstall without PaperMac" says "PaperMac is not installed"
check "uninstall without PaperMac still warns first" [ "$(head -n 1 "$case_dir/out")" = "$warning" ]

for args in "" "--uninstall"; do
  new_case "linux${args:+-uninstall}"
  run $args -- STUB_OS=Linux
  check "Linux${args:+ $args} exits 1" status 1
  check "Linux${args:+ $args} says coming soon" says "Paperland install is coming soon"
  check "Linux${args:+ $args} does nothing else" [ "$(grep -Ecv '^(id|uname)( |$)' "$case_dir/log")" = 0 ]
done

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
  for args in "" --uninstall; do
    : > "$case_dir/log"
    # shellcheck disable=SC2086 # args is one simple word or nothing
    env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" \
      STUB_DMG_SHA="$SHA" sh -s -- $args < "$case_dir/prefix" >/dev/null 2>&1
    if [ "$args" = --uninstall ] && called curl; then installed="$installed $cut"; fi
    if [ -s "$case_dir/log" ] && [ "$cut" != B1 ]; then ran="$ran $cut${args:+ $args}"; fi
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
check "site/ has the install script, page and headers" [ "$(LC_ALL=C ls -A "$root/site" | tr '\n' ' ')" = "_headers index.html install " ]
check "/install is served as plain text" grep -qxF '  Content-Type: text/plain; charset=utf-8' "$root/site/_headers"
check "/install is never cached stale" grep -qxF '  Cache-Control: no-cache' "$root/site/_headers"
check "wrangler.jsonc names the Worker getpaper-sh" grep -qF '"name": "getpaper-sh"' "$root/wrangler.jsonc"
check "wrangler.jsonc serves site/" grep -qF '"directory": "./site"' "$root/wrangler.jsonc"
check "wrangler.jsonc has no Worker script" fails grep -qF '"main"' "$root/wrangler.jsonc"
check "the page has no external scripts" fails grep -Eq '<script[^>]+src=' "$root/site/index.html"
check "the page shows the universal one-liner" grep -qF 'curl -fsSL https://getpaper.sh/install | sh</code>' "$root/site/index.html"
check "the page offers no DMG link" fails grep -qiE 'href="[^"]*\.dmg' "$root/site/index.html"
check "the page shows no brew command" fails grep -qF 'brew install' "$root/site/index.html"
check "both platform panels have the uninstall command" [ "$(grep -c 'sh -s -- --uninstall</code>' "$root/site/index.html")" = 2 ]
check "the page carries the uninstall warning" grep -qF "$warning" "$root/site/index.html"
check "the page announces copying to screen readers" grep -qF 'aria-live="polite"' "$root/site/index.html"
check "no tracker IDs in served files" fails grep -Eq '(PAP|PAPER)-[0-9]' "$root/site/install" "$root/site/index.html"

printf '%s passed, %s failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
