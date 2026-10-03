# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro + Starlight (owner decision, 2026-10-01): a static landing page now, docs under `/docs` later. Zero client JavaScript by default; small inline scripts or React islands only where they earn their place. Deployed as static files by the existing Cloudflare Worker (`wrangler.jsonc`, `site/`). Moving off the single `index.html` requires owner-approved changes to `scripts/build-site.sh` and the site checks in `tests/run.sh`.

## Users

Two groups, split by the install fork:

- Developers who already know scrolling or tiling window managers (PaperWM, niri, Hyprland, yabai, AeroSpace, Amethyst) and want to install in seconds.
- Mac and Linux users new to tiling who need the idea shown before they trust a `curl | sh`.

They arrive from a link, read the one-liner, decide whether to install, and copy a command.

## Product Purpose

Paper is one scrolling workflow on two platforms: PaperMac on macOS and Paperland on Hyprland (Omarchy). getpaper.sh is where both get installed. The page succeeds when a visitor understands the idea within one viewport and copies the right command for their system.

## Positioning

Windows sit side by side on a horizontal strip that is wider than the screen. Moving focus scrolls the strip; windows are not shrunk into a grid and do not overlap. The same concepts, layout, labels and shortcuts on macOS and on Hyprland: a user who learns one does not relearn the other.

## Operating Context

- Install: `curl -fsSL https://getpaper.sh/install | sh` (universal; on macOS installs PaperMac, on Linux currently prints that Paperland is coming soon). Uninstall: `curl -fsSL https://getpaper.sh/install | sh -s -- --uninstall`.
- Final-state install fork (owner decision): macOS shows `brew install --cask jsonmartin/tap/papermac` and a DMG download; Linux shows an Omarchy plugin install command. Until each is real, the shipped page shows "coming soon" in that slot.
- Requirements today: PaperMac needs macOS 27 or newer and Accessibility access; Paperland needs Omarchy 4+ with Hyprland 0.56+, Quickshell, Python 3, git and jq.
- PaperMac runs on top of native macOS Spaces (Mission Control keeps working); Paperland works with Hyprland's native workspaces.

## Capabilities and Constraints

Shared concepts (both products): the scrolling strip per Desktop/workspace; focus moves left/right and the focused window is centered by default; window width presets (0.33, 0.5, 0.66, 0.9 of the screen); new windows open after the focused one; a minimap of the strip with Desktop pills; a keyboard window switcher (Option/Alt+Tab); Desktop/workspace pills in the menu bar or Omarchy bar with hover previews; named Desktops; a command-line interface.

PaperMac only or ahead today: Limelight (dims unfocused windows), optional focused-window border, typed search in the switcher across all Desktops, window snoozing, per-app rules, customizable shortcuts with a Ghost Keys overlay, a guided first-run lesson ("First Flow"), Sparkle updates.

Paperland only or ahead today: full-display overview with Full/Icons/Timeline modes, Peek mode for the minimap, scratchpad.

Terminology: "Desktop" vs "Workspace" wording is an open owner decision; prefer showing over labeling. PaperMac's Desktop labels use macOS words; Paperland's use Hyprland words.

Page constraints: self-hosted fonts and images only; no third-party requests (no CDNs, hosted fonts, analytics, trackers). Light and dark. Works from 320 px to wide desktop. Accessible: keyboard reachable, visible focus, reduced motion respected.

## Brand Commitments

- Names: Paper (family), PaperMac (macOS), Paperland (Hyprland). Domain getpaper.sh.
- Voice: calm, technical, honest. Current page line: "Unannounced alpha. Expect rough edges."
- Soft launch: no announcement copy, no analytics.
- The earlier papermac-www site work (its layout, palette and headline) is explicitly not a reference for getpaper.sh.

## Evidence on Hand

- A PaperMac app icon exists (`papermac/Resources/AppIcon.png`).
- No product screenshots, recordings, testimonials, user counts, benchmarks or press exist for the page. Do not invent any. Demonstrations may be built as clearly synthetic mock UI.

## Product Principles

1. Show the strip, then say it: the mechanism is visual and should be seen before it is explained.
2. One workflow, two platforms: the page treats macOS and Hyprland as equals.
3. Honest alpha: state what is real today and mark what is coming.
4. The command is the call to action: every path ends at a copyable, readable command.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard reachable controls with visible focus, a pause control for any motion longer than five seconds, `prefers-reduced-motion` respected, sufficient contrast in light and dark.
