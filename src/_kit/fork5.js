// Round 5 install fork. Needs kit.js (Paper.copy) and logos.js.
(() => {
  const F = (window.Fork5 = {});
  const CURL = "curl -fsSL <wbr>https://getpaper.sh/install <wbr>| sh";
  F.CURL = CURL;
  // disabled: a visible but inert box (no data-copy, so Paper.copy never wires it)
  F.cmd = (code, after, disabled) => disabled
    ? `<button class="k-cmd" type="button" disabled aria-disabled="true"><code>${code}</code><span class="lbl">Copy</span></button>`
    : `<button class="k-cmd" type="button" data-copy${after ? ` data-after="${after}"` : ""}><code>${code}</code><span class="lbl">Copy</span></button>`;

  // c: copy strings; screens: markup for the two machine screens
  F.html = (c, screens = {}) => `
  <section class="fork" id="install" aria-labelledby="install-h">
    <svg class="rails" aria-hidden="true"><path class="r-in"/><path class="r-out"/></svg>
    <h2 id="install-h">${c.title}</h2>
    <div class="trunk">${F.cmd(CURL, "after-fork")}<p class="k-after" id="after-fork" data-mac-extra>${c.copied}</p><p>${c.trunk}</p></div>
    <div class="cols">
      <div class="col" data-os="mac">
        <div class="dev laptop" aria-hidden="true"><div class="scr">${screens.mac || ""}</div><div class="foot"></div></div>
        <div class="who"><h3 class="osname">${LOGOS.apple}macOS</h3><p class="prod">PaperMac</p></div>
        <p class="req">Requires macOS 27 or newer.</p>
        <div class="way"><p class="lead">On a Mac, it installs PaperMac</p><div class="alt">${F.cmd(CURL)}</div><p class="more-way"><a href="https://dl.getpaper.sh/papermac/PaperMac-27.0.0-alpha.5.dmg">Or download the DMG</a></p></div>
        <p class="note">Verifies the checksum and signature and never asks for sudo.</p>
      </div>
      <div class="col" data-os="lin">
        <div class="dev monitor" aria-hidden="true"><div class="scr">${screens.lin || ""}</div><div class="foot"></div></div>
        <div class="who"><h3 class="osname">${LOGOS.linux}Linux</h3><p class="prod">Paperland</p></div>
        <p class="req">Requires Omarchy 4 and Hyprland 0.56, or newer.</p>
        <div class="way"><p class="lead">On Omarchy, it installs Paperland</p><div class="alt">${F.cmd(CURL)}</div><p class="more-way"><a href="https://github.com/getpapersh/paperland">Or view it on GitHub</a></p></div>
        <p class="note">Pins and validates the plugin before it changes anything.</p>
      </div>
    </div>
    <div class="rejoin"><p>${c.rejoin}</p></div>
    <details class="undo" id="uninstall"><summary>Uninstall</summary>
      <p class="os">macOS</p>${F.cmd("curl -fsSL <wbr>https://getpaper.sh/install <wbr>| sh -s -- --uninstall")}
      <p>If PaperMac crashed or was force-quit, open it once and quit it before uninstalling, so it can return any hidden windows.</p>
      <p class="os">Linux</p>${F.cmd("curl -fsSL <wbr>https://getpaper.sh/install <wbr>| sh -s -- --uninstall")}
    </details>
  </section>`;

  // Rails: trunk -> split to each machine; each branch -> merge into the line above the rejoin.
  // Desktop draws a fork; phone draws one rail down the left gutter past both branches.
  F.rails = (sec) => {
    // a page that hides the trunk draws its own rails
    if (!sec.querySelector(".trunk")?.offsetParent) return;
    const svg = sec.querySelector(".rails"), pin = svg.querySelector(".r-in"), pout = svg.querySelector(".r-out");
    const draw = () => {
      const o = sec.getBoundingClientRect(), rel = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2 }; };
      const trunk = rel(sec.querySelector(".trunk")), cols = [...sec.querySelectorAll(".col")].map(rel), devs = [...sec.querySelectorAll(".dev")].map(rel);
      const rejoin = rel(sec.querySelector(".rejoin")), title = rel(sec.querySelector("h2"));
      const R = 28, x0 = trunk.cx;
      if (innerWidth <= 700) {
        // one rail: from above the title, down the gutter, ending at the rejoin
        // the turn into the gutter sits between the trunk and the first branch, never above the line's start
        const gx = cols[0].x - 20, y0 = trunk.y + trunk.h + 14, yh = Math.max(y0 + R, (y0 + cols[0].y) / 2);
        pin.setAttribute("d", `M${x0},0 V${title.y - 16}`);
        pout.setAttribute("d", `M${x0},${y0} V${yh - R} Q${x0},${yh} ${x0 - R},${yh} H${gx + R} Q${gx},${yh} ${gx},${yh + R} V${rejoin.y - 14}`);
        return;
      }
      const ys = (trunk.y + trunk.h + devs[0].y) / 2 + 10, yTop = devs[0].y - 12;
      const yEnd = Math.max(cols[0].y + cols[0].h, cols[1].y + cols[1].h) + 20, ym = (yEnd + rejoin.y) / 2;
      const [x1, x2] = devs.map((d) => d.cx);
      const branch = (x) => `M${x0},${ys - R} Q${x0},${ys} ${x0 + Math.sign(x - x0) * R},${ys} H${x - Math.sign(x - x0) * R} Q${x},${ys} ${x},${ys + R} V${yTop}`;
      pin.setAttribute("d", `M${x0},0 V${title.y - 16} M${x0},${trunk.y + trunk.h + 14} V${ys - R} ${branch(x1)} ${branch(x2)}`);
      const back = (x) => `M${x},${yEnd} V${ym - R} Q${x},${ym} ${x + Math.sign(x0 - x) * R},${ym} H${x0 - Math.sign(x0 - x) * R} Q${x0},${ym} ${x0},${ym + R}`;
      pout.setAttribute("d", `${back(x1)} ${back(x2)} M${x0},${ym + R} V${rejoin.y - 6}`);
    };
    draw();
    new ResizeObserver(draw).observe(sec);
    document.fonts?.ready.then(draw);
  };
})();
