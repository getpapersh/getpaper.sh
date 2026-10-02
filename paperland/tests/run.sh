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
TEMPLATE="~/.config/omarchy/.paperland-stage.X/template"
# shellcheck disable=SC2088
PREV="~/.config/omarchy/.paperland-previous-X/json.paperland"

# Real tools the scripts may use; nothing else is reachable.
tools=$work/tools
mkdir -p "$tools"
for tool in bash env sed grep awk find head tail date mkdir mv readlink rm rmdir sleep mktemp cat cp ln touch chmod dirname sort cksum; do
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

# A real release repo for git-isolation cases, built without the caller's git setup.
real_git=$(command -v git)
fixture=$work/fixture
fgit() { GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$fixture" -c user.name=test -c user.email=test@example.com "$@"; }
mkdir -p "$fixture/paperland"
fgit init --quiet -b release
printf '{"id": "json.paperland"}\n' > "$fixture/manifest.json"
# shellcheck disable=SC2016 # a literal $Id$ keyword, which the ident attribute would expand
echo 'PINNED_BYTES $Id$' > "$fixture/Widget.qml"
cp "$root/tests/stub.sh" "$fixture/paperland/paperland"
fgit add -A
fgit commit --quiet -m fixture
build realgit "s/^PLUGIN_SHA=.*/PLUGIN_SHA=$(fgit rev-parse HEAD)/"
# A later release whose own .gitattributes rewrites bytes on checkout: the raw-bytes
# check must refuse it even with git fully isolated.
echo 'Widget.qml ident' > "$fixture/.gitattributes"
fgit add -A
fgit commit --quiet -m "attributes"
build realgit-attr "s/^PLUGIN_SHA=.*/PLUGIN_SHA=$(fgit rev-parse HEAD)/"

new_case() { # NAME: fresh HOME, stub bin and log
  case_dir=$work/cases/$1
  home=$case_dir/home
  bin=$case_dir/bin
  mkdir -p "$home" "$bin" "$case_dir/tmp"
  : > "$case_dir/log"
  for stub in $STUBS; do ln -s "$root/tests/stub.sh" "$bin/$stub"; done
  ln -s "$(command -v jq)" "$bin/jq"
}

ARGS=
run() { # SCRIPT [VAR=value...]: pipe SCRIPT into sh the way `curl | sh` does, with $ARGS as `sh -s -- $ARGS`
  script=$1
  shift
  # shellcheck disable=SC2086 # ARGS is a word list
  env -i HOME="$home" PATH="$bin:$tools" TMPDIR="$case_dir/tmp" LOG="$case_dir/log" \
    STUB="$root/tests/stub.sh" PAPER_YES=1 STUB_ORIGIN="$PLUGIN_URL" "$@" sh -s -- $ARGS < "$script" > "$case_dir/out" 2>&1
  echo $? > "$case_dir/status"
}
# shellcheck disable=SC2012 # one known test file; ls -l is the portable way to read its mode
mode_of() { ls -l "$1" | cut -c1-10; }

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
no_stage_left() { [ -z "$(find "$home/.config/omarchy" -maxdepth 1 -name '.paperland-stage.*' 2>/dev/null)" ]; }
previous_kept() { # HEAD: the replaced plugin is kept, whole, in one backup folder
  kept=$(find "$home/.config/omarchy" -maxdepth 2 -path '*/.paperland-previous-*/json.paperland')
  [ "$(cat "$kept/.git/stub-head" 2>/dev/null)" = "$1" ] && [ -f "$kept/paperland/paperland" ]
}
mv_wrapper() { # CASE_TEXT: a test-local mv; CASE_TEXT runs with the real mv as $real
  printf '#!/bin/sh\nreal=%s\n%s\n' "$tools/mv" "$1" > "$bin/mv"
  chmod +x "$bin/mv"
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
  if [ "${2:-}" != disabled ]; then
    touch "$home/.stub-enabled"
    # What enable plus `omarchy bar set ... executable` leave in shell.json.
    printf '{"bar":{"layout":{"left":[{"id":"json.paperland","executable":"%s"}],"center":[],"right":[]}}}\n' \
      "$home/.local/share/paperland/paperland" > "$home/.config/omarchy/shell.json"
  fi
}
bar_names_plugin() { grep -qF json.paperland "$home/.config/omarchy/shell.json" 2>/dev/null; }

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

new_case dev-omarchy-unreadable
run "$PINNED" STUB_OMARCHY="dev (abc123)" "$HIS"
check "a dev Omarchy without a readable version is refused" status 1
check "a dev Omarchy without a readable version says why" says "This system runs a development build of Omarchy (dev (abc123)) whose version could not be read"
check "a dev Omarchy without a readable version changes nothing" not_called "git [clone]"

new_case dev-omarchy-old
mkdir -p "$home/omarchy"
echo "3.9.0" > "$home/omarchy/version"
run "$PINNED" STUB_OMARCHY=dev OMARCHY_PATH="$home/omarchy/" "$HIS"
check "a dev Omarchy 3 is refused" says "Paperland needs Omarchy 4 or newer; this system has Omarchy 3.9.0."

new_case dev-omarchy-4
mkdir -p "$home/omarchy"
echo "4.0.0.alpha" > "$home/omarchy/version"
run "$PINNED" STUB_OMARCHY=dev OMARCHY_PATH="$home/omarchy" "$HIS"
check "a dev Omarchy 4 installs" status 0

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
git [clone] [--quiet] [--no-checkout] [--single-branch] [--branch] [release] [--template] [$TEMPLATE] [--] [$PLUGIN_URL] [$STAGE]
git [-C] [$STAGE] [checkout] [--quiet] [--detach] [$SHA]
git [-C] [$STAGE] [rev-parse] [HEAD]
git [-C] [$STAGE] [ls-tree] [-r] [--full-tree] [$SHA]
git [-C] [$STAGE] [hash-object] [--no-filters] [--stdin-paths]
omarchy-plugin-validate [$STAGE]
omarchy-shell [-q] [shell] [rescanPlugins]
omarchy [plugin] [enable] [json.paperland]
$P/paperland/paperland [install] [--no-setup]
omarchy [bar] [set] [json.paperland] [executable] [~/.local/share/paperland/paperland]
~/.local/bin/paperland [setup] [--shortcut] [SUPER + M] [--autostart] [on] [--apply] [--replace-bindings]"
check "install publishes the verified tree" head_is "$SHA"
check "install leaves no staging folder" no_leftovers
check "install never uses omarchy plugin add or update" not_called "[plugin] [add]"
check "install reports success" says "Paperland is installed at $SHA."
check "install warns when ~/.local/bin is not on PATH" says ".local/bin is not on PATH; add it to run 'paperland' in a terminal."
check "install documents the HTTPS uninstall" says "Uninstall: curl --proto '=https' --tlsv1.2 -fsSL https://getpaper.sh/uninstall | sh"

new_case fresh-git-isolated
run "$PINNED" "$HIS" GIT_DIR=/nonexistent GIT_WORK_TREE=/nonexistent GIT_CONFIG_GLOBAL="$home/evil" \
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=filter.evil.smudge GIT_CONFIG_VALUE_0=evil GIT_SSL_NO_VERIFY=1 \
  GIT_TEMPLATE_DIR="$home/evil" GIT_EXEC_PATH="$home/evil" GIT_COMMON_DIR="$home/evil" \
  GIT_CONFIG_PARAMETERS="'core.worktree'='/'"
check "git ignores the caller's GIT_DIR and config" status 0
check "no caller GIT_* variable reaches git" not_called "UNSAFE GIT"

# Real git, hostile setup: a smudge filter from GIT_CONFIG_COUNT and attributes from the
# XDG file, an attributesFile and a template must not change the published bytes.
new_case real-git-isolated
rm "$bin/git"
ln -s "$root/tests/git-double.sh" "$bin/git"
mkdir -p "$home/.config/git" "$home/template/info"
echo '* filter=evil' > "$home/.config/git/attributes"
echo '* filter=evil' > "$home/template/info/attributes"
echo '* ident' > "$home/attrs"
run "$work/build/realgit/install" "$HIS" REAL_GIT="$real_git" E2E_RELEASE_REPO="$fixture" \
  GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=filter.evil.smudge GIT_CONFIG_VALUE_0='sed s/PINNED_BYTES/TAMPERED/' \
  GIT_CONFIG_KEY_1=core.attributesFile GIT_CONFIG_VALUE_1="$home/attrs" GIT_TEMPLATE_DIR="$home/template" \
  GIT_CONFIG_PARAMETERS="'filter.evil.smudge'='sed s/PINNED_BYTES/TAMPERED/'" \
  GIT_DIR=/nonexistent GIT_WORK_TREE=/nonexistent
check "real git install with a hostile git setup succeeds" status 0
# shellcheck disable=SC2016 # the literal, unexpanded $Id$ keyword
check "real git publishes the pinned bytes" grep -qxF 'PINNED_BYTES $Id$' "$home/.config/omarchy/plugins/json.paperland/Widget.qml"

new_case real-git-rewritten-bytes
rm "$bin/git"
ln -s "$root/tests/git-double.sh" "$bin/git"
run "$work/build/realgit-attr/install" "$HIS" REAL_GIT="$real_git" E2E_RELEASE_REPO="$fixture"
check "real git refuses a checkout whose bytes differ from the pin" status 1
check "real git names the mismatch" says "does not match commit"
check "real git publishes nothing on a mismatch" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]
check "real git leaves no staging folder on a mismatch" no_leftovers

