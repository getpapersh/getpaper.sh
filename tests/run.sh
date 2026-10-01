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
trap 'chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT
pass=0
failed=0
SHA=$(sed -n 's/^PAPERMAC_DMG_SHA256=//p' "$root/install")
URL=$(sed -n 's/^PAPERMAC_DMG_URL=//p' "$root/install")
STUBS="id uname sw_vers curl shasum pgrep osascript sleep hdiutil ditto codesign open"

tools=$work/tools
mkdir -p "$tools"
for tool in env sed grep awk mkdir mv rm rmdir mktemp cat cp ln touch chmod head; do
  ln -s "$(command -v "$tool")" "$tools/$tool"
done
ln -s "$(command -v "${TEST_SH:-sh}")" "$tools/sh"

new_case() { # NAME: fresh HOME, system Applications folder, stubs, log
  case_dir=$work/cases/$1
  home=$case_dir/home
  apps=$case_dir/Applications
  bin=$case_dir/bin
  mkdir -p "$home" "$apps" "$bin" "$case_dir/tmp"
  : > "$case_dir/log"
  for stub in $STUBS; do ln -s "$root/tests/stub.sh" "$bin/$stub"; done
  sed "s|^SYSTEM_APPLICATIONS=/Applications\$|SYSTEM_APPLICATIONS=$apps|" "$root/install" > "$case_dir/install"
}

