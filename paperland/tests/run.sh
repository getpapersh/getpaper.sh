#!/bin/sh
# End-to-end tests for install and uninstall against a disposable HOME, with stub
# binaries on a PATH that contains nothing else but basic tools.
#
#   tests/run.sh                        stubbed installer and uninstaller cases
#   TEST_SH=dash tests/run.sh           run the scripts under dash instead of sh
#   PAPERLAND_SRC=/path tests/run.sh    also: publish releases from that Paperland
#                                       checkout, then install, upgrade and uninstall
#                                       with real git, Python and setup.py
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/getpaper-tests.XXXXXX")" && pwd -P)  # Paperland refuses symlinked parents (macOS /var)
trap 'rm -rf "$work"' EXIT
pass=0
failed=0
SHA=0123456789abcdef0123456789abcdef01234567
OLD=1111111111111111111111111111111111111111
PLUGIN_URL=https://github.com/getpapersh/paperland.git
STUBS="id uname omarchy-version omarchy-plugin-validate omarchy-plugin-list omarchy-shell omarchy hyprctl Hyprland quickshell python3 git curl shasum sw_vers hdiutil ditto"
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
P="~/.config/omarchy/plugins/json.paperland"
# shellcheck disable=SC2088
STAGE="~/.config/omarchy/.paperland-stage.X/json.paperland"
# shellcheck disable=SC2088
PREV="~/.config/omarchy/.paperland-previous-X/json.paperland"

# Real tools the scripts may use; nothing else is reachable.
tools=$work/tools
mkdir -p "$tools"
for tool in bash env sed grep awk find head date mkdir mv readlink rm rmdir sleep mktemp cat cp ln touch chmod dirname; do
  ln -s "$(command -v "$tool")" "$tools/$tool"
done
# TEST_SH=dash runs the installers (and stubs) under another /bin/sh.
ln -s "$(command -v "${TEST_SH:-sh}")" "$tools/sh"

build() { # NAME SED_SCRIPT: build site files from release.env edited by SED_SCRIPT
  mkdir -p "$work/build/$1"
  sed "$2" "$root/release.env" > "$work/build/$1/release.env"
  sh "$root/build.sh" "$work/build/$1/release.env" "$work/build/$1" >/dev/null
}
build pinned "s/^PLUGIN_SHA=.*/PLUGIN_SHA=$SHA/"
build pending "s/^PLUGIN_SHA=.*/PLUGIN_SHA=PENDING/"

new_case() { # NAME: fresh HOME, stub bin and log
  case_dir=$work/cases/$1
  home=$case_dir/home
  bin=$case_dir/bin
  mkdir -p "$home" "$bin" "$case_dir/tmp"
  : > "$case_dir/log"
  for stub in $STUBS; do ln -s "$root/tests/stub.sh" "$bin/$stub"; done
  ln -s "$(command -v jq)" "$bin/jq"
}

run() { # SCRIPT [VAR=value...]: pipe SCRIPT into sh the way `curl | sh` does
  script=$1
  shift
  env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" \
    STUB="$root/tests/stub.sh" PAPER_YES=1 STUB_ORIGIN="$PLUGIN_URL" "$@" sh < "$script" > "$case_dir/out" 2>&1
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
      "$(cat "$case_dir/out")" "$(cat "$case_dir/log")"
  fi
}
status() { [ "$(cat "$case_dir/status")" = "$1" ]; }
says() { grep -qF -- "$1" "$case_dir/out"; }
lacks() { ! says "$1"; }
called() { grep -qF -- "$1" "$case_dir/log"; }
not_called() { ! called "$1"; }
calls() { # EXPECTED: the ordered side-effecting calls, one per line (random names as X)
  grep -E '^(omarchy|omarchy-shell|omarchy-plugin-validate|git|curl|hdiutil|ditto) |^~/' "$case_dir/log" |
    sed -e 's/\.paperland-stage\.[A-Za-z0-9]*/.paperland-stage.X/g' \
        -e 's/\.paperland-previous-[A-Za-z0-9.-]*\//.paperland-previous-X\//g' > "$case_dir/calls"
  printf '%s\n' "$1" | diff -u - "$case_dir/calls" >&2
}
head_is() { [ "$(cat "$home/.config/omarchy/plugins/json.paperland/.git/stub-head" 2>/dev/null)" = "$1" ]; }
no_leftovers() { # no staging or backup folders remain
  [ -z "$(find "$home/.config/omarchy" -maxdepth 1 -name '.paperland-*' 2>/dev/null)" ]
}
untouched() { # the live plugin and runtime are exactly as before
  head_is "$OLD" && no_leftovers && ! called "[install] [--no-setup]" && ! called "[plugin] [enable]" &&
    ! called "rescanPlugins"
}
installed() { # HEAD [disabled]: the state a completed install of HEAD leaves
  plugin=$home/.config/omarchy/plugins/json.paperland
  mkdir -p "$plugin/paperland" "$plugin/.git" "$home/.local/share/paperland" "$home/.local/bin" "$home/.config/hypr"
  echo "$1" > "$plugin/.git/stub-head"
  cp "$root/tests/stub.sh" "$plugin/paperland/paperland"
  ln -s "$root/tests/stub.sh" "$home/.local/share/paperland/paperland"
  echo "Paperland CLI installation v1" > "$home/.local/share/paperland/.installed-by-paperland"
  ln -s "$home/.local/share/paperland/paperland" "$home/.local/bin/paperland"
  echo "-- generated" > "$home/.config/hypr/paperland.lua"
  printf '%s\n' "-- user" "-- BEGIN Paperland setup" "-- END Paperland setup" > "$home/.config/hypr/hyprland.lua"
  if [ "${2:-}" != disabled ]; then touch "$home/.stub-enabled"; fi
}

