# Paperland installer (disabled)

This folder holds the Omarchy-plugin installer and uninstaller for Paperland. **It is
not served and must not be inlined into `../install`**, which prints "Paperland
install is coming soon" on Linux. It is parked here until "Hyprland next" (PAPER-7),
and must fix the open review findings below before it ships.

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
outside the `plugins/` folder that omarchy-shell watches, verifies it (pinned HEAD,
clean status, manifest id, no symlinks, `omarchy-plugin-validate`), then publishes it
with one rename. A rerun renames the installed plugin aside first. It then refreshes
Paperland's runtime with `paperland install --no-setup` and runs `paperland setup` only
when the launcher, `paperland.lua` or the include is missing, keeping saved choices.

## Open findings to fix before this ships

From the second correctness and security review of getpaper.sh `b17510a`:

1. **High: git isolation does not prove the staged files are the pinned bytes.** The
   `cgit` helper still lets `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`,
   `GIT_CONFIG_PARAMETERS`, `GIT_TEMPLATE_DIR` and `GIT_SSL_NO_VERIFY` through and uses
   the default clone template. Inherited clean/smudge filters can make
   `HEAD == pin` and an empty `status` hold for different bytes. Fix: a controlled
   environment without inherited git config or transport overrides, an empty private
   template, forced TLS verification, and a content check that does not rely on
   caller-controlled normalization.
2. **High: deleting a "clean" replaced checkout can lose work.** `report_previous`
   (install) and the uninstaller trust the old checkout's own `git status`, which a
   local `core.worktree` or assume-unchanged bits can hide, and which says nothing of
   unpushed commits. Fix: always keep the renamed previous plugin and report it; on
   uninstall, keep a copy before Omarchy deletes the checkout.
3. **Medium: rename and rollback state can disagree on a signal.** A TERM between a
   `mv` and its state assignment leaves the live plugin missing with no message, or
   nests the old plugin inside the new one while claiming it was restored. Fix:
   reconcile the real staged, live and backup paths in cleanup, and never `mv` into
   an occupied destination.
4. **Medium: a rerun re-enables a widget the user disabled.** Disabled state alone is
   not evidence of an interrupted install. Fix: preserve a completed install's
   disabled state; only finish enablement for a known-unfinished first install, or
   print the enable command.
5. **Low: `omarchy-version` `dev*` bypasses the Omarchy 4 check.** Refuse an
   unverified development version or read its real version; or make development
   builds an explicit, documented owner decision.
6. (The dormant macOS Medium from that review, a failed detach deleting the mounted
   image's download, was fixed in the served `../install`, which now owns macOS.)

From the second requirements and product review of `b17510a`:

7. **High: restore-on-failure undoes a correct upgrade, and loops for a symlinked
   `hyprland.lua`.** Paperland's setup exits 1 with "Symlinked main config needs a
   manual include" whenever `hyprland.lua` (or a parent) is a symlink and the include
   is absent, after the runtime was already refreshed; the installer then restores
   the old plugin, leaving old widget plus new runtime, and every rerun repeats it.
   Fix: stop restoring once the runtime is refreshed, report the kept previous plugin,
   and for symlinked configs say in the plan and the failure message that Paperland
   prints lines to paste into the tracked `hyprland.lua` before rerunning.
8. **Medium: the uninstaller loops on a symlinked `hyprland.lua`.** Paperland's
   `setup`/`uninstall` refuse "Symlinked configuration requires manual integration"
   even after the include was pasted. Fix: detect it and print the manual recipe
   (remove the marked block from the symlink target, delete `paperland.lua`, rerun)
   instead of "fix the reported problem and rerun"; correct the "could not remove its
   shortcuts" message for that case.
9. **Medium (`publish-plugin-release.sh`): a failed default-branch check cannot be
   retried.** After `--push` the release branch exists; the rerun dies "package ... is
   identical to the current release" before pinning, so `release.env` never gets the
   pushed SHA. Fix: print the new SHA in the default-branch failure, and when the
   package equals the fetched `release` tip, pin that tip instead of dying.

The same review's Lows are worth taking at the same time: check omarchy-shell is running
in the uninstaller; set the widget's `executable` explicitly instead of trusting
omarchy-shell's PATH; clear `GIT_COMMON_DIR` and `GIT_EXEC_PATH` too; and add tests for
a symlinked `hyprland.lua`, the uninstaller with omarchy-shell down, and a failing
`mv` in rollback.