new_case fresh-wrong-pin
run "$PINNED" STUB_CHECKOUT_HEAD=ffffffffffffffffffffffffffffffffffffffff "$HIS"
check "fresh wrong pin fails" says "Integrity check failed: expected commit $SHA, got ffffffffffffffffffffffffffffffffffffffff. Nothing was changed."
check "fresh wrong pin publishes nothing" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]
check "fresh wrong pin leaves no staging folder" no_leftovers

new_case fresh-setup-fails
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "setup failure fails the install" status 1
check "setup failure says how to finish" says "Run the same command again to finish"

new_case rerun-keeps-disabled
installed "$SHA" disabled
run "$PINNED" "$HIS"
check "rerun with the widget off succeeds" status 0
check "rerun keeps the widget off" not_called "[plugin] [enable]"
check "rerun with the widget off sets nothing on the bar" not_called "[bar] [set]"
check "rerun with the widget off prints how to turn it on" says "The Paperland bar widget is off. To add it to your bar: omarchy plugin enable json.paperland && omarchy bar set json.paperland executable $home/.local/share/paperland/paperland"

# --- staged verification failures leave the live plugin untouched ----------------

for failure in \
  "wrong-pin|STUB_CHECKOUT_HEAD=ffffffffffffffffffffffffffffffffffffffff|Integrity check failed: expected commit $SHA" \
  "pin-missing|STUB_PIN_MISSING=1|The pinned release $SHA was not found on the plugin remote." \
  "dirty-tree|STUB_STAGE_DIRTY=1|The staged release does not match commit $SHA exactly." \
  "smudged|STUB_SMUDGE=1|The staged release does not match commit $SHA exactly." \
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
git [clone] [--quiet] [--no-checkout] [--single-branch] [--branch] [release] [--template] [$TEMPLATE] [--] [$PLUGIN_URL] [$STAGE]
git [-C] [$STAGE] [checkout] [--quiet] [--detach] [$SHA]
git [-C] [$STAGE] [rev-parse] [HEAD]
git [-C] [$STAGE] [ls-tree] [-r] [--full-tree] [$SHA]
git [-C] [$STAGE] [hash-object] [--no-filters] [--stdin-paths]
omarchy-plugin-validate [$STAGE]
git [-C] [$P] [rev-parse] [HEAD]
omarchy-shell [-q] [shell] [rescanPlugins]
$P/paperland/paperland [install] [--no-setup]
omarchy [bar] [set] [json.paperland] [executable] [~/.local/share/paperland/paperland]
git [-C] [$PREV] [merge-base] [--is-ancestor] [$SHA] [$OLD]"
check "upgrade publishes the pin" head_is "$SHA"
check "upgrade keeps the previous plugin" previous_kept "$OLD"
check "upgrade names the kept previous plugin" says "The replaced plugin is kept at $home/.config/omarchy/.paperland-previous-"
check "upgrade leaves no staging folder" no_stage_left
check "upgrade does not re-enable an enabled plugin" not_called "[plugin] [enable]"
check "upgrade asks for a restart" says "Restart Paperland to finish: paperland stop && paperland start-hidden"