PINNED=$work/build/pinned/install
UNINSTALL=$work/build/pinned/uninstall
HIS=HYPRLAND_INSTANCE_SIGNATURE=test

fails() { ! "$@" 2>/dev/null; }

# --- site build -------------------------------------------------------------------

case_dir=$work/cases/build
mkdir -p "$case_dir"
: > "$case_dir/log"
: > "$case_dir/out"
printf 'BASH_ENV=/tmp/x\n' >> "$work/build/pinned/release.env"
check "an unknown key is refused" fails sh "$root/build.sh" "$work/build/pinned/release.env" "$work/build/rejected"
check "an unsafe value is refused" fails sh "$root/build.sh" "$root/tests/stub.sh" "$work/build/rejected"

# --- refusals before any change -------------------------------------------------

new_case root
run "$PINNED" STUB_UID=0 "$HIS"
check "root is refused" status 1
check "root message" says "Do not run this installer as root or with sudo"
check "root changes nothing" not_called "omarchy"

new_case pending
run "$work/build/pending/install" "$HIS"
check "PENDING is refused" status 1
check "PENDING message" says "No Paperland release is pinned yet (PLUGIN_SHA=PENDING)"
check "PENDING changes nothing" not_called git

new_case unbuilt
run "$root/install" "$HIS"
check "unbuilt template is refused" says "This installer was not built"

new_case no-omarchy
rm "$bin/omarchy-version"
run "$PINNED" "$HIS"
check "missing Omarchy is refused" status 1
check "missing Omarchy message" says "needs Omarchy 4 or newer (omarchy-version was not found on PATH)"

new_case old-omarchy
run "$PINNED" STUB_OMARCHY=3.2.1 "$HIS"
check "Omarchy 3 is refused" says "Paperland needs Omarchy 4 or newer; this system has Omarchy 3.2.1."

new_case no-jq
rm "$bin/jq"
run "$PINNED" "$HIS"
check "missing jq message" says "Paperland needs jq, which was not found on PATH."

new_case old-hyprland
run "$PINNED" STUB_HYPR=0.55.0 "$HIS"
check "old Hyprland is refused" status 1
check "old Hyprland message" says "Paperland needs Hyprland 0.56 or newer; this system has Hyprland 0.55."
check "old Hyprland changes nothing" not_called git

new_case old-hyprland-no-session
run "$PINNED" STUB_HYPR=0.55.1
check "without a session the binary version is read" called "Hyprland [--version]"
check "without a session hyprctl is not asked" not_called "hyprctl [version]"
check "old binary is refused" says "this system has Hyprland 0.55."

new_case shell-down
run "$PINNED" STUB_SHELL_DOWN=1 "$HIS"
check "a stopped omarchy-shell is refused" says "omarchy-shell is not running. Run this from a terminal inside your Omarchy session."
check "a stopped omarchy-shell changes nothing" not_called git

new_case no-tty
if (: </dev/tty) 2>/dev/null; then
  echo "skip [no-tty]: this test run has a terminal"
else
  run "$PINNED" "$HIS" PAPER_YES=
  check "no terminal without PAPER_YES is refused" status 1
  check "no terminal message names PAPER_YES" says "| PAPER_YES=1 sh"
  check "no terminal changes nothing" not_called "git [clone]"
fi

new_case non-git-plugin
mkdir -p "$home/.config/omarchy/plugins/json.paperland"
run "$PINNED" "$HIS"
check "existing non-git plugin is refused" says "Paperland is already installed at"
check "existing non-git plugin is not touched" not_called "git [clone]"

