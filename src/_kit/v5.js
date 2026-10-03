// Round 5: one copy deck for every concept (see _review/r3-10-synthesis.md). Needs kit.js, logos.js, fork5.js.
(() => {
  const V = (window.V5 = {});
  const cmd = Fork5.cmd, CURL = Fork5.CURL;
  V.COPIED = "Copied. Paste it in a terminal. It installs PaperMac on macOS or Paperland on Omarchy.";
  V.MAC_EXTRA = " PaperMac will then ask for Accessibility access.";
  V.LEDE = "If you've used PaperWM or niri, you already know how it works. Every window stays a glance away.";
  V.CAPS = ["New windows open beside your current one.", "Nothing shrinks or overlaps.", "Four widths, no dragging.", "The same strip on macOS and Omarchy."];

  V.heroHTML = () => `
    <p class="cat">A scrolling window manager for macOS and Linux</p>
    <h1 id="title">Paper</h1>
    <p class="tag">Your desktop is wider than your screen.</p>
    ${cmd(CURL, "after-hero")}
    <p class="k-after" id="after-hero" data-mac-extra>${V.COPIED}</p>
    <p class="links"><a href="/install">Read the script</a><a href="#uninstall">Uninstall</a><span class="alpha">Alpha</span></p>`;

  V.forkHTML = (screens) => Fork5.html({ title: "Install", copied: V.COPIED, trunk: "This command detects your system.", rejoin: "Open a few windows and watch them line up." }, screens);

  // a platform-only feature names its platform; the mark alone is too small to read
  const on = (p) => `<span class="on">${LOGOS[p === "mac" ? "apple" : "omarchy"]}${p === "mac" ? "macOS" : "Omarchy"}</span>`;
  V.GROUPS = [
    ["Get around", [["minimap", "The whole strip at a glance", ""], ["pills", "Hover the bar to preview", ""]]],
    ["Find a window", [["overview", "See every window at once", on("om")], ["switcher", "Type to find any window", on("mac")]]],
    ["Focus on one", [["limelight", "Dim everything else", on("mac")], ["snooze", "Snooze a window for later", on("mac")]]],
  ];
  V.groupHTML = ([name, tiles], i) => `<div class="group"><h3><span class="no">0${i + 1}</span>${name}</h3><div class="tiles">${tiles.map(([k, cap, plat]) => `<figure class="tile" data-tile="${k}"><figcaption><span>${cap}</span>${plat}</figcaption></figure>`).join("")}</div></div>`;
  V.moreHTML = () => `
  <section class="more" aria-labelledby="more-h">
    <h2 id="more-h">Beyond the arrow keys.</h2>
    <p class="lede">${V.LEDE}</p>
    ${V.GROUPS.map(V.groupHTML).join("")}
  </section>`;

  V.closeHTML = () => `
  <section class="close" aria-label="Install">
    <div class="cmdw">${cmd(CURL, "after-close")}<p class="k-after" id="after-close" data-mac-extra>${V.COPIED}</p></div>
    <p class="links"><a href="/install">Read the script</a><a href="https://github.com/getpapersh">GitHub</a><span class="alpha">Alpha</span></p>
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