new_case rerun-at-pin
installed "$SHA"
run "$PINNED" "$HIS"
check "rerun at the pin succeeds" status 0
check "rerun at the pin still re-stages" called "git [clone]"
check "rerun at the pin still validates" called "omarchy-plugin-validate [~/.config/omarchy/.paperland-stage."
check "rerun at the pin replaces the checkout" called "[install] [--no-setup]"
check "rerun at the pin leaves no staging folder" no_stage_left
check "rerun at the pin keeps the replaced checkout" previous_kept "$SHA"

new_case upgrade-hidden-changes
installed "$OLD"
# git status cannot be trusted to show work (assume-unchanged, core.worktree, unpushed commits).
echo "local work" > "$home/.config/omarchy/plugins/json.paperland/notes.txt"
run "$PINNED" "$HIS"
check "upgrade over a checkout that looks clean succeeds" status 0
check "upgrade never runs git status in the old checkout" not_called "[status]"
check "upgrade keeps the work in the replaced checkout" [ -f "$(find "$home/.config/omarchy" -maxdepth 3 -path '*/.paperland-previous-*/json.paperland/notes.txt')" ]

new_case upgrade-old-newer
installed "$OLD"
run "$PINNED" STUB_OLD_NEWER=1 "$HIS"
check "a newer checkout is noted" says "Note: the replaced plugin was at $OLD, newer than this release"