new_case linked-plugin
mkdir -p "$home/.config/omarchy/plugins" "$home/.local/share/paperland/plugin"
ln -s "$home/.local/share/paperland/plugin" "$home/.config/omarchy/plugins/json.paperland"
run "$PINNED" "$HIS"
check "a linked plugin from an earlier setup points at the uninstaller" says "is a link left by an earlier Paperland setup. First run: curl --proto '=https'"

new_case not-ours
installed "$OLD"
run "$PINNED" STUB_ORIGIN=https://github.com/someone/fork.git "$HIS"
check "plugin from another origin is refused" status 1
check "plugin from another origin message" says "from somewhere else"
check "plugin from another origin is not touched" untouched

new_case foreign-launcher
mkdir -p "$home/.local/bin"
touch "$home/.local/bin/paperland"
run "$PINNED" "$HIS"
check "foreign launcher is refused before any change" says "is not Paperland's launcher"
check "foreign launcher changes nothing" not_called "git [clone]"

new_case foreign-runtime
mkdir -p "$home/.local/share/paperland"
echo "something else" > "$home/.local/share/paperland/.installed-by-paperland"
run "$PINNED" "$HIS"
check "runtime with a different marker is refused" says "was not installed by Paperland"

# --- fresh install ----------------------------------------------------------------

new_case fresh
run "$PINNED" "$HIS"
check "install succeeds" status 0
check "install prints the plan" says "Omarchy plugins run as unsandboxed code inside omarchy-shell"
check "install prints the pinned SHA" says "$SHA"
check "install stages, verifies, publishes, then wires up" calls "omarchy-shell [shell] [listPlugins]
git [clone] [--quiet] [--no-checkout] [--single-branch] [--branch] [release] [--] [$PLUGIN_URL] [$STAGE]
git [-C] [$STAGE] [checkout] [--quiet] [--detach] [$SHA]
git [-C] [$STAGE] [rev-parse] [HEAD]
git [-C] [$STAGE] [status] [--porcelain] [--ignored]
omarchy-plugin-validate [$STAGE]
omarchy-shell [-q] [shell] [rescanPlugins]
omarchy [plugin] [enable] [json.paperland]
$P/paperland/paperland [install] [--no-setup]
~/.local/bin/paperland [setup] [--shortcut] [SUPER + M] [--autostart] [on] [--apply] [--replace-bindings]"
check "install publishes the verified tree" head_is "$SHA"
check "install leaves no staging folder" no_leftovers
check "install never uses omarchy plugin add or update" not_called "[plugin] [add]"
check "install reports success" says "Paperland is installed at $SHA."
check "install warns when ~/.local/bin is not on PATH" says ".local/bin is not on PATH"
check "install documents the HTTPS uninstall" says "Uninstall: curl --proto '=https' --tlsv1.2 -fsSL https://getpaper.sh/uninstall | sh"

new_case fresh-git-isolated
run "$PINNED" "$HIS" GIT_DIR=/nonexistent GIT_WORK_TREE=/nonexistent GIT_CONFIG_GLOBAL="$home/evil"
check "git ignores the caller's GIT_DIR and config" status 0

new_case fresh-wrong-pin
run "$PINNED" STUB_CHECKOUT_HEAD=ffffffffffffffffffffffffffffffffffffffff "$HIS"
check "fresh wrong pin fails" says "Integrity check failed: expected commit $SHA, got ffffffffffffffffffffffffffffffffffffffff. Nothing was changed."
check "fresh wrong pin publishes nothing" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]
check "fresh wrong pin leaves no staging folder" no_leftovers

new_case fresh-setup-fails
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "setup failure fails the install" status 1
check "setup failure says how to finish" says "Run the same command again to finish"

new_case retry-after-interrupted-install
installed "$SHA" disabled
run "$PINNED" "$HIS"
check "rerun after an interrupted install succeeds" status 0
check "rerun after an interrupted install enables the plugin" called "omarchy [plugin] [enable] [json.paperland]"

# --- staged verification failures leave the live plugin untouched ----------------

for failure in \
  "wrong-pin|STUB_CHECKOUT_HEAD=ffffffffffffffffffffffffffffffffffffffff|Integrity check failed: expected commit $SHA" \
  "pin-missing|STUB_PIN_MISSING=1|The pinned release $SHA was not found on the plugin remote." \
  "dirty-tree|STUB_STAGE_DIRTY=1|The staged release does not match commit $SHA exactly." \
  "wrong-id|STUB_MANIFEST_ID=wrong.paperland|The release's manifest id is 'wrong.paperland', not json.paperland." \
  "symlink|STUB_SYMLINK=1|The release contains a symlink (paperland/link)." \
  "invalid|STUB_VALIDATE_STATUS=1|The release failed Omarchy's plugin validation." \
  "clone-fails|STUB_CLONE_FAILS=1|Could not clone $PLUGIN_URL."
