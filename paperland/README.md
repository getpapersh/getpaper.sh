# Paperland installer (disabled)

This folder holds the Omarchy-plugin installer and uninstaller for Paperland. **It is
not served and must not be inlined into `../install`**, which prints "Paperland
install is coming soon" on Linux. It is parked here until "Hyprland next" (PAPER-7),
and needs the owner decisions listed under "Review findings" before it ships.

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
widget at the runtime's launcher (`omarchy bar set json.paperland executable ...`),
and runs `paperland setup` only when the launcher, `paperland.lua` or the include is
missing, keeping saved choices.

Failures: up to the runtime refresh, cleanup works out the state from the real
staged, live and moved-aside paths (never from flags a signal can interrupt) and puts
the previous plugin back, never renaming into an occupied path. Once the refresh has
started, the new plugin stays with the new runtime and a rerun finishes the job.

Only a first install enables the widget; a rerun leaves a disabled widget off and
prints the command to turn it on. A development Omarchy (`omarchy-version` prints
`dev...`) is accepted when `$OMARCHY_PATH/version` says 4 or newer.

Symlinked Hyprland config: Paperland never writes through a symlink. For a symlinked
`hyprland.lua`, the plan says so, Paperland's setup prints the include to paste, and
the run stops asking you to paste it into the link's target and rerun. A symlinked
`hypr/` folder (or any parent) is refused before anything changes, because
Paperland's setup refuses it outright. The uninstaller prints the manual steps for
both cases instead of running Paperland's setup or uninstall, and always keeps a copy
of the plugin checkout in `~/.config/omarchy/.paperland-removed-*` before Omarchy
deletes it. It stops before changing anything if omarchy-shell is not running.

## Review findings

From the second correctness, security, requirements and product reviews of
getpaper.sh `b17510a`. All are fixed, each with a test in `tests/`:

1. Git isolation and a filter-independent content check (High).
2. The replaced or removed checkout is always kept, never trusted to `git status` (High).
3. Rollback reconciles real paths and never renames into an occupied path; tested with
   a TERM right after each rename and a failing restore `mv` (Medium).
4. A rerun keeps a disabled widget off (Medium).
5. `dev*` Omarchy versions are read from `$OMARCHY_PATH/version` (Low).
6. The macOS detach finding was fixed in the served `../install`.
7. No restore after the runtime refresh; symlinked `hyprland.lua` handled in the plan
   and failure message (High).
8. The uninstaller prints the manual recipe for symlinked configs (Medium).
9. `publish-plugin-release.sh` pins an already-pushed identical release and prints the
   pushed SHA when the default-branch check fails (Medium).
Lows: the uninstaller checks omarchy-shell; the widget's `executable` is set
explicitly; `GIT_COMMON_DIR`, `GIT_EXEC_PATH` and every other `GIT_*` variable are
cleared.

Still open, for an owner decision before this ships:

- Accepting development Omarchy builds by `$OMARCHY_PATH/version` (the alternative is
  refusing them).
- Refusing a symlinked `hypr/` folder rather than installing without setup; lifting
  it needs Paperland's setup to support symlinked folders (its `regular()` refuses
  every symlinked parent, even for `--print-config`).
- Every upgrade keeps another `.paperland-previous-*` copy, and every uninstall a
  `.paperland-removed-*` copy, until the user deletes them; the paths are printed.
- Only a run on a real Omarchy desktop proves `omarchy bar set ... executable` and
  enablement against a live omarchy-shell; the tests stub Omarchy and Hyprland.