new_case upgrade-restores-on-failure
installed "$OLD"
run "$PINNED" STUB_RUNTIME_FAILS=1 "$HIS"
check "a failed runtime refresh fails" status 1
check "a failed runtime refresh restores the previous plugin" head_is "$OLD"
check "a failed runtime refresh says so" says "The previous plugin was restored to"
check "a failed runtime refresh leaves no staging or backup" no_leftovers

new_case repair-keeps-new-on-setup-failure
installed "$OLD"
echo "-- user" > "$home/.config/hypr/hyprland.lua"
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "setup failure after the refresh fails" status 1
check "setup failure after the refresh keeps the new plugin with the new runtime" head_is "$SHA"
check "setup failure after the refresh keeps the previous plugin" previous_kept "$OLD"
check "setup failure after the refresh names the previous plugin" says "The replaced plugin is kept at"
check "setup failure after the refresh gives its rm command" says "Delete it when you no longer need it: rm -rf '$home/.config/omarchy/.paperland-previous-"
check "setup failure after the refresh says how to finish" says "Run the same command again to finish"
check "setup failure after the refresh restores nothing" lacks "was restored"

# A TERM right after a rename, before the script records it, must still be undone.
new_case term-after-publish
installed "$OLD"
# shellcheck disable=SC2016 # expands in the wrapper
mv_wrapper 'case "$1" in */.paperland-stage.*) "$real" "$@" || exit; kill -TERM "$PPID"; exit 0 ;; esac; exec "$real" "$@"'
run "$PINNED" "$HIS"
check "TERM after publishing fails" status 130
check "TERM after publishing restores the previous plugin" head_is "$OLD"
check "TERM after publishing does not nest the plugins" [ ! -e "$home/.config/omarchy/plugins/json.paperland/json.paperland" ]
check "TERM after publishing says so" says "The previous plugin was restored to"
check "TERM after publishing leaves no staging or backup" no_leftovers

new_case term-after-move-aside
installed "$OLD"
# shellcheck disable=SC2016 # expands in the wrapper
mv_wrapper 'case "$2" in */.paperland-previous-*) "$real" "$@" || exit; kill -TERM "$PPID"; exit 0 ;; esac; exec "$real" "$@"'
run "$PINNED" "$HIS"
check "TERM after moving aside fails" status 130
check "TERM after moving aside restores the previous plugin" head_is "$OLD"
check "TERM after moving aside says so" says "The previous plugin was restored to"

new_case rollback-mv-fails
installed "$OLD"
# shellcheck disable=SC2016 # expands in the wrapper
mv_wrapper 'case "$1" in */.paperland-previous-*) exit 1 ;; esac; exec "$real" "$@"'
run "$PINNED" STUB_RUNTIME_FAILS=1 "$HIS"
check "a failed restore fails" status 1
check "a failed restore keeps the previous plugin" previous_kept "$OLD"
check "a failed restore names it and the command" says "Could not restore the previous plugin to $home/.config/omarchy/plugins/json.paperland. Restore it with: mv '$home/.config/omarchy/.paperland-previous-"
check "a failed restore with an empty plugin path gives only the mv" lacks "Once"
check "a failed restore claims nothing" lacks "was restored"

# A second signal while cleanup runs must not abort the restore.
new_case second-signal-in-cleanup
installed "$OLD"
# shellcheck disable=SC2016 # expands in the wrapper
mv_wrapper 'case "$2" in */failed-json.paperland) "$real" "$@" || exit; kill -TERM "$PPID"; exit 0 ;; esac; exec "$real" "$@"'
run "$PINNED" STUB_RUNTIME_FAILS=1 "$HIS"
check "a signal during cleanup still restores the previous plugin" head_is "$OLD"
check "a signal during cleanup still says so" says "The previous plugin was restored to"
check "a signal during cleanup leaves no staging or backup" no_leftovers

new_case signal-during-refresh
installed "$OLD"
mv "$home/.config/hypr/hyprland.lua" "$home/hyprland.lua"
grep -v "Paperland setup" "$home/hyprland.lua" > "$home/hyprland.lua.tmp" && mv "$home/hyprland.lua.tmp" "$home/hyprland.lua"
ln -s "$home/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$PINNED" STUB_INSTALL_TERM=1 "$HIS"
check "a signal during the refresh exits on the signal" status 130
check "a signal during the refresh keeps the new plugin" head_is "$SHA"
check "a signal during the refresh keeps the previous plugin" previous_kept "$OLD"
check "a signal during the refresh says the runtime may be unfinished" says "The Paperland runtime may not have finished installing. Run the same command again to finish"
check "a signal before setup asks for no paste" lacks "Paste the lines"
check "a signal before setup runs no setup" not_called "[setup]"

