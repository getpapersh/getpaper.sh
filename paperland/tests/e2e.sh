# shellcheck shell=sh disable=SC2154,SC2034 # work, root, bin, home, ARGS and helpers belong to tests/run.sh
# Sourced by tests/run.sh when PAPERLAND_SRC names a Paperland checkout.
# Publishes two releases from it (first run creates the orphan `release` branch,
# second run commits on top), then installs the first, upgrades to the second and
# uninstalls, with real git (behind tests/git-double.sh, which serves the release
# URL from a local repo), Python and Paperland's setup.py. Only Omarchy and Hyprland
# are stubs.
# Nothing is pushed: the release repo is the kept local work directory.

e2e=$work/e2e
mkdir -p "$e2e"
lacks_file() { ! grep -qF "$@"; }
python=$(python3 -c 'import sys; print(sys.executable)')

publish() { # REF RELEASE_REPO: prints the kept release work directory
  # Without Omarchy's validator here, publishing must opt out of validation explicitly.
  unvalidated=; command -v omarchy-plugin-validate >/dev/null 2>&1 || unvalidated=1
  PUBLISH_UNVALIDATED=$unvalidated TMPDIR=$e2e RELEASE_ENV=$e2e/release.env PAPERLAND_SOURCE_URL=$PAPERLAND_SRC PLUGIN_REPO=$2 \
    sh "$root/publish-plugin-release.sh" "$1" > "$e2e/publish.out" 2>&1 || {
    cat "$e2e/publish.out" >&2
    return 1
  }
  sed -n 's/^Not pushed. To publish: git -C \(.*\) push origin release$/\1/p' "$e2e/publish.out"
}

new_case e2e-publish
cp "$root/release.env" "$e2e/release.env"
git init --quiet --bare "$e2e/empty.git"
first=$(publish HEAD~1 "$e2e/empty.git")
check "first publish creates a release work dir" [ -d "$first/.git" ]
second=$(publish HEAD "$first")
if [ -z "$second" ]; then
  # An identical second package is pinned, not committed, so there is no second release.
  check "PAPERLAND_SRC's HEAD~1 and HEAD package differently (use a checkout whose last commit changes the package)" false
  return 0
fi
check "second publish builds on the first" [ "$(git -C "$second" rev-parse HEAD~1)" = "$(git -C "$first" rev-parse HEAD)" ]
pinned=$(sed -n 's/^PLUGIN_SHA=//p' "$e2e/release.env")
check "publish pins the new release commit" [ "$pinned" = "$(git -C "$second" rev-parse HEAD)" ]
check "release tree has manifest.json at its root" [ -f "$second/manifest.json" ]
check "release tree has Widget.qml at its root" [ -f "$second/Widget.qml" ]
check "release tree has the launcher" [ -x "$second/paperland/paperland" ]
check "publish keeps the default PLUGIN_URL" grep -qx 'PLUGIN_URL=https://github.com/getpapersh/paperland.git' "$e2e/release.env"
sh "$root/build.sh" "$e2e/release.env" "$e2e/site" >/dev/null
combine "$e2e/site"
first_sha=$(git -C "$first" rev-parse HEAD)
sed "s/^PLUGIN_SHA=.*/PLUGIN_SHA=$first_sha/" "$e2e/release.env" > "$e2e/release-first.env"
sh "$root/build.sh" "$e2e/release-first.env" "$e2e/site-first" >/dev/null
combine "$e2e/site-first"

new_case e2e-install
rm "$bin/git" "$bin/python3"
ln -s "$root/tests/git-double.sh" "$bin/git"
ln -s "$python" "$bin/python3"
# Omarchy's real validator where installed.
if command -v omarchy-plugin-validate >/dev/null 2>&1; then
  rm "$bin/omarchy-plugin-validate"
  ln -s "$(command -v omarchy-plugin-validate)" "$bin/omarchy-plugin-validate"
