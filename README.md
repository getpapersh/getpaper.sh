# getpaper.sh

The universal installer and landing page for Paper (PAPER-7, the one-line installer;
PAPER-8, the landing page):

```sh
curl -fsSL https://getpaper.sh/install | sh
```

- **macOS:** installs PaperMac. Run it again to reinstall or upgrade; Sparkle handles
  updates after that.
- **Linux (Omarchy 4 with Hyprland 0.56 or newer):** installs PaperLand as the Omarchy
  plugin `json.paperland`, with its runtime, shortcut and autostart. Run it again to
  update.

Uninstall with `curl -fsSL https://getpaper.sh/install | sh -s -- --uninstall` (PaperMac
on macOS, PaperLand on Linux). `--help` lists the options; `--edit-dotfiles` is Linux only
(see "What the Linux install does").

## Files

| Path | Purpose |
| --- | --- |
| `install` | The installer source: the macOS half, option parsing and the OS dispatch. POSIX sh. Its `# BEGIN PAPERLAND` block holds stand-ins that refuse Linux until the build fills it in. |
| `scripts/assemble-install.sh` | Fills the shared DMG URL and replaces that block with the built PaperLand `install` and `uninstall`, each as a subshell function. |
| `index.html` | The landing page: one self-contained file (inline CSS, JS and base64 fonts; no third-party requests). Its editable source is `src/v7-1-viewfinder/index.html` with `src/_kit/` and `src/fonts/`. Edit the source, then rebuild the bundle with `uvx --from fonttools python scripts/bundle-page.py src/v7-1-viewfinder/index.html > index.html`: it inlines the `_kit/` stylesheets and scripts and both fonts, each subset with pyftsubset to ASCII, Latin-1, common punctuation and every character the page contains, and renames the Mona Sans subset "Paper Sans" (see `licenses/FONTS.txt`). The same sources always give the same bytes. |
| `src/brand/`, `site/brand/` | Approved PaperMac and PaperLand masters, exports and palette tokens stay under `src/brand/`; `src/brand/SHA256SUMS` verifies the supplied assets. The site build copies both products' tiled SVGs, 32 px favicons and 180 px apple-touch icons into `site/brand/papermac/` and `site/brand/paperland/`. The 180 px exports are rasterized from the unmodified icon masters. |
| `og.png`, `mac/og.png` | The 1200×630 home and Mac link previews. Capture the built pages over local HTTP so root-absolute `/brand/` images load. See the commands below; the home crop starts at y=45 and the Mac crop at y=0 on a 1440×900 viewport. |
| `scripts/bundle-page.py` | Builds `index.html` from the page source (above). Needs only fontTools, run through `uvx`. |
| `mac/index.html`, `mac/activate/index.html` | Self-contained Mac product and receipt activation pages, built from `src/mac/` and `src/mac-activate/`. The activation page immediately removes `?key=` from the address, renders the key as text in memory and offers Copy key and key-free `papermac://license`; it has no outbound website links. |
| `terms/index.html`, `privacy/index.html` | Terms and privacy policy, built from `src/terms/` and `src/privacy/`. |
| `media/papermac/` | Three real-app recordings with synthetic documents, plus JPEG posters. Delivery clips are 1920×1200, 8–12 seconds, H264 without audio. Native-resolution masters stay outside the repository. |
| `licenses/` | Licences for the fonts and logos the page embeds (SIL OFL, CC0), and `FONTS.txt` on the subsets; served at `/licenses/`. |
| `_headers` | Response headers for Cloudflare Workers static assets (source). |
| `wrangler.jsonc` | The Cloudflare Worker `getpaper-sh`: serves `site/`, no Worker script. |
| `scripts/build-site.sh` | Builds `site/`: runs `paperland/build.sh` with `paperland/release.env`, assembles `site/install`, copies `index.html`, `mac/`, `media/`, `terms/`, `privacy/`, `og.png`, `_headers` and `licenses/`. Refuses uncommitted sources (including `paperland/`) and a `wrangler.jsonc` that does not deploy `./site`. `build-site.sh OUT_DIR` builds a preview anywhere, without that check. |
| `site/` | Built, committed output to deploy; `site/install` is the served `/install`. |
| `tests/run.sh`, `tests/stub.sh` | Stubbed tests of the served (built) script and the site build. |
| `paperland/` | The PaperLand installer and uninstaller inlined into `site/install`, its pinned release, and its own tests. See its README. |

