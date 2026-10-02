# Paperland installer (disabled)

This folder holds the Omarchy-plugin installer and uninstaller for Paperland. **It is
not served and must not be inlined into `../install`**, which prints "Paperland
install is coming soon" on Linux. It is parked here until "Hyprland next" (PAPER-7),
and needs the checks under "Not yet proven" before it ships.

## Files

| Path | Purpose |
| --- | --- |
| `install`, `uninstall` | Sources; `build.sh` inlines `release.env` into them. |
| `release.env` | Plugin URL, pinned release commit (`PENDING`), minimum Hyprland. |
| `build.sh` | `build.sh RELEASE_ENV OUT_DIR` builds runnable copies. |
| `publish-plugin-release.sh` | Packages a Paperland ref onto the plugin repo's `release` branch and pins it. |
| `tests/` | `sh tests/run.sh` (stubbed), and `PAPERLAND_SRC=/path/to/paperland sh tests/run.sh` for a real-`setup.py` run. |

## Design, in short

The installer clones the pinned commit into `~/.config/omarchy/.paperland-stage.*`,
outside the `plugins/` folder that omarchy-shell watches, with git isolated from the
caller (every inherited `GIT_*` variable dropped, no global, system or attributes
files, an empty private template, verified TLS, HTTPS only). It verifies the copy
(pinned HEAD, no symlinks, every file's raw bytes hashing to the pinned tree's blob
with `hash-object --no-filters`, manifest id, `omarchy-plugin-validate`), then
publishes it with one rename. A rerun renames the installed plugin into
`~/.config/omarchy/.paperland-previous-*` first and always keeps it there. It then
refreshes Paperland's runtime with `paperland install --no-setup`, points the bar
widget at the runtime's launcher (`omarchy bar set json.paperland executable ...`,
which writes the setting into the widget's item in `~/.config/omarchy/shell.json`),
and runs `paperland setup` only when the launcher, `paperland.lua` or the include is
missing, keeping saved choices.

Failures: up to the runtime refresh, cleanup works out the state from the real
staged, live and moved-aside paths (never from flags a signal can interrupt), ignores
further signals while it runs, and puts the previous plugin back, never renaming into
an occupied path. Once the refresh has started, the new plugin stays and a rerun
finishes the job; after a signal during the refresh the run says the runtime may not
have finished installing.

Only a first install enables the widget; a rerun leaves a disabled widget off and
prints the command to turn it on. A development Omarchy (`omarchy-version` prints
`dev...`) is accepted when `$OMARCHY_PATH/version` says 4 or newer.

Symlinked Hyprland config (dotfiles): the installer detects a symlinked
`hyprland.lua`, `~/.config/hypr` or any parent, and names where it points. It never
reads stdin, so there is no prompt; the choice is a flag:

- **Default, symlinked `hyprland.lua`:** the installer never writes into the
  dotfiles. Paperland's setup stages `paperland.lua` and prints the marked include
  block; the run stops and asks you to paste it into the link's target and rerun.
  The rerun has Paperland check the pasted lines with `paperland setup --dry-run`.
- **`--edit-dotfiles`** (`curl … | sh -s -- --edit-dotfiles`, listed in `--help`):
  the installer appends exactly the block Paperland printed to the file
  `hyprland.lua` links to, in place, so the link stays a link and the file keeps its
  mode and owner. Then Paperland checks it with `setup --dry-run`, and the run fails
  if that does not pass. It edits only for a plain "add these exact lines" request;
  a block to replace, lines to remove, or any other setup error stops with the file
  untouched. Paperland's generated files never go into the dotfiles. Hyprland loads
  the include on its next config reload.
- **Symlinked `~/.config/hypr` (or a parent):** refused before any change, with or
  without the flag, because Paperland's setup writes its generated files into
  `~/.config/hypr` and refuses any symlinked folder above them. The message names
  the link's target and says this is lifted once Paperland keeps its generated
  files outside `~/.config/hypr`.
- `--edit-dotfiles` is refused on macOS and by the uninstaller, which takes no
  options. For a symlinked config the uninstaller prints the manual steps instead
  of running Paperland's setup or uninstall.

