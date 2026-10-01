# shellcheck shell=sh disable=SC2154 # work, root, bin, home and helpers come from tests/run.sh
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
check "second publish builds on the first" [ "$(git -C "$second" rev-parse HEAD~1)" = "$(git -C "$first" rev-parse HEAD)" ]
pinned=$(sed -n 's/^PLUGIN_SHA=//p' "$e2e/release.env")
check "publish pins the new release commit" [ "$pinned" = "$(git -C "$second" rev-parse HEAD)" ]
check "release tree has manifest.json at its root" [ -f "$second/manifest.json" ]
check "release tree has Widget.qml at its root" [ -f "$second/Widget.qml" ]
check "release tree has the launcher" [ -x "$second/paperland/paperland" ]
check "publish keeps the default PLUGIN_URL" grep -qx 'PLUGIN_URL=https://github.com/getpapersh/paperland.git' "$e2e/release.env"
sh "$root/build.sh" "$e2e/release.env" "$e2e/site" >/dev/null
first_sha=$(git -C "$first" rev-parse HEAD)
sed "s/^PLUGIN_SHA=.*/PLUGIN_SHA=$first_sha/" "$e2e/release.env" > "$e2e/release-first.env"
sh "$root/build.sh" "$e2e/release-first.env" "$e2e/site-first" >/dev/null

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
check "binding targets the runtime launcher" grep -qF "$home/.local/share/paperland/paperland start-hidden && $home/.local/share/paperland/paperland toggle" "$home/.config/hypr/paperland.lua"
check "binding is SUPER + M" grep -qF 'hl.bind("SUPER + M"' "$home/.config/hypr/paperland.lua"
check "autostart is on" grep -qF 'hl.on("hyprland.start"' "$home/.config/hypr/paperland.lua"
check "include was added" grep -qF -- '-- BEGIN Paperland setup' "$home/.config/hypr/hyprland.lua"

# The user turns autostart off; an upgrade must keep that choice.
# shellcheck disable=SC2016 # $HOME expands inside the test HOME, not here
echo 'exec "$HOME/.local/bin/paperland" setup --autostart off --apply' > "$e2e/tweak.sh"
run "$e2e/tweak.sh" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "user setup change applies" lacks_file 'hl.on("hyprland.start"' "$home/.config/hypr/paperland.lua"

run "$e2e/site/install" "$real_git_env" E2E_RELEASE_REPO="$second" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real upgrade succeeds" status 0
check "real upgrade reaches the new pin" [ "$(git -C "$home/.config/omarchy/plugins/json.paperland" rev-parse HEAD)" = "$pinned" ]
check "real upgrade refreshed the runtime" [ -n "$(find "$home/.local/share" -maxdepth 1 -name '.paperland-previous-*')" ]
check "real upgrade kept autostart off" lacks_file 'hl.on("hyprland.start"' "$home/.config/hypr/paperland.lua"
check "real upgrade kept the shortcut" grep -qF 'hl.bind("SUPER + M"' "$home/.config/hypr/paperland.lua"
check "real upgrade asks for a restart" says "Restart Paperland to finish"
check "real upgrade replaced a clean checkout without leftovers" no_leftovers

run "$e2e/site/uninstall" "$real_git_env" "$HIS" PYTHONDONTWRITEBYTECODE=1
check "real uninstall succeeds" status 0
check "include was removed" lacks_file -- '-- BEGIN Paperland setup' "$home/.config/hypr/hyprland.lua"
check "user config was kept" grep -qF -- '-- user config' "$home/.config/hypr/hyprland.lua"
check "generated config was removed" [ ! -e "$home/.config/hypr/paperland.lua" ]
check "launcher was removed" [ ! -e "$home/.local/bin/paperland" ]
check "plugin was removed" [ ! -e "$home/.config/omarchy/plugins/json.paperland" ]
check "Paperland kept its backups" [ -d "$home/.local/state/paperland" ]