## What the macOS install does

1. Refuses root and unknown options.
2. Picks the release from PaperMac's manifest, `PAPERMAC_MANIFEST_URL` (see "The
   manifest"). With that variable empty it would use the pinned `PAPERMAC_VERSION`,
   `PAPERMAC_DMG_URL`, `PAPERMAC_DMG_SHA256` and `PAPERMAC_MIN_MACOS` at the top of
   `install` instead; the tests run every case in pin mode unless it switches.
3. Refuses macOS older than the release's minimum (`sw_vers -productVersion`).
4. Chooses the destination: the existing install's folder, else `/Applications`, or
   `~/Applications` when `/Applications` is not writable. No `sudo`, ever.
5. Takes a lock, `<Applications>/.PaperMac-install.lock` (a folder holding the owner's
   pid), and holds it until PaperMac is opened, so two installs or uninstalls never
   interleave. A lock whose pid is no longer running is taken over under a second,
   short-lived lock (`.PaperMac-install.lock.takeover`), so two runs can never both
   take it over; the loser stops. A lock without a pid, or whose pid now belongs to
   some other process, is reported with how to clear it, never taken over. A run only
   ever removes a lock that holds its own pid.
6. Checks that an existing `PaperMac.app` is PaperMac before touching it: a real folder,
   not a symlink or file, with `CFBundleIdentifier` `dev.jsonmartin.papermac` (read
   with `plutil`), writable by this user. Anything else is left alone and the install
   stops. The check runs again before the quit and again before the old app is moved
   aside.
7. Downloads with `curl -fsSL --proto '=https' --tlsv1.2` into `mktemp -d` and checks
   the SHA-256. A curl download carries no quarantine mark, which is why the
   un-notarized alpha opens without a Gatekeeper prompt.
8. Mounts with `hdiutil attach -nobrowse -readonly -mountpoint` (output shown only on
   failure), copies with `ditto` into a private folder next to the destination, and
   runs `codesign --verify --deep --strict` on the copy. PaperMac keeps running through
   all of this; any failure up to here leaves it running and unchanged.
9. Quits PaperMac, immediately before the swap and only the copy being replaced: it
   finds this user's PaperMac processes by executable path (`ps`). PaperMac running
   from another folder, or another user's PaperMac running from the destination, stops
   the install instead. The quit is `osascript -e 'quit app id "dev.jsonmartin.papermac"'`
   run in the background so the request itself is bounded; it waits up to 20 seconds,
   then ends a request that is still pending (osascript itself, then its wrapper), so
   it can never reach the newly installed PaperMac.
   `kill -TERM` goes to those exact pids only if the request failed (its error is
   printed) or PaperMac still runs after the wait; then it waits 10 more seconds and,
   if PaperMac is still running, says so and stops with nothing changed. Never
   SIGKILL: PaperMac returns hidden windows as it quits.
10. Swaps with two renames: the current app into the private folder as
    `previous.app` (its path is printed first), then the new copy into place.
11. Cleans up in a trap that always reaches the detach. If the new copy did not go in,
    it puts `previous.app` back; if that fails or is impossible, it keeps the folder,
    prints its path and the exact `mv` command to restore it, and never deletes it.
    Detaching is retried once after a second; if it still fails, the download and mount
    are kept and the `hdiutil detach` command is printed.
12. `open`s the app, whose Welcome window sets up Accessibility.

**Interruption guarantee.** Ctrl-C, SIGTERM, SIGHUP and every failure go through the
cleanup above, so the previous PaperMac is either in place or restored. A SIGKILL,
crash or power loss between the two renames cannot run the cleanup: `PaperMac.app` is
then missing, and the previous app is in the printed
`<Applications>/.PaperMac-install.XXXXXX/previous.app`. Move it back with the printed
path (`mv '<that path>' '<Applications>/PaperMac.app'`). The lock left behind holds
the dead run's pid, and the next run takes it over by itself.