Backups: every upgrade keeps the replaced plugin in
`~/.config/omarchy/.paperland-previous-*`, and every uninstall keeps a copy in
`~/.config/omarchy/.paperland-removed-*`. Nothing prunes them. Each is printed with
its `rm -rf` command when it is made, and the uninstaller lists the installer's
kept copies with theirs.

Uninstall order: Paperland's setup removes the shortcuts; a copy of the plugin folder
is kept in `~/.config/omarchy/.paperland-removed-*`; `omarchy plugin remove` takes the
widget's item (and its `executable`) out of `shell.json`; then Paperland's own
uninstall runs, which refuses while `shell.json` still names the launcher. It stops
before changing anything if omarchy-shell is not running.

## Review findings

From the second correctness, security, requirements and product reviews of
getpaper.sh `b17510a`, and two independent reviews of the fixes. Each is fixed in
the scripts with a test in `tests/`. Every such test fails on the scripts before its
fix, except `real-git-rewritten-bytes`, which adds coverage for a check that already
existed. The tests stub Omarchy and Hyprland (see "Not yet proven" below):

1. Git isolation and a filter-independent content check (High), including a
   real-git case where a release's own attributes rewrite bytes and the install is
   refused.
2. The replaced or removed plugin folder is always kept, never trusted to
   `git status` (High).
3. Rollback reconciles real paths, never renames into an occupied path, and
   survives a second signal; tested with a TERM right after each rename, a TERM during
   cleanup, a failing restore `mv`, and a folder appearing during the publish (Medium).
4. A rerun keeps a disabled widget off (Medium).
5. `dev*` Omarchy versions are read from `$OMARCHY_PATH/version` (Low).
6. The macOS detach finding was fixed in the served `../install`.
7. No restore after the runtime refresh; symlinked `hyprland.lua` handled in the
   plan, the failure message and the rerun's check (High).
8. The uninstaller prints the manual recipe for symlinked configs; both recipes
   are tested through to the second, successful run (Medium).
9. `publish-plugin-release.sh` pins an already-pushed identical release and prints the
   pushed SHA when the default-branch check fails (Medium).
H1. Uninstall no longer stops at Paperland's `shell.json` check: the plugin is
   removed first. The stubs model `shell.json` the way Omarchy and Paperland treat it,
   and the real-`setup.py` run covers install, upgrade and uninstall through it.
Lows: the uninstaller checks omarchy-shell; the widget's `executable` is set
explicitly; every `GIT_*` variable is cleared and `GIT_ATTR_NOSYSTEM=1` is set.

Not done: file modes are not compared by the content check (a `100755` blob checked
out without its execute bit would pass; the caller cannot cause that).

## Not yet proven

The tests stub Omarchy and Hyprland. That `omarchy bar set` exists and writes the
widget's setting, that enabling updates omarchy-shell's config before the call
returns, and that `omarchy plugin remove` splices the widget's item out of
`shell.json` were read from Omarchy 4.0.4's source. Only a run against a real
omarchy-shell proves:

1. The `shell.json` write after `omarchy plugin remove` lands within the
   uninstaller's 2-second wait.
2. After `omarchy bar set json.paperland executable …`, the running widget runs that
   launcher.
3. The whole lifecycle once: install, rerun, uninstall, and one `--edit-dotfiles`
   run on a symlinked `hyprland.lua`.
4. The real-`setup.py` suite against current Paperland `main`, and `shellcheck`.

## Owner decisions (2026-10-02)

- Development Omarchy builds: read the real version from `$OMARCHY_PATH/version`;
  4.x and newer install, older or unreadable versions are refused.
- Backups are kept and never pruned; every path is printed with its `rm` command.
- Symlinked configs: detected and named. The default never writes into dotfiles;
  `--edit-dotfiles` adds the include to a symlinked `hyprland.lua`'s target. A
  symlinked `~/.config/hypr` stays refused until Paperland moves its generated files
  out of it; the uninstall recipe for that case removes the runtime with `rm -rf`,
  where Paperland's own uninstall would keep it.
- An interrupted first install is not enabled by the rerun; the rerun prints the
  enable command.