# Something creates the plugin folder between the check and the rename.
new_case publish-race
installed "$OLD"
# shellcheck disable=SC2016 # expands in the wrapper
mv_wrapper 'case "$1" in */.paperland-stage.*) mkdir "$2"; touch "$2/foreign" ;; esac; exec "$real" "$@"'
run "$PINNED" "$HIS"
check "a folder appearing at publish fails" status 1
check "a folder appearing at publish says so" says "Something else created"
check "a folder appearing at publish keeps that folder whole" [ -f "$home/.config/omarchy/plugins/json.paperland/foreign" ]
check "a folder appearing at publish nests nothing in it" [ ! -e "$home/.config/omarchy/plugins/json.paperland/json.paperland" ]
check "a folder appearing at publish keeps the previous plugin" previous_kept "$OLD"

new_case symlinked-main-config
mkdir -p "$home/dotfiles" "$home/.config/hypr"
echo "-- user" > "$home/dotfiles/hyprland.lua"
ln -s "$home/dotfiles/hyprland.lua" "$home/.config/hypr/hyprland.lua"
# Paperland's setup stages paperland.lua, prints the include to paste, and exits 1.
run "$PINNED" "$HIS"
check "a symlinked hyprland.lua plan names the link's target" says "hyprland.lua is a symlink to"
check "a symlinked hyprland.lua plan says it is not edited by default" says "which this installer does not edit by default"
check "a symlinked hyprland.lua plan offers --edit-dotfiles" says "or rerun with --edit-dotfiles"
check "a symlinked hyprland.lua stops after setup" status 1
check "a symlinked hyprland.lua is not written by default" [ "$(cat "$home/dotfiles/hyprland.lua")" = "-- user" ]
check "a symlinked hyprland.lua stays a link by default" [ -L "$home/.config/hypr/hyprland.lua" ]
check "a symlinked hyprland.lua keeps the installed plugin" head_is "$SHA"
check "a symlinked hyprland.lua says what to paste where" says "If Paperland printed lines to paste above, paste them into $home/dotfiles/hyprland.lua."
check "a symlinked hyprland.lua does not claim a restore" lacks "was restored"

new_case symlinked-main-config-upgrade
installed "$OLD"
mv "$home/.config/hypr/hyprland.lua" "$home/hyprland.lua"
grep -v "Paperland setup" "$home/hyprland.lua" > "$home/hyprland.lua.tmp" && mv "$home/hyprland.lua.tmp" "$home/hyprland.lua"
ln -s "$home/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "a symlinked upgrade keeps the new plugin" head_is "$SHA"
check "a symlinked upgrade keeps the previous plugin" previous_kept "$OLD"
check "a symlinked upgrade says what to paste where" says "If Paperland printed lines to paste above, paste them into $home/hyprland.lua."

new_case symlinked-main-validated
installed "$OLD"
mv "$home/.config/hypr/hyprland.lua" "$home/hyprland.lua"
ln -s "$home/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$PINNED" "$HIS"
check "a pasted include behind a symlink installs" status 0
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "a pasted include behind a symlink is validated by Paperland" called "~/.local/bin/paperland [setup] [--dry-run]"

new_case symlinked-main-invalid
installed "$OLD"
mv "$home/.config/hypr/hyprland.lua" "$home/hyprland.lua"
ln -s "$home/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
check "a pasted include Paperland rejects fails the run" status 1
check "a pasted include Paperland rejects says where to fix it" says "Paperland did not accept the Paperland lines in $home/hyprland.lua"