`--uninstall` prints "If PaperMac crashed or was force-quit, open it once and quit it
before uninstalling, so it can return any hidden windows." first. It then takes the lock
of each folder holding a `PaperMac.app` (`/Applications`, then `~/Applications`) and
holds them through the checks, the quit and the removal. It checks each app as in
step 6 and also that every folder inside it is deletable by this user; any problem
stops it before anything is quit or removed. It quits PaperMac as in step 9, then
renames each app to `<Applications>/.PaperMac-uninstall.XXXXXX/` before deleting it,
so a failed delete never leaves a half-deleted `PaperMac.app`: the leftover folder is
named and the uninstall exits 1. It prints the commands to remove
`~/.config/papermac` and `~/Library/Application Support/PaperMac` without running
them.

The whole script is one `{ ... }` block ending in `main "$@"; }`, so a truncated
download is a syntax error and runs nothing.

## What the Linux install does

`main` reads every option first (`--uninstall`, `--edit-dotfiles`, `--help`; anything else
stops before any change), then dispatches on `uname -s`: macOS runs the PaperMac half
above, Linux runs the PaperLand installer (or its uninstaller for `--uninstall`), and any
other system is refused. `--edit-dotfiles` is refused on macOS and with `--uninstall`.

The PaperLand half is `paperland/install` and `paperland/uninstall`, built with the
pinned `paperland/release.env` and inlined verbatim at build time, each as the body of a
function that runs in its own subshell (`paperland_install() ( … )`). Its functions,
variables, `set -eu`, traps and exits stay inside that subshell, as when it was a script
of its own, so neither half changes the other's reviewed behavior. The only variable both
halves set is `SITE`, to the same value; the PaperLand half redefines `say`, `warn`, `die`,
`usage`, `main`, `have`, `first_symlink` and `cgit` inside its subshell, where they shadow
the outer ones and nowhere else. On Linux the outer shell sets a no-op trap (not an
ignore, which children would inherit) and waits, so PaperLand's own cleanup always
finishes first. Interrupt it with Ctrl-C, by closing the terminal, or with a signal to
the whole process group: each reaches the PaperLand half, which cleans up and exits 130.
A signal sent only to the outer `sh` (`kill <pid>`, `timeout --foreground`, a supervisor
that signals just its child) is absorbed by that trap, and the PaperLand half runs to
completion. Nothing is fetched at runtime except the pinned plugin release.