do
  name=${failure%%|*}; rest=${failure#*|}; knob=${rest%%|*}; message=${rest#*|}
  new_case "staged-$name"
  installed "$OLD"
  run "$PINNED" "$knob" "$HIS"
  check "$name fails" status 1
  check "$name message" says "$message"
  check "$name says nothing changed" says "Nothing was changed."
  check "$name leaves the live plugin untouched" untouched
done

# --- upgrade and rerun -------------------------------------------------------------

new_case upgrade
installed "$OLD"
run "$PINNED" "$HIS"
check "upgrade succeeds" status 0
check "upgrade prints its plan" says "Paperland is already installed from $PLUGIN_URL"
check "upgrade keeps setup unchanged" says "Keep your Paperland shortcut and autostart setup unchanged."
check "upgrade re-stages, swaps, then refreshes the runtime" calls "omarchy-shell [shell] [listPlugins]
git [config] [--file] [$P/.git/config] [--get] [remote.origin.url]
git [clone] [--quiet] [--no-checkout] [--single-branch] [--branch] [release] [--] [$PLUGIN_URL] [$STAGE]
git [-C] [$STAGE] [checkout] [--quiet] [--detach] [$SHA]
git [-C] [$STAGE] [rev-parse] [HEAD]
git [-C] [$STAGE] [status] [--porcelain] [--ignored]
omarchy-plugin-validate [$STAGE]
git [-C] [$P] [rev-parse] [HEAD]
omarchy-shell [-q] [shell] [rescanPlugins]
$P/paperland/paperland [install] [--no-setup]
git [-C] [$PREV] [status] [--porcelain] [--ignored]
git [-C] [$PREV] [merge-base] [--is-ancestor] [$SHA] [$OLD]"
check "upgrade publishes the pin" head_is "$SHA"
check "upgrade deletes a clean previous plugin" no_leftovers
check "upgrade does not re-enable an enabled plugin" not_called "[plugin] [enable]"
check "upgrade asks for a restart" says "Restart Paperland to finish: paperland stop && paperland start-hidden"

new_case rerun-at-pin
installed "$SHA"
run "$PINNED" "$HIS"
check "rerun at the pin succeeds" status 0
check "rerun at the pin still re-stages" called "git [clone]"
check "rerun at the pin still validates" called "omarchy-plugin-validate [~/.config/omarchy/.paperland-stage."
check "rerun at the pin replaces the checkout" called "[install] [--no-setup]"
check "rerun at the pin leaves nothing behind" no_leftovers

new_case upgrade-dirty-old
installed "$OLD"
echo " M Widget.qml" > "$home/.config/omarchy/plugins/json.paperland/.git/stub-status"
run "$PINNED" "$HIS"
check "upgrade over local changes succeeds" status 0
check "upgrade reports local changes and the backup" says "The replaced plugin had local changes; it is kept at"
check "upgrade keeps the changed plugin" [ -n "$(find "$home/.config/omarchy" -maxdepth 1 -name '.paperland-previous-*')" ]

new_case upgrade-old-newer
installed "$OLD"
run "$PINNED" STUB_OLD_NEWER=1 "$HIS"
check "a newer checkout is noted" says "Note: the replaced plugin was at $OLD, newer than this release"

new_case upgrade-restores-on-failure
installed "$OLD"
run "$PINNED" STUB_RUNTIME_FAILS=1 "$HIS"
check "a failure after the swap fails" status 1
check "a failure after the swap restores the previous plugin" head_is "$OLD"
check "a failure after the swap says so" says "The previous plugin was restored to"
check "a failure before the runtime refresh says no more" lacks "runtime had already been refreshed"
check "a failure after the swap leaves no staging or backup" no_leftovers

new_case repair-restores-on-setup-failure
installed "$OLD"
echo "-- user" > "$home/.config/hypr/hyprland.lua"
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "setup failure after the refresh restores the plugin" head_is "$OLD"
check "setup failure after the refresh reports the refreshed runtime" says "The Paperland runtime had already been refreshed to this release"

new_case repair-keeps-choices
installed "$OLD"
echo "-- user" > "$home/.config/hypr/hyprland.lua"
run "$PINNED" "$HIS"
check "repair succeeds" status 0
check "repair plan says saved choices apply" says "Your saved Paperland shortcut and autostart choices are applied again."
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "repair keeps the saved shortcut and autostart" called "~/.local/bin/paperland [setup] [--apply] [--replace-bindings]"
check "repair passes no defaults" not_called "[--shortcut]"

new_case repair-without-saved-choices
installed "$OLD"
rm "$home/.config/hypr/paperland.lua"
run "$PINNED" "$HIS"
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "repair without saved choices uses the defaults" called "~/.local/bin/paperland [setup] [--shortcut] [SUPER + M] [--autostart] [on] [--apply] [--replace-bindings]"

# --- uninstall ----------------------------------------------------------------------

new_case uninstall
installed "$SHA"
run "$UNINSTALL"
check "uninstall succeeds" status 0
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "uninstall order" calls "~/.local/bin/paperland [setup] [--shortcut] [none] [--resize] [system] [--autostart] [off] [--strip-chord] [none] [--apply]
~/.local/bin/paperland [uninstall]
git [config] [--file] [$P/.git/config] [--get] [remote.origin.url]
git [-C] [$P] [status] [--porcelain] [--ignored]
omarchy [plugin] [remove] [json.paperland] [--yes]"
check "uninstall reports success" says "Paperland is uninstalled."

new_case uninstall-linked-plugin
installed "$SHA"
rm -rf "$home/.config/omarchy/plugins/json.paperland"
mkdir -p "$home/.local/share/paperland/plugin"
ln -s "$home/.local/share/paperland/plugin" "$home/.config/omarchy/plugins/json.paperland"
run "$UNINSTALL"
check "uninstall with a linked plugin succeeds" status 0
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "uninstall removes the linked plugin first" calls "omarchy [plugin] [remove] [json.paperland] [--yes]
~/.local/bin/paperland [setup] [--shortcut] [none] [--resize] [system] [--autostart] [off] [--strip-chord] [none] [--apply]
~/.local/bin/paperland [uninstall]"

new_case uninstall-foreign-launcher
installed "$SHA"
rm "$home/.local/bin/paperland"
cp "$root/tests/stub.sh" "$home/.local/bin/paperland"
run "$UNINSTALL"
check "uninstall with a foreign launcher fails" status 1
check "uninstall never runs a foreign launcher" not_called "[setup]"
check "uninstall names the foreign launcher" says "not Paperland's launcher, or its runtime is missing; not run"
check "uninstall does not claim success" lacks "Paperland is uninstalled."
check "uninstall lists the remaining include" says "the marked Paperland include in"

new_case uninstall-missing-launcher
installed "$SHA"
rm "$home/.local/bin/paperland"
run "$UNINSTALL"
check "uninstall with a missing launcher fails" status 1
check "uninstall with a missing launcher runs nothing of Paperland's" not_called "[setup]"
check "uninstall lists the remaining runtime" says "(Paperland runtime)"
check "uninstall lists the remaining generated config" says "paperland.lua (generated Paperland config)"

new_case uninstall-dirty-plugin
installed "$SHA"
echo " M Widget.qml" > "$home/.config/omarchy/plugins/json.paperland/.git/stub-status"
run "$UNINSTALL"
check "uninstall keeps a copy of local changes" says "The plugin had local changes; a copy is kept at"
check "the copy exists" [ -n "$(find "$home/.config/omarchy" -maxdepth 2 -path '*/.paperland-removed-*/json.paperland')" ]

new_case uninstall-foreign-plugin
installed "$SHA"
run "$UNINSTALL" STUB_ORIGIN=https://github.com/someone/fork.git
check "uninstall leaves a foreign checkout" not_called "[plugin] [remove]"
check "uninstall names the foreign checkout" says "a checkout of https://github.com/someone/fork.git"

new_case uninstall-setup-fails
installed "$SHA"
run "$UNINSTALL" STUB_SETUP_STATUS=1
check "uninstall stops when setup fails" status 1
check "uninstall keeps the plugin when setup fails" not_called "[plugin] [remove]"

new_case uninstall-nothing
run "$UNINSTALL"
check "uninstall without an install" says "Paperland is not installed; nothing to do."

new_case uninstall-root
run "$UNINSTALL" STUB_UID=0
check "uninstall refuses root" says "Do not run this uninstaller as root"

if [ -n "${PAPERLAND_SRC:-}" ]; then
  # shellcheck disable=SC1091 # e2e.sh is checked on its own
  . "$root/tests/e2e.sh"
fi

case_dir=$work/all
mkdir -p "$case_dir"
cat "$work"/cases/*/log > "$case_dir/log"
: > "$case_dir/out"
check "every git call in every case was isolated" not_called "UNSAFE GIT"

printf '%s passed, %s failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
