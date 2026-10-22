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

Windows sit side by side in a scrolling Strip that can extend beyond the screen. Moving focus scrolls the Strip; windows are not shrunk into a grid and do not overlap. Paper uses shared terminology on macOS and Hyprland while keeping platform-specific capabilities explicit.

Approved tagline: "Go beyond Mission Control. Unleash your desktop on an infinite canvas."

Infinite Canvas is the feature name; "an infinite canvas" describes the experience in a sentence. Unlimited capacity is product intent until the corresponding behavior is verified. The tagline does not promise unbounded capacity or imply that PaperMac replaces native Mission Control.

## Operating Context

- Install: `curl -fsSL https://getpaper.sh/install | sh` (universal; on macOS installs PaperMac, on Linux currently prints that Paperland is coming soon). Uninstall: `curl -fsSL https://getpaper.sh/install | sh -s -- --uninstall`.
- Final-state install fork (owner decision): macOS shows `brew install --cask jsonmartin/tap/papermac` and a DMG download; Linux shows an Omarchy plugin install command. Until each is real, the shipped page shows "coming soon" in that slot.
- Requirements today: PaperMac needs macOS 27 or newer and Accessibility access; Paperland needs Omarchy 4+ with Hyprland 0.56+, Quickshell, Python 3, git and jq.
- PaperMac runs on top of native macOS Spaces (Mission Control keeps working); Paperland works with Hyprland's native workspaces.

## Capabilities and Constraints

Shared concepts (both products): scrolling Strips within a Desktop; focus moves left/right and the focused window is centered by default; window width presets (0.33, 0.5, 0.66, 0.9 of the screen); new windows open after the focused one; a Minimap of the Strip with Desktop pills; a keyboard window switcher (Option/Alt+Tab); Desktop pills in the menu bar or Omarchy bar with hover previews; named Desktops; a command-line interface.

PaperMac only or ahead today: Limelight (dims unfocused windows), optional focused-window border, typed search in the switcher across all Desktops, window snoozing, per-app rules, customizable shortcuts with a Ghost Keys overlay, a guided first-run lesson ("First Flow"), Sparkle updates.

Paperland only or ahead today: full-display Overview with Full/Icons/Timeline modes, Peek mode for the Minimap, scratchpad.

### Shared terminology

- **Strip:** A scrolling band of window columns that move together.
- **Canvas:** The surface containing Strips.
- **Infinite Canvas:** The feature and product direction for a Canvas extending beyond the screen. Unlimited capacity remains intent until verified.
- **Overview:** The zoomed-out browsing mode used to find, jump to, or rearrange windows where supported.
- **Desktop:** A native macOS Space or Hyprland workspace. Keep Desktop and Strip distinct.
- **Column:** A window column within a Strip.
- **Stack:** Multiple windows grouped vertically in a Column.
- **Window:** An individual application window.
- **Minimap:** The compact navigation representation.

Introduce the metaphors briefly: a Strip scrolls like ticker tape; Overview lets users scan their Desktop like a newspaper. Routine controls use the concrete names. These metaphors do not imply automatic scrolling, editorial reflow, or new capabilities. Multiple Strips above and below one another describe the Canvas direction; existing platform specifications and implemented behavior govern availability.

Use Desktop in product-facing prose, while preserving native platform wording when describing macOS Spaces or Hyprland workspaces. UI Strip still maps to `lane` in existing CLI/API/config identifiers, wire fields and persisted data; this vocabulary change does not rename those contracts.

Page constraints: self-hosted fonts and images only; no third-party requests (no CDNs, hosted fonts, analytics, trackers). Light and dark. Works from 320 px to wide desktop. Accessible: keyboard reachable, visible focus, reduced motion respected.

## Brand Commitments

- Names: Paper (family), PaperMac (macOS), Paperland (Hyprland). Domain getpaper.sh.
- Voice: calm, technical, honest. Current page line: "Unannounced alpha. Expect rough edges."
- Soft launch: no announcement copy, no analytics.
- The earlier papermac-www site work (its layout, palette and headline) is explicitly not a reference for getpaper.sh.

## Evidence on Hand

- A PaperMac app icon exists (`papermac/Resources/AppIcon.png`).
- The Mac page includes three recordings of the real app with synthetic document windows: focus scrolling, Overview and the Minimap, and three uneven Strips with a three-window Stack. Testimonials, user counts, benchmarks and press remain unavailable. Illustrative diagrams stay distinct from recordings.

## Product Principles

1. Show the Strip, then say it: the mechanism is visual and should be seen before it is explained.
2. One workflow, two platforms: the page treats macOS and Hyprland as equals.
3. Honest alpha: state what is real today and mark what is coming.
4. The command is the call to action: every path ends at a copyable, readable command.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard reachable controls with visible focus, a pause control for any motion longer than five seconds, `prefers-reduced-motion` respected, sufficient contrast in light and dark.
