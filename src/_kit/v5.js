// Round 5: one copy deck for every concept (see _review/r3-10-synthesis.md). Needs kit.js, logos.js, fork5.js.
(() => {
  const V = (window.V5 = {});
  const cmd = Fork5.cmd, CURL = Fork5.CURL;
  V.COPIED = "Copied. Paste it in a terminal. It installs PaperMac on macOS or PaperLand on Omarchy.";
  V.MAC_EXTRA = " PaperMac will then ask for Accessibility access.";
  V.LEDE = "Windows scroll together in a Strip, like ticker tape. In PaperMac Free, use Overview (Experimental) to browse the current canvas and jump to a window. PaperLand also offers Overview on Omarchy.";
  V.CAPS = ["New windows open beside your current one in the Strip.", "Nothing shrinks or overlaps.", "Four widths, no dragging.", "Scrolling Strips on macOS and Omarchy."];

  V.heroHTML = () => `
    <div class="family-marks"><img src="/brand/papermac/papermac-icon.svg" alt="PaperMac" width="56" height="56"><img src="/brand/paperland/paperland-icon.svg" alt="PaperLand" width="56" height="56"></div>
    <h1 id="title">Paper</h1>
    <p class="tag">Go beyond Mission Control. Unleash your desktop on an infinite canvas.</p>
    <p class="hero-facts">Full-width windows. Scrolling Strips on macOS and Linux.</p>
    ${cmd(CURL, "after-hero")}
    <p class="k-after" id="after-hero" data-mac-extra>${V.COPIED}</p>
    <p class="links"><a href="/mac/">PaperMac <span>Beta</span></a><a href="/paperland/">Linux · PaperLand <span>Alpha</span></a><a href="/install">Read the script</a><a href="/mac/#changelog">Changelog</a></p>`;

  V.forkHTML = (screens) => Fork5.html({ title: "Install", copied: V.COPIED, trunk: "This command detects your system.", rejoin: "Open a few windows and watch them line up." }, screens);

  // a platform-only feature names its platform; the mark alone is too small to read
  const on = (p, pro = false) => p === "both" ? '<span class="on">macOS + Linux</span>' : `<span class="on">${LOGOS[p === "mac" ? "apple" : "omarchy"]}${p === "mac" ? "macOS" : "Omarchy"}${pro ? " · Pro" : ""}</span>`;
  V.GROUPS = [
    ["Get around", [["minimap", "Minimap: the whole Strip at a glance", on("both")], ["pills", "Preview a Desktop from the bar", on("both")]]],
    ["Find a window", [["overview", "Overview in PaperMac Free (Experimental)", on("mac")], ["switcher", "Type to find any window", on("mac")]]],
    ["Focus on one", [["limelight", "Dim everything else", on("mac", true)], ["snooze", "Snooze a window for later", on("mac", true)]]],
  ];
  V.groupHTML = ([name, tiles], i) => `<div class="group"><h3><span class="no">0${i + 1}</span>${name}</h3><div class="tiles">${tiles.map(([k, cap, plat]) => `<figure class="tile" ${k === "overview" ? '' : `data-tile="${k}"`}>${k === "overview" ? '<video class="home-overview" controls controlslist="nodownload noplaybackrate" disablepictureinpicture muted loop playsinline preload="none" width="1920" height="1200" poster="/media/papermac/overview.jpg" aria-label="PaperMac Free Overview with synthetic document windows"><source src="/media/papermac/overview.mp4" type="video/mp4">Your browser cannot play this recording.</video>' : ''}<figcaption><span>${cap}</span>${plat}</figcaption></figure>`).join("")}</div></div>`;
  V.moreHTML = () => `
  <div class="more">
  <section class="product-truth" aria-labelledby="truth-h">
    <h2 id="truth-h">Room for your windows.</h2>
    <p>Keep full-width windows instead of shrinking them to fit. PaperMac runs on native macOS Spaces, keeps Mission Control intact and needs no SIP disabling. Inspired by <a href="https://github.com/paperwm/PaperWM">PaperWM</a> and <a href="https://github.com/YaLTeR/niri">niri</a>.</p>
    <p class="trust">Notarized PaperMac downloads · Checksum-verified installer · No sudo · No SIP changes · No telemetry</p>
    <p><a href="/mac/#free">PaperMac Free</a> includes up to two Strips at independently adjustable heights, stacks of up to 2 showing windows, multi-select and Arrange, and Overview (Experimental). <a href="/mac/#pro">Pro</a> adds three or more Strips, deeper stacks, custom stack heights, Window groups (Lock as Group), Limelight, snoozing, window previews, Desktop auto-naming and synced Strips across displays. <a href="/mac/#install">Try Pro free for 14 days</a>, starting in the app when you choose, with no automatic charge.</p>
    <p>PaperMac Free is free to use, with no time limit. PaperMac Free and Pro are closed-source software under <a href="/terms/">PaperMac's proprietary Terms</a>. <a href="https://github.com/getpapersh/paperland">PaperLand is GPL-3.0-or-later open source</a> · <a href="/mac/#changelog">PaperMac changelog</a>.</p>
  </section>
  <section aria-labelledby="more-h">
    <h2 id="more-h">Beyond the arrow keys.</h2>
    <p class="lede">${V.LEDE}</p>
    ${V.GROUPS.map(V.groupHTML).join("")}
  </section>
  </div>`;

  V.closeHTML = () => `
  <section class="close" aria-label="Install">
    <div class="cmdw">${cmd(CURL, "after-close")}<p class="k-after" id="after-close" data-mac-extra>${V.COPIED}</p></div>
    <footer><p class="links"><a href="/mac/">PaperMac Beta</a><a href="/paperland/">PaperLand Alpha</a><a href="/install">Read the script</a><a href="https://github.com/getpapersh">GitHub</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a></p></footer>
  </section>`;

  V.APPS = (ids) => ids.map(([k, id, n]) => Paper.app(k, id, n)).join("");

  V.wire = () => {
    document.documentElement.classList.replace("no-js", "js");
    const live = document.getElementById("live");
    for (const b of document.querySelectorAll(".k-cmd .lbl")) if (!b.querySelector("svg")) b.insertAdjacentHTML("afterbegin", Paper.ICON_COPY);
    const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent;
    if (/mac/i.test(plat)) for (const p of document.querySelectorAll("[data-mac-extra]")) p.textContent += V.MAC_EXTRA;
    Paper.copy(live); Paper.tiles();
    const fork = document.getElementById("install"); if (fork) Fork5.rails(fork);
    return live;
  };

  V.lerpRect = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p });
  V.place = (el, r, W) => { el.style.transform = `translate3d(${r.x}px,${r.y}px,0) scale(${r.w / W})`; };
  V.clamp01 = (x) => Math.max(0, Math.min(1, x));
  V.ease = (p) => (p < .5 ? 4 * p * p * p : 1 - (2 - 2 * p) ** 3 / 2);
})();