What the PaperLand installer does, step by step (Omarchy and Hyprland checks, the
verified clone of the pinned `https://github.com/getpapersh/paperland.git` release, the
one-rename publish, the runtime refresh, setup, symlinked dotfiles and `--edit-dotfiles`,
backups, rollback, and the uninstaller's order) is in `paperland/README.md`.

## The manifest

From Alpha 4, PaperMac's release publishes `https://dl.getpaper.sh/papermac/latest.json`:

```json
{"version": "27.0.0-beta.7", "build": 22, "dmg_url": "https://dl.getpaper.sh/papermac/PaperMac-27.0.0-beta.7.dmg",
 "sha256": "529c9ce28b2688212bb28c088243eb098e0622b5e1c021b8184d2057877eef29", "min_macos": "27", "notarized": true}
```

`install` sets `PAPERMAC_MANIFEST_URL=https://dl.getpaper.sh/papermac/latest.json`. In manifest mode the
script fails closed: a fetch error, a file `plutil` cannot read, or any missing or
malformed field stops the install, and it never falls back to the pin. It requires
`dmg_url` to start with `https://dl.getpaper.sh/papermac/` and end in a plain `.dmg`
file name, `sha256` to be 64 lowercase hex characters, `version` to look like
`27.0.0` or `27.0.0-beta.3`, `min_macos` to be digits (it replaces the pinned
minimum), and `notarized` to be a JSON boolean. `build` is not used. Parsing uses
`plutil -extract <key> raw -expect <type>`; never python3, which is an install-dialog
stub on Macs without the Command Line Tools.

## Build and test

`src/mac/dmg-url.txt` is the shared download URL for both `/mac` buttons,
the home page's Mac fork and the built installer's pinned fallback. The page
bundler and installer assembler fill `{{DMG_URL}}` from that file. When changing
the pinned release, also update its version, SHA-256 and notarization fields in
`install`; verify the downloaded DMG's hash before publishing.

Rebuild the six self-contained pages after editing their sources:

```sh
uvx --from fonttools python scripts/bundle-page.py src/v7-1-viewfinder/index.html > index.html
mkdir -p mac/activate terms privacy
uvx --with segno --from fonttools python scripts/bundle-page.py src/mac/index.html > mac/index.html
uvx --from fonttools python scripts/bundle-page.py src/mac-activate/index.html > mac/activate/index.html
uvx --from fonttools python scripts/bundle-page.py src/terms/index.html > terms/index.html
uvx --from fonttools python scripts/bundle-page.py src/privacy/index.html > privacy/index.html
uvx --from fonttools python scripts/bundle-page.py src/paperland/index.html > paperland/index.html
sh scripts/build-site.sh /tmp/getpaper-site-preview
```

Regenerate both OG images after a hero or brand change. Build a preview first, then
serve it locally in a separate terminal (a static file server, not a dev server):

```sh
sh scripts/build-site.sh /tmp/getpaper-site-preview
python3 -m http.server 8767 --bind 127.0.0.1 --directory /tmp/getpaper-site-preview
```

With that server running:

```sh
bun src/_tools/og.ts http://127.0.0.1:8767/ og.png
bun src/_tools/og.ts http://127.0.0.1:8767/mac/ mac/og.png 0
sh scripts/build-site.sh /tmp/getpaper-site-preview
```

Stop the static server when finished. The home page follows the system light or dark theme;
the Mac and legal pages keep their existing light/dark behavior.
`tests/brand.py` also runs `bun tests/brand-states.ts site`, which uses the same
installed Chrome as the OG tool to check computed hover and copy-state contrast.
The full-palette check reports every failing pair before exiting nonzero.

The preview output has 43 entries including directories. To test an uncommitted
change, copy that explicit preview output into this worktree's `site/` before
running the suites below; the default build's committed-source guard stays intact.
Two files set the sales modes, and both committed defaults are `off`:
`src/mac/checkout-url.txt` for PaperMac 27 Pro and
`src/mac/lifetime-checkout-url.txt` for PaperMac 27 Lifetime. With the Pro file
`off`, the header, hero and buy panel offer the manually started 14-day Pro trial
and say buying opens soon. Buy links, buying Terms notices, the phone frame and
its QR code are absent; download Terms notices remain. With the Lifetime file
`off`, the page has no Lifetime offer. No Lemon Squeezy URL is emitted while both
are `off`. The bundler accepts only `off` or an `https://` URL in either file and
rejects Lifetime checkout while Pro checkout is off.

PaperMac 27 Pro lists at $39 and PaperMac 27 Lifetime at $79. Through Tue Dec 1
2026 11:59 PM PT (2026-12-02T07:59:59Z), the founding prices are $19.50 for Pro
(code FOUNDING) and $39.50 for Lifetime (code FOUNDINGLIFETIME). Buyers never
type a code: each checkout URL carries its code, and the page shows founding
prices and the deadline without naming either code. To turn a product on, write
its Lemon Squeezy buy URL with the code prefilled into its file and rebuild,
for example:

```text
https://<store>.lemonsqueezy.com/checkout/buy/<variant-id>?checkout[discount_code]=FOUNDING
```

Before checkout opens, the Lemon Squeezy discount codes must match `FOUNDING`
for Pro and `FOUNDINGLIFETIME` for Lifetime.

A Pro URL enables Buy links and the inline Segno QR; with Pro on, a Lifetime URL
adds Lifetime to the hero, buy panel and purchase terms. Use the verified live checkouts
before taking payments. After the deadline the codes expire and checkout charges
list price, but the page's founding copy is static: replace it with list prices
and rebuild when founding ends. The license covers PaperMac 27 Pro on macOS 27
Golden Gate, with up to five active Macs per person. A Lifetime license is Pro for
life: it covers PaperMac 27 Pro and every future version's Pro, but not a higher
tier if one is ever added. The page promises no lifetime support or updates. The
Terms include Lifetime coverage and exclude any future tier above Pro; the product
page states the Pro coverage. The final legal text completed the owner-approved
AI consensus review. Keep both checkout files off until Pro and Lifetime checkouts
are verified and ready to open together; before
enabling payments, verify refund key deactivation and EU/UK digital-content
withdrawal consent at checkout. Public activation also requires the hosting redirect to
preserve `/mac/activate/?key=`, the no-referrer response header and a real receipt
substitution check. Local files do not establish deployed routing, byte-range
support or Safari playback.

```sh
sh tests/run.sh                            # stubbed: every case pipes the built script into sh, like curl | sh
TEST_SH=dash sh tests/run.sh               # the same with dash
sh paperland/tests/run.sh                  # the PaperLand half on its own
COMBINED=1 sh paperland/tests/run.sh       # every PaperLand case against the served /install
TEST_SH=dash sh paperland/tests/run.sh     # the PaperLand half with dash
TEST_SH=dash COMBINED=1 sh paperland/tests/run.sh   # and against the served /install
sh scripts/build-site.sh                   # after committing the sources; then commit site/
```

All six runs are required before a change to `install`, `paperland/` or the build ships.
The `COMBINED=1` runs are the only ones that prove the options take effect in the served
file (the root suite checks only that Linux dispatches each option to the PaperLand
half). `PAPERLAND_SRC=/path/to/paperland` adds real-`setup.py` runs to the PaperLand suite.

The tests point the script's `SYSTEM_APPLICATIONS` line at a folder inside the test,
so no case can write to the real `/Applications`, and stub every macOS command.
Running PaperMac copies are stand-in `sleep` processes, so quitting and SIGTERM act on
real processes. They cover the call order, every failure before and during the swap,
the manifest's failure modes, uninstall, the options and the Linux and other-system
dispatch, every truncation of the built file (each line boundary and the last 20
bytes, on macOS and Linux, with and without `--uninstall`), and that the committed
`site/` equals a fresh build.

Only the macOS 27 VM acceptance run proves the real behavior: no quarantine mark,
launch to Welcome without a Gatekeeper prompt, in-place upgrade while running, the
Apple-event quit (and whether Terminal needs Automation consent for it), and the real
`hdiutil`, `ditto`, `codesign`, `plutil` and `ps`.

## Deploying (Cloudflare Workers static assets)

`wrangler.jsonc` deploys the committed `site/` as a Worker named `getpaper-sh` with
static assets only. `site/_headers` serves `/install` as
`text/plain; charset=utf-8` with `Cache-Control: no-cache` and
`X-Content-Type-Options: nosniff`, and lets browsers reuse `/` for five minutes.

1. Build and commit `site/`, then deploy from this folder:

   ```sh
   bunx wrangler deploy
   ```

2. Check the temporary `*.workers.dev` URL that the deploy prints:

   ```sh
   curl -fsSI https://getpaper-sh.<subdomain>.workers.dev/install   # content-type: text/plain; charset=utf-8
   curl -fsSL https://getpaper-sh.<subdomain>.workers.dev/install | cmp - site/install
   ```

On the day the domain is ready:

1. Attach `getpaper.sh` as a Custom Domain of the `getpaper-sh` Worker: in the
   Cloudflare dashboard (Workers & Pages, `getpaper-sh`, Settings, Domains & Routes,
   Add, Custom Domain), or by adding
   `"routes": [{ "pattern": "getpaper.sh", "custom_domain": true }]` to
   `wrangler.jsonc` and deploying again. The `getpaper.sh` zone must be on the same
   Cloudflare account.
2. Verify the served installer is byte-identical to the committed one:

   ```sh
   curl -fsSL https://getpaper.sh/install | cmp - site/install
   curl -fsSI https://getpaper.sh/install    # content-type: text/plain; charset=utf-8
   ```

## License

GPL-3.0-or-later, the same as PaperLand. See [LICENSE](LICENSE). The fonts and logos the page embeds keep their own licences, in `licenses/`.

## Launch pages and routing

`/paperland/` introduces PaperLand Alpha on Omarchy. Its bundled page and OG image
share `paperland/` with installer sources; the site build copies only the two
page artifacts. `_redirects` sends `/land`, `/land/`, `/linux` and `/linux/` there
with 301 responses under Cloudflare Workers static assets. The local Python
static server does not process `_redirects`; deployed redirects still need a
hosting check after an authorized deployment. `sitemap.xml` lists the five public
indexable pages and excludes the receipt activation page.

PaperMac Free supports up to two Strips at independently adjustable heights and
stacks of up to 2 showing windows. Pro adds three or more Strips, deeper stacks,
Window groups, Limelight, snoozing, window previews, Desktop auto-naming and
synced Strips across displays. Both PaperMac editions are closed source under
PaperMac's proprietary Terms; PaperLand remains GPL-3.0-or-later open source.
The existing menu-bar capture still shows the earlier icon and needs a fresh real-app capture; it is retained
as documentary media rather than replaced with a synthetic screenshot.