fi
real_git_env=REAL_GIT=$(command -v git)
mkdir -p "$home/.config/hypr"
printf '%s\n' "-- user config" "hl.config({general={layout='scrolling'}})" > "$home/.config/hypr/hyprland.lua"
run "$e2e/site-first/install" "$real_git_env" E2E_RELEASE_REPO="$first" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real install succeeds" status 0
check "real install verified the pinned commit" [ "$(git -C "$home/.config/omarchy/plugins/json.paperland" rev-parse HEAD)" = "$first_sha" ]
check "runtime launcher exists" [ -x "$home/.local/share/paperland/paperland" ]
check "binding targets the runtime launcher" grep -qF "$home/.local/share/paperland/paperland start-hidden && $home/.local/share/paperland/paperland toggle" "$home/.local/state/paperland/hypr/paperland.lua"
check "binding is SUPER + M" grep -qF 'hl.bind("SUPER + M"' "$home/.local/state/paperland/hypr/paperland.lua"
check "autostart is on" grep -qF 'hl.on("hyprland.start"' "$home/.local/state/paperland/hypr/paperland.lua"
check "include was added" grep -qF -- '-- BEGIN Paperland setup' "$home/.config/hypr/hyprland.lua"
check "the bar item runs the runtime launcher" grep -qF "$home/.local/share/paperland/paperland" "$home/.config/omarchy/shell.json"

# The user turns autostart off; an upgrade must keep that choice.
# shellcheck disable=SC2016 # $HOME expands inside the test HOME, not here
echo 'exec "$HOME/.local/bin/paperland" setup --autostart off --apply' > "$e2e/tweak.sh"
run "$e2e/tweak.sh" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "user setup change applies" lacks_file 'hl.on("hyprland.start"' "$home/.local/state/paperland/hypr/paperland.lua"

# Render a recognized former-layout fixture, including its ownership checksum.
PYTHONDONTWRITEBYTECODE=1 "$python" - "$home" <<'PYFIXTURE'
import json
from pathlib import Path
import runpy
import sys
home = Path(sys.argv[1])
setup = runpy.run_path(str(home / '.local/share/paperland/setup.py'))
current = home / '.local/state/paperland/hypr/paperland.lua'
options = json.loads(current.read_text().splitlines()[1].removeprefix('-- options: '))
former = home / '.config/hypr/paperland.lua'
former.write_text(setup['render'](options, str(former.with_name('paperland-workspace-names.lua'))))
PYFIXTURE
sed "s|$home/.local/state/paperland/hypr/|$home/.config/hypr/|g" "$home/.config/hypr/hyprland.lua" > "$e2e/former-main.lua"
cat "$e2e/former-main.lua" > "$home/.config/hypr/hyprland.lua"
rm "$home/.local/state/paperland/hypr/paperland.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real upgrade migrated the former generated file" [ ! -e "$home/.config/hypr/paperland.lua" ]
check "real upgrade migrated the include" grep -qF "$home/.local/state/paperland/hypr/paperland.lua" "$home/.config/hypr/hyprland.lua"
check "real upgrade succeeds" status 0
check "real upgrade reaches the new pin" [ "$(git -C "$home/.config/omarchy/plugins/json.paperland" rev-parse HEAD)" = "$pinned" ]
check "real upgrade refreshed the runtime" [ -n "$(find "$home/.local/share" -maxdepth 1 -name '.paperland-previous-*')" ]
check "real upgrade kept autostart off" lacks_file 'hl.on("hyprland.start"' "$home/.local/state/paperland/hypr/paperland.lua"
check "real upgrade kept the shortcut" grep -qF 'hl.bind("SUPER + M"' "$home/.local/state/paperland/hypr/paperland.lua"
check "real upgrade asks for a restart" says "Restart Paperland to finish"
check "real upgrade leaves no staging folder" no_stage_left
check "real upgrade keeps the replaced checkout" [ "$(git -C "$(find "$home/.config/omarchy" -maxdepth 2 -path '*/.paperland-previous-*/json.paperland')" rev-parse HEAD)" = "$first_sha" ]
check "real upgrade names the kept checkout" says "The replaced plugin is kept at"

run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real uninstall succeeds" status 0
check "include was removed" lacks_file -- '-- BEGIN Paperland setup' "$home/.config/hypr/hyprland.lua"
check "user config was kept" grep -qF -- '-- user config' "$home/.config/hypr/hyprland.lua"
check "generated config was removed" [ ! -e "$home/.local/state/paperland/hypr/paperland.lua" ]
check "launcher was removed" [ ! -e "$home/.local/bin/paperland" ]
check "plugin was removed" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]
check "the bar item was removed" lacks_file json.paperland "$home/.config/omarchy/shell.json"
check "uninstall kept a copy of the plugin" [ -n "$(find "$home/.config/omarchy" -maxdepth 2 -path '*/.paperland-removed-*/json.paperland')" ]
check "Paperland kept its backups" [ -d "$home/.local/state/paperland" ]