run() { # [ARG...] [-- VAR=value...]: run the installer with ARGs, the environment extended by VARs
  args=
  while [ $# -gt 0 ] && [ "$1" != -- ]; do args="$args $1"; shift; done
  if [ $# -gt 0 ]; then shift; fi
  # shellcheck disable=SC2086 # args are simple words
  env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" \
    STUB_DMG_SHA="$SHA" "$@" sh -s -- $args < "$case_dir/install" > "$case_dir/out" 2>&1
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
called() { grep -qF -- "$1" "$case_dir/log"; }
not_called() { ! called "$1"; }
calls() { # EXPECTED: the calls after the version checks, one per line, random names as X
  grep -Ev '^(id|uname|sw_vers)( |$)' "$case_dir/log" |
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
}

DMG="\$TMPDIR/papermac.X/PaperMac.dmg"
MNT="\$TMPDIR/papermac.X/mnt"

new_case fresh
run
check "install succeeds" status 0
check "install says what and where" says "Installing PaperMac 27.0.0-alpha.3 (alpha, not notarized)."
check "install names the destination" says "Installing to $apps/PaperMac.app"
check "install follows PAPER-7's order" calls "curl [-fsSL] [--proto] [=https] [--tlsv1.2] [-o] [$DMG] [$URL]
shasum [-a] [256] [$DMG]
pgrep [-x] [PaperMac]
hdiutil [attach] [-nobrowse] [-readonly] [-mountpoint] [$MNT] [$DMG]
ditto [$MNT/PaperMac.app] [/Applications/.PaperMac-install.X/PaperMac.app]
codesign [--verify] [--deep] [--strict] [/Applications/.PaperMac-install.X/PaperMac.app]
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]"
check "install puts the app in /Applications" app_is "$apps/PaperMac.app" new
check "install leaves no private copy" no_staging
check "install removes the download" tmp_empty

new_case upgrade-while-running
existing "$apps"
touch "$home/.stub-running"
run -- STUB_QUIT_POLLS=2
check "upgrade succeeds" status 0
check "upgrade says it replaces" says "Replacing the PaperMac at $apps/PaperMac.app"
check "upgrade quits PaperMac, waits, then replaces" calls "curl [-fsSL] [--proto] [=https] [--tlsv1.2] [-o] [$DMG] [$URL]
shasum [-a] [256] [$DMG]
pgrep [-x] [PaperMac]
osascript [-e] [quit app \"PaperMac\"]
pgrep [-x] [PaperMac]
sleep [0.5]
pgrep [-x] [PaperMac]
sleep [0.5]
pgrep [-x] [PaperMac]
hdiutil [attach] [-nobrowse] [-readonly] [-mountpoint] [$MNT] [$DMG]
ditto [$MNT/PaperMac.app] [/Applications/.PaperMac-install.X/PaperMac.app]
codesign [--verify] [--deep] [--strict] [/Applications/.PaperMac-install.X/PaperMac.app]
hdiutil [detach] [-quiet] [$MNT]
open [/Applications/PaperMac.app]"
check "upgrade replaces the old app" app_is "$apps/PaperMac.app" new
check "upgrade leaves no private copy or old app" no_staging

new_case quit-timeout
existing "$apps"
touch "$home/.stub-running"
run -- STUB_QUIT_HANGS=1
check "a PaperMac that does not quit stops the install" status 1
check "the timeout says what to do" says "PaperMac did not quit within 20 seconds. Quit it from its menu bar icon, then run this again."
check "the timeout leaves the old app" app_is "$apps/PaperMac.app" old
check "the timeout never mounts" not_called "hdiutil [attach]"
check "the timeout removes the download" tmp_empty

new_case tampered-checksum
existing "$apps"
touch "$home/.stub-running"
run -- STUB_DMG_SHA=0000000000000000000000000000000000000000000000000000000000000000
check "a tampered download fails" status 1
check "a tampered download is named" says "Checksum mismatch for the PaperMac download"
check "a tampered download says nothing changed" says "Nothing was changed."
check "a tampered download leaves the app" app_is "$apps/PaperMac.app" old
check "a tampered download never quits PaperMac" not_called osascript
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

new_case admin-installed
existing "$apps"
chmod 555 "$apps"
run
check "an unwritable existing install is refused" says "PaperMac is installed in $apps, which this user cannot change."
check "no second copy is made" [ ! -e "$home/Applications/PaperMac.app" ]

new_case user-upgrade
existing "$home/Applications"
run
check "an existing ~/Applications copy is upgraded in place" app_is "$home/Applications/PaperMac.app" new
check "no second copy appears in /Applications" [ ! -e "$apps/PaperMac.app" ]

new_case codesign-fails
run -- STUB_CODESIGN_FAILS=1
check "a codesign failure fails" status 1
check "a codesign failure is named" says "failed code signature verification"
check "a codesign failure installs nothing" [ -z "$(ls -A "$apps")" ]
check "a codesign failure detaches" called "hdiutil [detach]"
check "a codesign failure never opens" not_called open
check "a codesign failure removes the download" tmp_empty

new_case codesign-fails-upgrade
existing "$apps"
run -- STUB_CODESIGN_FAILS=1
check "a codesign failure keeps the old app" app_is "$apps/PaperMac.app" old
check "a codesign failure leaves no private copy" no_staging

new_case copy-fails
existing "$apps"
run -- STUB_DITTO_FAILS=1
check "a copy failure fails" status 1
check "a copy failure keeps the old app" app_is "$apps/PaperMac.app" old
check "a copy failure leaves no partial copy" no_staging

new_case detach-fails
run -- STUB_DETACH_FAILS=1
check "a detach failure fails" status 1
check "a detach failure still installed the app" app_is "$apps/PaperMac.app" new
check "a detach failure gives the detach command" says "Detach it with: hdiutil detach '"
check "a detach failure keeps the download" [ -f "$(find "$case_dir/tmp" -name PaperMac.dmg | head -n 1)" ]
check "a detach failure says where the download is" says "The download is kept at"
check "a detach failure does not open the app" not_called open

new_case download-fails
run -- STUB_CURL_FAILS=1
check "a failed download fails" status 1
check "a failed download says nothing changed" says "Could not download PaperMac. Nothing was changed."

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

new_case uninstall
existing "$apps"
touch "$home/.stub-running"
mkdir -p "$home/.config/papermac" "$home/Library/Application Support/PaperMac"
run --uninstall
check "uninstall succeeds" status 0
check "uninstall removes the app" [ ! -e "$apps/PaperMac.app" ]
check "uninstall quits PaperMac" called "osascript [-e] [quit app \"PaperMac\"]"
check "uninstall warns before quitting" [ "$(grep -n 'make sure all windows are visible' "$case_dir/out" | cut -d: -f1)" -lt "$(grep -n 'Quitting PaperMac' "$case_dir/out" | cut -d: -f1)" ]
check "uninstall prints the PAP-268 warning" says "Before uninstalling, make sure all windows are visible. PaperMac alphas can leave windows off-screen when they quit (tracked in PAP-268)."
check "uninstall keeps the config folder" [ -d "$home/.config/papermac" ]
check "uninstall keeps Application Support" [ -d "$home/Library/Application Support/PaperMac" ]
check "uninstall prints the config cleanup command" says "rm -rf ~/.config/papermac"
check "uninstall prints the Application Support cleanup command" says "rm -rf ~/'Library/Application Support/PaperMac'"

new_case uninstall-user-applications
existing "$home/Applications"
run --uninstall
check "uninstall finds ~/Applications" [ ! -e "$home/Applications/PaperMac.app" ]

new_case uninstall-quit-timeout
existing "$apps"
touch "$home/.stub-running"
run --uninstall -- STUB_QUIT_HANGS=1
check "uninstall stops when PaperMac does not quit" status 1
check "uninstall keeps the app when PaperMac does not quit" [ -d "$apps/PaperMac.app" ]

new_case uninstall-nothing
run --uninstall
check "uninstall without PaperMac" says "PaperMac is not installed"

for args in "" "--uninstall"; do
  new_case "linux${args:+-uninstall}"
  run $args -- STUB_OS=Linux
  check "Linux${args:+ $args} exits 1" status 1
  check "Linux${args:+ $args} says coming soon" says "Paperland install is coming soon"
  check "Linux${args:+ $args} does nothing else" [ "$(grep -Ecv '^(id|uname)( |$)' "$case_dir/log")" = 0 ]
done

new_case truncated
lines=$(wc -l < "$case_dir/install")
ran=
n=1
while [ "$n" -lt "$lines" ]; do
  : > "$case_dir/log"
  head -n "$n" "$case_dir/install" |
    env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" sh >/dev/null 2>&1
  if [ -s "$case_dir/log" ]; then ran="$ran $n"; fi
  n=$((n + 1))
done
for cut in 3 9; do # inside the final `main "$@"` line
  : > "$case_dir/log"
  size=$(wc -c < "$case_dir/install")
  head -c $((size - cut)) "$case_dir/install" |
    env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" APPS="$apps" sh >/dev/null 2>&1
  if [ -s "$case_dir/log" ]; then ran="$ran -$cut bytes"; fi
done
: > "$case_dir/out"
check "no truncated prefix runs anything (ran:${ran:- none})" [ -z "$ran" ]

case_dir=$work/cases/site
mkdir -p "$case_dir"
: > "$case_dir/out"
: > "$case_dir/log"
sh "$root/scripts/build-site.sh" "$case_dir/site" > /dev/null
check "committed site/ equals a fresh build" diff -r "$root/site" "$case_dir/site"
check "the page has no external scripts" fails grep -Eq '<script[^>]+src=' "$root/site/index.html"
check "the page shows the universal one-liner" grep -qF 'curl -fsSL https://getpaper.sh/install | sh</code>' "$root/site/index.html"
check "the page offers no DMG link" fails grep -qiE 'href="[^"]*\.dmg' "$root/site/index.html"
check "the page shows no brew command" fails grep -qF 'brew install' "$root/site/index.html"

printf '%s passed, %s failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
