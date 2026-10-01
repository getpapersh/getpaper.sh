# getpaper.sh

The universal installer and landing page for Paper (PAPER-7, PAPER-8):

```sh
curl -fsSL https://getpaper.sh/install | sh
```

- **macOS:** installs PaperMac. Run it again to reinstall or upgrade; Sparkle handles
  updates after that.
- **Linux:** prints "Paperland install is coming soon" and exits 1.

Uninstall PaperMac with `curl -fsSL https://getpaper.sh/install | sh -s -- --uninstall`.

## Files

| Path | Purpose |
| --- | --- |
| `install` | The served script (`/install`). POSIX sh, runs as is. |
| `index.html` | The landing page source. |
| `scripts/build-site.sh` | Copies `install` and `index.html` into `site/`; refuses uncommitted sources. |
| `site/` | Built, committed output to deploy: `install` and `index.html`. |
| `tests/run.sh`, `tests/stub.sh` | Stubbed tests of the served script and the site build. |
| `paperland/` | The disabled Omarchy-plugin installer for Paperland; not served. See its README. |

## What the macOS install does

PAPER-7's nine steps, in order:

1. Refuses root and macOS older than 27 (`sw_vers -productVersion`).
2. Uses the pinned PaperMac release: `PAPERMAC_VERSION`, `PAPERMAC_DMG_URL` and
   `PAPERMAC_DMG_SHA256` at the top of `install`. The pin stays until PaperMac's
   `scripts/release.sh` publishes `latest.json`; bump all three with every release
   until then.
3. Downloads with `curl -fsSL --proto '=https' --tlsv1.2` into `mktemp -d`. A curl
   download carries no quarantine mark, which is why the un-notarized alpha opens
   without a Gatekeeper prompt.
4. Checks the SHA-256 with `shasum -a 256`. A mismatch stops before anything else
   happens, including quitting PaperMac.
5. Quits a running PaperMac with `osascript -e 'quit app "PaperMac"'` and waits up to
   20 seconds for it to exit.
6. `hdiutil attach -nobrowse -readonly -mountpoint`.
7. Copies with `ditto` into a private folder in the destination, runs
   `codesign --verify --deep --strict` on that copy, and only then renames it over
   `PaperMac.app`. The destination is the existing install's folder, else
   `/Applications`, or `~/Applications` when `/Applications` is not writable. No
   `sudo`, and never `spctl` (it rejects the alpha even when it opens fine).
8. Detaches and cleans up in a trap. If detaching fails, the download and mount are
   kept and the exact `hdiutil detach` command is printed.
9. `open`s the app, whose Welcome window sets up Accessibility.

`--uninstall` prints the off-screen-windows warning (one variable,
`UNINSTALL_WARNING`, while PAP-268 is open), quits PaperMac, deletes `PaperMac.app`
from `/Applications` and `~/Applications`, and prints the commands to remove
`~/.config/papermac` and `~/Library/Application Support/PaperMac` without running them.

## Build and test

```sh
sh tests/run.sh                 # stubbed: every case pipes the script into sh, like curl | sh
TEST_SH=dash sh tests/run.sh    # the same with dash
sh scripts/build-site.sh        # after committing install or index.html; then commit site/
```

The tests point the script's `SYSTEM_APPLICATIONS` line at a folder inside the test,
so no case can write to the real `/Applications`. They also check that no truncated
prefix of the script runs anything, and that the committed `site/` equals a fresh build.

Only the macOS 27 VM acceptance run (PAPER-7) proves the real behavior: no quarantine
mark, launch to Welcome without a Gatekeeper prompt, in-place upgrade while running,
and the real `hdiutil`, `ditto`, `codesign` and `osascript`.

## Deploying

Not set up yet; hosting for getpaper.sh is unconfirmed. Serve the committed `site/`
as static files, with `/install` as `text/plain`.