# Symlinked hyprland.lua: install stops after Paperland prints the include to paste,
# a rerun after pasting finishes, and uninstall gives the manual recipe.
mkdir -p "$home/dotfiles"
mv "$home/.config/hypr/hyprland.lua" "$home/dotfiles/hyprland.lua"
ln -s "$home/dotfiles/hyprland.lua" "$home/.config/hypr/hyprland.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "symlinked install stops for the paste" status 1
check "symlinked install shows Paperland's include" says "Symlinked main config needs a manual include"
check "symlinked install says where to paste" says "If Paperland printed lines to paste above, paste them into $home/dotfiles/hyprland.lua."
check "symlinked install keeps the plugin" [ "$(git -C "$home/.config/omarchy/plugins/json.paperland" rev-parse HEAD)" = "$pinned" ]
sed -n '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/p' "$case_dir/out" >> "$home/dotfiles/hyprland.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "symlinked install finishes after the paste" status 0
check "symlinked install never replaced the link" [ -L "$home/.config/hypr/hyprland.lua" ]
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "symlinked uninstall stops with the recipe" says "Delete the lines from '-- BEGIN Paperland setup' to '-- END Paperland setup' in $home/dotfiles/hyprland.lua"
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hyprland.lua" > "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hyprland.lua"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "symlinked uninstall finishes after the recipe" status 0
check "symlinked uninstall removed the launcher" [ ! -e "$home/.local/bin/paperland" ]
check "symlinked uninstall removed the plugin" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]

# --edit-dotfiles with real Paperland: the block goes into the link's target, the link
# and the target's mode stay, and Paperland's own check passes.
chmod 640 "$home/dotfiles/hyprland.lua"
ARGS=--edit-dotfiles
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
ARGS=
check "--edit-dotfiles install succeeds with real Paperland" status 0
check "--edit-dotfiles added the include to the target" grep -qF -- '-- BEGIN Paperland setup' "$home/dotfiles/hyprland.lua"
check "--edit-dotfiles kept the link" [ -L "$home/.config/hypr/hyprland.lua" ]
check "--edit-dotfiles kept the target's mode" [ "$(mode_of "$home/dotfiles/hyprland.lua")" = "-rw-r-----" ]
check "--edit-dotfiles left paperland.lua out of the dotfiles" [ ! -e "$home/dotfiles/paperland.lua" ]
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "a rerun after --edit-dotfiles passes Paperland's check" status 0

# A linked Hyprland directory follows the same consent and manual-detachment flow.
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hyprland.lua" > "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hyprland.lua"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real symlinked-file uninstall finishes without manual generated-file deletion" status 0
rm "$home/.config/hypr/hyprland.lua"
mv "$home/.config/hypr" "$home/dotfiles/hypr"
cp "$home/dotfiles/hyprland.lua" "$home/dotfiles/hypr/hyprland.lua"
ln -s "$home/dotfiles/hypr" "$home/.config/hypr"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real linked-folder install stops for manual include" status 1
check "real linked-folder install keeps the target unchanged" cmp -s "$home/dotfiles/hyprland.lua" "$home/dotfiles/hypr/hyprland.lua"
check "real linked-folder install stages generated config in state storage" [ -f "$home/.local/state/paperland/hypr/paperland.lua" ]
ARGS=--edit-dotfiles
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
ARGS=
check "real --edit-dotfiles supports the linked folder" status 0
check "real linked-folder install preserves the folder link" [ -L "$home/.config/hypr" ]
check "real linked-folder install writes no generated config into dotfiles" [ ! -e "$home/dotfiles/hypr/paperland.lua" ]
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real linked-folder uninstall requests manual detachment" status 1
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hypr/hyprland.lua" > "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hypr/hyprland.lua"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real linked-folder uninstall finishes after manual detachment" status 0
check "real linked-folder uninstall removes generated config" [ ! -e "$home/.local/state/paperland/hypr/paperland.lua" ]
check "real linked-folder uninstall removes launcher" [ ! -e "$home/.local/bin/paperland" ]
check "real linked-folder uninstall keeps the folder link" [ -L "$home/.config/hypr" ]