# --edit-dotfiles: the block Paperland prints goes into the link's target, in place.
new_case symlinked-main-edit
mkdir -p "$home/dotfiles" "$home/.config/hypr"
printf '%s' "-- user" > "$home/dotfiles/hyprland.lua"
chmod 640 "$home/dotfiles/hyprland.lua"
ln -s "$home/dotfiles/hyprland.lua" "$home/.config/hypr/hyprland.lua"
ARGS=--edit-dotfiles
run "$PINNED" "$HIS"
ARGS=
check "--edit-dotfiles installs" status 0
check "--edit-dotfiles plan says what it edits" says "With --edit-dotfiles, add Paperland's marked include to"
check "--edit-dotfiles says what it edited" says "Added Paperland's include to $home/dotfiles/hyprland.lua"
check "--edit-dotfiles keeps the link" [ -L "$home/.config/hypr/hyprland.lua" ]
check "--edit-dotfiles keeps the target's mode" [ "$(mode_of "$home/dotfiles/hyprland.lua")" = "-rw-r-----" ]
check "--edit-dotfiles keeps the user's lines" [ "$(head -n 1 "$home/dotfiles/hyprland.lua")" = "-- user" ]
check "--edit-dotfiles writes the exact block once" [ "$(sed -n '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/p' "$home/dotfiles/hyprland.lua")" = "$(printf '%s\n' "-- BEGIN Paperland setup" "dofile(\"$home/.config/hypr/paperland.lua\")" "-- END Paperland setup")" ]
check "--edit-dotfiles writes nothing else into the dotfiles" [ "$(find "$home/dotfiles" -type f | wc -l | tr -d ' ')" = 1 ]
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "--edit-dotfiles has Paperland check the result" called "~/.local/bin/paperland [setup] [--dry-run]"

new_case symlinked-main-edit-invalid
mkdir -p "$home/dotfiles" "$home/.config/hypr"
echo "-- user" > "$home/dotfiles/hyprland.lua"
ln -s "$home/dotfiles/hyprland.lua" "$home/.config/hypr/hyprland.lua"
ARGS=--edit-dotfiles
run "$PINNED" STUB_SETUP_STATUS=1 "$HIS"
ARGS=
check "--edit-dotfiles fails when Paperland rejects the result" status 1
check "--edit-dotfiles says Paperland rejected it" says "Paperland did not accept the Paperland lines in $home/dotfiles/hyprland.lua"

new_case symlinked-main-edit-other-error
mkdir -p "$home/dotfiles" "$home/.config/hypr"
echo "-- user" > "$home/dotfiles/hyprland.lua"
ln -s "$home/dotfiles/hyprland.lua" "$home/.config/hypr/hyprland.lua"
ARGS=--edit-dotfiles
run "$PINNED" STUB_SETUP_OTHER_ERROR=1 "$HIS"
ARGS=
check "--edit-dotfiles stops when setup fails for another reason" status 1
check "--edit-dotfiles says the file was not edited" says "so $home/dotfiles/hyprland.lua was not edited"
check "--edit-dotfiles leaves the target alone on another failure" [ "$(cat "$home/dotfiles/hyprland.lua")" = "-- user" ]

new_case symlinked-config-folder
mkdir -p "$home/dotfiles/hypr" "$home/.config"
echo "-- user" > "$home/dotfiles/hypr/hyprland.lua"
ln -s "$home/dotfiles/hypr" "$home/.config/hypr"
run "$PINNED" "$HIS"
check "a symlinked Hyprland folder is refused" status 1
check "a symlinked Hyprland folder names the link and its target" says "$home/.config/hypr is a symlink to $home/dotfiles/hypr"
check "a symlinked Hyprland folder says why" says "Paperland's setup writes its generated files into $home/.config/hypr"
check "a symlinked Hyprland folder says it will be lifted" says "This is lifted once Paperland keeps its generated files outside $home/.config/hypr."
check "a symlinked Hyprland folder changes nothing" not_called "git [clone]"
ARGS=--edit-dotfiles
run "$PINNED" "$HIS"
ARGS=
check "--edit-dotfiles does not lift the folder refusal" status 1
check "--edit-dotfiles says it does not apply to a folder" says "--edit-dotfiles does not lift this yet."
check "--edit-dotfiles with a symlinked folder changes nothing" not_called "git [clone]"

new_case options
ARGS=--help
run "$PINNED" "$HIS"
check "--help succeeds" status 0
check "--help lists --edit-dotfiles" says "--edit-dotfiles"
check "--help changes nothing" not_called "omarchy"
ARGS=--bogus
run "$PINNED" "$HIS"
check "an unknown option is refused" status 1
check "an unknown option is named" says "Unknown option: --bogus"
ARGS=--edit-dotfiles
run "$PINNED" STUB_OS=Darwin
check "--edit-dotfiles is refused on macOS" says "--edit-dotfiles applies only to Paperland on Linux"
installed "$SHA"
run "$UNINSTALL"
ARGS=
check "the uninstaller refuses --edit-dotfiles" status 1
check "the uninstaller says why" says "--edit-dotfiles applies only to the installer"
check "the uninstaller runs nothing with --edit-dotfiles" not_called "[setup]"

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
check "uninstall order" calls "omarchy-shell [shell] [listPlugins]
~/.local/bin/paperland [setup] [--shortcut] [none] [--resize] [system] [--autostart] [off] [--strip-chord] [none] [--apply]
git [config] [--file] [$P/.git/config] [--get] [remote.origin.url]
omarchy [plugin] [remove] [json.paperland] [--yes]
~/.local/bin/paperland [uninstall]"
check "uninstall removes the widget's bar item" fails bar_names_plugin
check "uninstall reports success" says "Paperland is uninstalled."
check "uninstall keeps a copy of the checkout" [ -f "$(find "$home/.config/omarchy" -maxdepth 4 -path '*/.paperland-removed-*/json.paperland/paperland/paperland')" ]
check "uninstall names the copy" says "A copy of the plugin is kept at $home/.config/omarchy/.paperland-removed-"
check "uninstall gives the copy's rm command" says "Delete it when you no longer need it: rm -rf '$home/.config/omarchy/.paperland-removed-"

new_case uninstall-lists-backups
installed "$SHA"
mkdir -p "$home/.config/omarchy/.paperland-previous-20261001-000000.abc123/json.paperland"
run "$UNINSTALL"
check "uninstall lists the installer's kept plugins" says "Kept by earlier installs: $home/.config/omarchy/.paperland-previous-20261001-000000.abc123 (delete with: rm -rf '$home/.config/omarchy/.paperland-previous-20261001-000000.abc123')"
check "uninstall keeps the installer's kept plugins" [ -d "$home/.config/omarchy/.paperland-previous-20261001-000000.abc123/json.paperland" ]

new_case uninstall-linked-plugin
installed "$SHA"
rm -rf "$home/.config/omarchy/plugins/json.paperland"
mkdir -p "$home/.local/share/paperland/plugin"
ln -s "$home/.local/share/paperland/plugin" "$home/.config/omarchy/plugins/json.paperland"
run "$UNINSTALL"
check "uninstall with a linked plugin succeeds" status 0
# shellcheck disable=SC2088 # literal ~: the stub logs $HOME as ~
check "uninstall removes the linked plugin first" calls "omarchy-shell [shell] [listPlugins]
omarchy [plugin] [remove] [json.paperland] [--yes]
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

new_case uninstall-hidden-changes
installed "$SHA"
echo "local work" > "$home/.config/omarchy/plugins/json.paperland/notes.txt"
run "$UNINSTALL"
check "uninstall never runs git status in the checkout" not_called "[status]"
check "uninstall keeps work git status may not show" [ -f "$(find "$home/.config/omarchy" -maxdepth 3 -path '*/.paperland-removed-*/json.paperland/notes.txt')" ]

new_case uninstall-shell-down
installed "$SHA"
run "$UNINSTALL" STUB_SHELL_DOWN=1
check "uninstall with omarchy-shell down fails" status 1
check "uninstall with omarchy-shell down says why" says "omarchy-shell is not running"
check "uninstall with omarchy-shell down changes nothing" not_called "[setup]"
check "uninstall with omarchy-shell down keeps the plugin" head_is "$SHA"

new_case uninstall-symlinked-main
installed "$SHA"
mv "$home/.config/hypr/hyprland.lua" "$home/hyprland.lua"
ln -s "$home/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$UNINSTALL"
check "uninstall with a symlinked hyprland.lua stops" status 1
check "uninstall with a symlinked hyprland.lua runs nothing" not_called "[setup]"
check "uninstall with a symlinked hyprland.lua keeps the plugin" head_is "$SHA"
check "uninstall with a symlinked hyprland.lua gives the recipe" says "Delete the lines from '-- BEGIN Paperland setup' to '-- END Paperland setup' in $home/hyprland.lua"
check "uninstall with a symlinked hyprland.lua says to delete paperland.lua" says "rm '$home/.config/hypr/paperland.lua'"
check "uninstall with a symlinked hyprland.lua says to rerun" says "Then run this uninstaller again."
check "uninstall with a symlinked hyprland.lua does not blame setup" lacks "could not remove its shortcuts"
# After the recipe, Paperland's setup changes nothing and its files-only uninstall runs.
mv "$home/.config/hypr/paperland.lua" "$home/paperland.lua.removed"
printf '%s\n' "-- user" > "$home/hyprland.lua"
run "$UNINSTALL"
check "uninstall after the recipe succeeds" status 0
check "uninstall after the recipe removes the plugin" called "omarchy [plugin] [remove] [json.paperland] [--yes]"

new_case uninstall-symlinked-folder
installed "$SHA"
mv "$home/.config/hypr" "$home/hypr"
ln -s "$home/hypr" "$home/.config/hypr"
run "$UNINSTALL"
check "uninstall with a symlinked Hyprland folder stops" status 1
check "uninstall with a symlinked Hyprland folder runs nothing" not_called "[setup]"
check "uninstall with a symlinked Hyprland folder removes the runtime by hand" says "rm '$home/.local/bin/paperland' && rm -rf '$home/.local/share/paperland'"
# The recipe, then the second pass.
printf '%s\n' "-- user" > "$home/hypr/hyprland.lua"
rm "$home/hypr/paperland.lua" "$home/.local/bin/paperland"
rm -rf "$home/.local/share/paperland"
run "$UNINSTALL"
check "uninstall after the folder recipe succeeds" status 0
check "uninstall after the folder recipe removes the plugin" called "omarchy [plugin] [remove] [json.paperland] [--yes]"

new_case uninstall-worktree-plugin
installed "$SHA"
# A plugin folder whose .git is a file (a linked worktree) is not this installer's checkout.
rm -rf "$home/.config/omarchy/plugins/json.paperland/.git"
echo "gitdir: /elsewhere" > "$home/.config/omarchy/plugins/json.paperland/.git"
echo "local work" > "$home/.config/omarchy/plugins/json.paperland/notes.txt"
run "$UNINSTALL"
check "uninstall keeps a copy of any real plugin folder" [ -f "$(find "$home/.config/omarchy" -maxdepth 3 -path '*/.paperland-removed-*/json.paperland/notes.txt')" ]

# Install, rerun and uninstall in one HOME: the rerun keeps the bar item, and the
# uninstall gets past Paperland's check on shell.json.
new_case lifecycle
mkdir -p "$home/.config/hypr"
echo "-- user" > "$home/.config/hypr/hyprland.lua"
run "$PINNED" "$HIS"
check "lifecycle install succeeds" status 0
check "lifecycle install points the bar item at the runtime launcher" \
  grep -qF "$home/.local/share/paperland/paperland" "$home/.config/omarchy/shell.json"
run "$PINNED" "$HIS"
check "lifecycle rerun succeeds" status 0
run "$UNINSTALL"
check "lifecycle uninstall succeeds" status 0
check "lifecycle uninstall removes the bar item" fails bar_names_plugin
check "lifecycle uninstall removes the runtime" [ ! -e "$home/.local/share/paperland" ]

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

# --- publish-plugin-release.sh ---------------------------------------------------------

# A failed default-branch check after --push must be retryable: the rerun pins the
# release it already pushed instead of dying on an identical package.
new_case publish-retry
src=$case_dir/src
plugin_repo=$case_dir/plugin.git
pgit() { GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -c user.name=test -c user.email=test@example.com "$@"; }
pgit init --quiet -b main "$src"
# A package Omarchy's validator accepts, where it is installed.
printf '%s\n' '{"schemaVersion": 1, "id": "json.paperland", "name": "Paperland", "version": "0.0.1",' \
  ' "kinds": ["bar-widget"], "entryPoints": {"barWidget": "Widget.qml"}}' > "$src/manifest.json"
printf '%s\n' 'import QtQuick' 'Item {}' > "$src/Widget.qml"
# shellcheck disable=SC2016 # expands in the generated packager
printf '%s\n' '#!/bin/sh' 'mkdir -p "$1"' 'cp "$(dirname "$0")/manifest.json" "$(dirname "$0")/Widget.qml" "$1/"' > "$src/package-omarchy"
chmod +x "$src/package-omarchy"
pgit -C "$src" add -A
pgit -C "$src" commit --quiet -m source
pgit init --quiet --bare -b main "$plugin_repo"
cp "$root/release.env" "$case_dir/release.env"
publish_push() {
  env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com \
    GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com PUBLISH_UNVALIDATED=1 TMPDIR="$case_dir/tmp" \
    RELEASE_ENV="$case_dir/release.env" PAPERLAND_SOURCE_URL="$src" PLUGIN_REPO="$plugin_repo" \
    sh "$root/publish-plugin-release.sh" --push HEAD > "$case_dir/out" 2>&1
  echo $? > "$case_dir/status"
}
publish_push
pushed=$(pgit --git-dir="$plugin_repo" rev-parse refs/heads/release)
check "publish stops when the default branch is not release" status 1
check "publish names the pushed release it could not pin" says "then rerun to pin the pushed release $pushed."
check "publish leaves release.env unpinned" grep -qx 'PLUGIN_SHA=PENDING' "$case_dir/release.env"
pgit --git-dir="$plugin_repo" symbolic-ref HEAD refs/heads/release
publish_push
check "publish rerun succeeds" status 0
check "publish rerun pins the pushed release" grep -qx "PLUGIN_SHA=$pushed" "$case_dir/release.env"
check "publish rerun pushes nothing new" [ "$(pgit --git-dir="$plugin_repo" rev-parse refs/heads/release)" = "$pushed" ]

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