# A names-only former install must apply migration after the manual paste.
mv "$home/dotfiles/hypr/hyprland.lua" "$home/dotfiles/hypr/names-main.lua"
ln -s names-main.lua "$home/dotfiles/hypr/hyprland.lua"
check "names-only fixture main config is a symlink" [ -L "$home/.config/hypr/hyprland.lua" ]
check "names-only fixture has no former owned config" [ ! -e "$home/.config/hypr/paperland.lua" ]
printf '%s\n' '-- Paperland saved workspace names' 'hl.workspace_rule({ workspace = "2", default_name = "Saved research" })' > "$home/.config/hypr/paperland-workspace-names.lua"
cp "$home/.config/hypr/paperland-workspace-names.lua" "$e2e/saved-names.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real names-only install first stops for manual include" status 1
sed -n '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/p' "$case_dir/out" >> "$home/dotfiles/hypr/hyprland.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real names-only second run finishes" status 0
check "real names-only second run migrates saved names" cmp -s "$e2e/saved-names.lua" "$home/.local/state/paperland/hypr/paperland-workspace-names.lua"
# Detach and uninstall this fixture before setting up a former full config.
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hypr/hyprland.lua" > "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hypr/hyprland.lua"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real names-only fixture uninstalls" status 0

# Migrate a former full setup behind a linked folder; retain its old files.
PYTHONDONTWRITEBYTECODE=1 "$python" - "$home" "$second/paperland/setup.py" <<'PYFIXTURE'
from pathlib import Path
import runpy
import sys
home = Path(sys.argv[1])
setup = runpy.run_path(sys.argv[2])
former = home / '.config/hypr/paperland.lua'
options = {'shortcut': 'SUPER + M', 'resize': 'system', 'autostart': 'off',
           'launcher': str(home / '.local/share/paperland/paperland')}
former.write_text(setup['render'](options, str(former.with_name('paperland-workspace-names.lua'))))
main = home / '.config/hypr/hyprland.lua'
main.write_text('-- user\n-- BEGIN Paperland setup\ndofile("' + str(former) + '")\n-- END Paperland setup\n')
PYFIXTURE
cp "$home/dotfiles/hypr/hyprland.lua" "$e2e/old-dotfile-main.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real linked-folder migration first requests replacement" status 1
check "real linked-folder migration leaves old include unchanged" cmp -s "$e2e/old-dotfile-main.lua" "$home/dotfiles/hypr/hyprland.lua"
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hypr/hyprland.lua" > "$e2e/main.lua"
sed -n '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/p' "$case_dir/out" >> "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hypr/hyprland.lua"
run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real linked-folder migration second run finishes" status 0
check "real linked-folder migration keeps old generated config" [ -f "$home/dotfiles/hypr/paperland.lua" ]
check "real linked-folder migration keeps old saved names" cmp -s "$e2e/saved-names.lua" "$home/dotfiles/hypr/paperland-workspace-names.lua"
sed '/^-- BEGIN Paperland setup$/,/^-- END Paperland setup$/d' "$home/dotfiles/hypr/hyprland.lua" > "$e2e/main.lua"
cat "$e2e/main.lua" > "$home/dotfiles/hypr/hyprland.lua"
sed -n 's/^_G.paperland_setup_revision = "\([a-f0-9]*\)"$/\1/p' "$home/.local/state/paperland/hypr/paperland.lua" > "$e2e/active-revision"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1 STUB_REVISION_FILE="$e2e/active-revision" STUB_RELOAD_KEEPS_REVISION=1
check "real uninstall blocks a stale active revision after disk detachment" status 1
check "real stale-revision refusal keeps the launcher" [ -x "$home/.local/bin/paperland" ]
check "real stale-revision refusal keeps the plugin" [ -d "$home/.config/omarchy/plugins/json.paperland" ]
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1 STUB_REVISION_FILE="$e2e/active-revision"
check "real uninstall reload clears cached active revision" [ "$(cat "$e2e/active-revision")" = nil ]
check "real migrated-folder uninstall succeeds with retained old files" status 0
check "real migrated-folder uninstall retains detached old config" [ -f "$home/dotfiles/hypr/paperland.lua" ]
check "real migrated-folder uninstall reports retained old config" says "Retained detached generated file behind a symlink:"
check "real migrated-folder uninstall removes current generated config" [ ! -e "$home/.local/state/paperland/hypr/paperland.lua" ]
check "real migrated-folder uninstall removes launcher" [ ! -e "$home/.local/bin/paperland" ]
check "real migrated-folder uninstall does not suggest reinstalling" lacks "To repair, install again"
run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real later uninstall succeeds with retained old config" status 0
