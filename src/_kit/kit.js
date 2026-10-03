// Shared kit for the getpaper.sh concepts (v3). One global, Paper, with:
//   Paper.app(kind, id, n)   full-size synthetic app window HTML
//   Paper.tiles()            illustrated feature tiles (play once on view, replay on hover)
//   Paper.devices()          mini desktops inside the fork's machines
//   Paper.copy()             copy buttons with an after-copy next step
//   Paper.fork()             OS preselection and announcements
//   Paper.story(cfg)         the scroll story: a pure function of t, set by scroll
(() => {
  const P = (window.Paper = {});
  const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>';
  P.ICON_COPY = ICON_COPY;

  // ---------- full-size app windows ----------
  const APPS = {
    ed: (n) => `<div class="tb"><b>Editor</b>strip.ts<span class="n">${n}</span></div><div class="bd"><div class="gut">${Array.from({ length: 22 }, (_, i) => i + 1).join("\n")}</div><pre><span class="cm">// A new window lands right after the one you're in.</span>
<span class="c1">export function</span> <span class="c2">open</span>(strip: Strip, win: Window) {
  <span class="c1">const</span> at = strip.<span class="c2">indexOf</span>(strip.focused) + <span class="c3">1</span>
  strip.<span class="c2">insert</span>(at, win)     <span class="cm">// nothing lands on top</span>
  strip.<span class="c2">focus</span>(win)
  view.<span class="c2">centerOn</span>(win)    <span class="cm">// the view moves, not the windows</span>
}

<span class="cm">// Widths snap to a few sizes instead of shrinking.</span>
<span class="c1">const</span> PRESETS = [<span class="c3">1/3</span>, <span class="c3">1/2</span>, <span class="c3">2/3</span>, <span class="c3">9/10</span>]

<span class="c1">export function</span> <span class="c2">wider</span>(win: Window) {
  <span class="c1">const</span> next = PRESETS.<span class="c2">find</span>((p) => p > win.width)
  win.width = next ?? PRESETS[<span class="c3">0</span>]
}

<span class="c1">export function</span> <span class="c2">scroll</span>(strip: Strip, by: <span class="c2">number</span>) {
  strip.<span class="c2">focus</span>(strip.<span class="c2">at</span>(strip.focusedIndex + by))
}</pre></div><div class="ring"></div>`,
    te: (n) => `<div class="tb"><b>Terminal</b>~/strip<span class="n">${n}</span></div><div class="bd"><pre><span class="pr">~/strip $</span> bun test
<span class="ok">✓</span> lands after the focused window
<span class="ok">✓</span> keeps every width
<span class="ok">✓</span> never overlaps
<span class="ok">✓</span> scrolls to anything
  4 pass  0 fail

<span class="pr">~/strip $</span> git log --oneline -3
a41c2e9 widths snap, never shrink
7f03b11 focus centers the window
c9d5e20 open lands after focus

<span class="pr">~/strip $</span> <span class="ok">█</span></pre></div><div class="ring"></div>`,
    dc: (n) => `<div class="tb"><b>Browser</b><span class="n">${n}</span></div><div class="bd"><div class="url">docs / the-strip</div><article><h4>The strip</h4><p>Your windows sit side by side, in the order you opened them. Nothing shrinks to fit and nothing overlaps. The screen is a view onto the strip, and moving focus moves the view.</p><div class="fig"><i style="left:4%;width:16%"></i><i style="left:22%;width:12%"></i><i style="left:36%;width:22%"></i><i style="left:60%;width:16%"></i><i style="left:78%;width:18%"></i><b></b></div></article></div><div class="ring"></div>`,
    ch: (n) => `<div class="tb"><b>Chat</b>#desk<span class="n">${n}</span></div><div class="bd"><div class="m" style="width:62%">&nbsp;</div><div class="m me" style="width:48%">&nbsp;</div><div class="m" style="width:70%">&nbsp;</div><div class="m me" style="width:34%">&nbsp;</div><div class="shot" aria-hidden="true"></div></div><div class="ring"></div>`,
  };
  const bars = (spec) => spec.map(([c, w]) => `<i class="${c}" style="width:${w}%"></i>`).join("");
  Object.assign(APPS, {
    ed2: (n) => `<div class="tb"><span class="dots"></span><b>Editor</b><span class="n">${n}</span></div><div class="bd sil ed2"><div class="gut"></div><div class="code">${bars([["k", 34], ["", 58], ["f", 46], ["", 30], ["s", 52], ["", 22], ["", 0], ["k", 40], ["", 62], ["f", 36], ["", 48], ["s", 28], ["", 0], ["k", 38], ["", 54], ["", 26]])}</div></div><div class="ring"></div>`,
    te2: (n) => `<div class="tb"><span class="dots"></span><b>Terminal</b><span class="n">${n}</span></div><div class="bd sil te2"><div class="code">${bars([["p", 22], ["g", 46], ["g", 40], ["g", 52], ["", 18], ["", 0], ["p", 28], ["", 54], ["", 44], ["", 0], ["p", 12]])}</div></div><div class="ring"></div>`,
    ph: (n) => `<div class="tb"><span class="dots"></span><b>Browser</b><span class="n">${n}</span></div><div class="bd sil ph"><div class="url"></div><div class="photo"></div><div class="code">${bars([["h", 62], ["", 88], ["", 80], ["", 70]])}</div><div class="cards"><i></i><i></i><i></i></div></div><div class="ring"></div>`,
    mu: (n) => `<div class="tb"><span class="dots"></span><b>Music</b><span class="n">${n}</span></div><div class="bd sil mu"><div class="art"></div><div class="code">${bars([["h", 56], ["", 38]])}</div><div class="prog"><i></i></div><div class="ctl"><i></i><b></b><i></i></div></div><div class="ring"></div>`,
  });
  P.app = (kind, id, n) => `<article class="app ${kind}" data-id="${id}" aria-hidden="true">${APPS[kind](n)}</article>`;

  // ---------- mini desktops ----------
  const LINES = {
    ed: [["a", 34, 10], ["", 52, 16], ["b", 44, 22], ["", 30, 28], ["c", 48, 34], ["", 26, 40], ["a", 38, 50], ["", 56, 56], ["b", 30, 62]],
    te: [["", 30, 10], ["g", 52, 16], ["g", 44, 22], ["g", 48, 28], ["", 22, 38], ["", 40, 44]],
    dc: [["hero", 0, 10], ["", 70, 44], ["", 84, 50], ["", 62, 56], ["", 76, 62]],
    ch: [["", 50, 12], ["me", 46, 22], ["", 58, 32], ["me", 36, 42]],
    no: [["", 60, 14], ["", 44, 22], ["", 70, 30], ["", 52, 38]],
    ph: [["", 62, 66], ["", 40, 73]],
    mu: [["", 46, 70], ["", 30, 77]],
  };
  const NAMES = { ed: "Editor", te: "Terminal", dc: "Browser", ch: "Chat", ph: "Photos", mu: "Music", no: "Notes" };
  function winHTML(id, k) {
    const ls = (LINES[k] || LINES.no).map(([c, w, t]) => `<i class="${c}" style="${w ? `width:${w}%;` : ""}top:${t}%"></i>`).join("");
    return `<div class="w ${k}" data-w="${id}">${ls}</div>`;
  }
  function barHTML(bar, pills, app) {
    if (!bar) return "";
    const ps = pills.map((p) => `<span class="pill${p.on ? " on" : ""}" data-p="${p.n}">${p.n}${p.c ? `<sup>${p.c}</sup>` : ""}</span>`).join("");
    if (bar === "mac") return `<div class="mbar mac"><span>${app || "Editor"}</span><span class="sp"></span>${ps}</div>`;
    return `<div class="mbar om">${ps}<span class="sp"></span></div>`;
  }
  // A mini desktop: windows on a strip, in screen widths (1 = the mini's width).
  P.mini = function (el, spec) {
    const GAP = 1.6;
    el.classList.add("mini");
    if (!spec.bar) el.classList.add("nobar");
    el.innerHTML = barHTML(spec.bar, spec.pills || [], spec.app) + `<div class="strip">${Object.entries(spec.wins).map(([id, k]) => winHTML(id, k)).join("")}</div>` + (spec.overlay || "");
    const strip = el.querySelector(".strip"), ws = {}, appName = spec.app ? null : el.querySelector(".mbar.mac > span");
    for (const w of el.querySelectorAll(".w")) ws[w.dataset.w] = w;
    function set(st) {
      let x = 0; const pos = {};
      for (const id of st.order) { const w = st.w[id]; pos[id] = { x, w }; x += w * 100 + GAP; }
      for (const id in ws) {
        const p = pos[id] || st.ghost?.[id] || { x: 0, w: .33 };
        const s = ws[id].style;
        s.setProperty("--x", p.x + "cqw"); s.setProperty("--ww", p.w * 100 + "cqw");
        s.setProperty("--o", pos[id] ? 1 : 0); s.setProperty("--y", pos[id] ? "0cqw" : (st.ghost?.[id]?.y ?? -8) + "cqw");
        ws[id].classList.toggle("f", st.focus === id);
      }
      // the menu bar names the focused app, as macOS does
      if (appName && spec.wins[st.focus]) appName.textContent = NAMES[spec.wins[st.focus]] || "Editor";
      const f = pos[st.focus] || { x: 0, w: 1 };
      const off = st.off ?? 50 - (f.x + (f.w * 100) / 2);
      strip.style.setProperty("--off", off + "cqw");
      if (spec.onSet) spec.onSet(el, st, pos, off);
    }
    return { set, el };
  };

  // Feature tiles. Each preset has a before (A) and an after (B) state.
  const TILES = {
    opens: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }], wins: { a: "ph", n: "te", b: "dc" },
      A: { order: ["a", "b"], w: { a: .5, b: .5 }, focus: "a", ghost: { n: { x: 51.6, w: .34, y: -10 } } },
      B: { order: ["a", "n", "b"], w: { a: .5, n: .34, b: .5 }, focus: "n" } },
    centered: { bar: "mac", pills: [{ n: 1, c: 4, on: 1 }], wins: { a: "ch", b: "ed", c: "mu", d: "ph" },
      A: { order: ["a", "b", "c", "d"], w: { a: .34, b: .5, c: .34, d: .5 }, focus: "b" },
      B: { order: ["a", "b", "c", "d"], w: { a: .34, b: .5, c: .34, d: .5 }, focus: "d" } },
    widths: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }], wins: { a: "te", b: "ph", c: "dc" },
      A: { order: ["a", "b", "c"], w: { a: .34, b: .34, c: .5 }, focus: "b" },
      B: { order: ["a", "b", "c"], w: { a: .34, b: .67, c: .5 }, focus: "b" },
      overlay: `<div class="ov modes" style="opacity:1"><span class="ka">⅓</span><span>½</span><span class="kb">⅔</span><span>9⁄10</span></div>` },
    minimap: { bar: "mac", pills: [{ n: 1, c: 5, on: 1 }], wins: { a: "ed", b: "mu", c: "ph", d: "ch", e: "dc" },
      A: { order: ["a", "b", "c", "d", "e"], w: { a: .5, b: .34, c: .5, d: .34, e: .5 }, focus: "c" },
      B: { order: ["a", "b", "c", "d", "e"], w: { a: .5, b: .34, c: .5, d: .34, e: .5 }, focus: "a" },
      overlay: `<div class="ov mm"><div class="t"></div></div>` },
    pills: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }, { n: 3, c: 1 }], wins: { a: "ph", b: "te", c: "mu" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" },
      overlay: `<div class="ov pv"><i style="left:6%;width:42%"></i><i style="left:52%;width:42%;background:var(--k-term)"></i></div>` },
    switcher: { bar: "mac", pills: [{ n: 1, c: 4, on: 1 }, { n: 2, c: 3 }], wins: { a: "ed", b: "dc", c: "ch" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .5, c: .34 }, focus: "b" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .5, c: .34 }, focus: "b" },
      overlay: `<div class="ov sw"><div class="q">Type to filter windows or Desktops… <span class="typed">ter</span></div><div class="r x"><i></i>Editor<small>1</small></div><div class="r hit"><i class="t"></i>Terminal<small>2</small></div><div class="r x"><i></i>Browser<small>1</small></div><div class="r x"><i></i>Chat<small>2</small></div></div>` },
    limelight: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }], wins: { a: "dc", b: "ph", c: "te" },
      A: { order: ["a", "b", "c"], w: { a: .34, b: .5, c: .34 }, focus: "b" }, B: { order: ["a", "b", "c"], w: { a: .34, b: .5, c: .34 }, focus: "b" } },
    overview: { bar: "om", pills: [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }, { n: 3 }, { n: 4, c: 1 }], wins: { a: "ed", b: "te", c: "ph" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" },
      overlay: `<div class="ov ovw"><div><i style="left:6%;width:40%"></i><i class="t" style="left:50%;width:22%"></i></div><div><i style="left:6%;width:30%"></i><i style="left:40%;width:44%"></i></div><div><i class="t" style="left:6%;width:50%"></i></div><div><i style="left:6%;width:24%"></i><i style="left:34%;width:24%"></i><i class="t" style="left:62%;width:24%"></i></div></div><div class="ov modes"><span class="on">Full</span><span>Icons</span><span>Timeline</span></div>` },
    snooze: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }], wins: { a: "ed", b: "mu", c: "ph" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "b" },
      B: { order: ["a", "c"], w: { a: .5, c: .5 }, focus: "a", ghost: { b: { x: 70, w: .2, y: 30 } } },
      overlay: `<div class="ov tray"><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Back in 1 hour</div></div>` },
    rules: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }], wins: { a: "ed", b: "te", c: "dc" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .5, c: .5 }, focus: "b" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "b" },
      overlay: `<div class="ov rule"><span class="ic"></span>Terminal<span class="arrow"></span><span class="chip">⅓ wide</span></div>` },
    script: { bar: null, wins: { a: "ed", b: "te", c: "dc" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "c" },
      overlay: `<div class="ov cmdline"><span class="pr">~ $</span> papermac<br><span class="pr">~ $</span> paperland</div>` },
    spaces: { bar: "mac", pills: [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }, { n: 3, c: 4 }], wins: { a: "ed", b: "te", c: "dc" },
      A: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" }, B: { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" } },
  };
  P.TILES = TILES;
  function mmSync(el, st, pos) {
    const t = el.querySelector(".mm .t"); if (!t) return;
    const tot = Object.values(pos).reduce((m, p) => Math.max(m, p.x + p.w * 100), 0), k = 100 / tot;
    if (!t.children.length) for (const id in pos) t.insertAdjacentHTML("beforeend", `<i data-m="${id}"></i>`), 0;
    if (!t.querySelector("b")) t.insertAdjacentHTML("beforeend", "<b></b>");
    for (const i of t.querySelectorAll("i")) { const p = pos[i.dataset.m]; i.style.left = p.x * k + "%"; i.style.width = (p.w * 100 - 1.4) * k + "%"; i.classList.toggle("f", st.focus === i.dataset.m); }
    const f = pos[st.focus], left = (f.x + f.w * 50 - 50) * k;
    const b = t.querySelector("b"); b.style.width = 100 * k + "%"; b.style.left = Math.max(0, Math.min(100 - 100 * k, left)) + "%";
  }
  P.tiles = function () {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { play(e.target); io.unobserve(e.target); } }, { threshold: .55 });
    function chips(tile, on) { const m = tile.querySelector(".modes .ka"); if (m) { m.classList.toggle("on", !on); tile.querySelector(".modes .kb").classList.toggle("on", on); } }
    function play(tile) { tile.classList.add("play"); tile._m.set(tile._p.B); tile.querySelector(".mini").classList.toggle("ll", tile.dataset.tile === "limelight"); chips(tile, true); }
    function reset(tile) { tile.classList.remove("play"); tile._m.set(tile._p.A); tile.querySelector(".mini").classList.remove("ll"); chips(tile, false); }
    for (const tile of document.querySelectorAll(".tile[data-tile]")) {
      const p = TILES[tile.dataset.tile]; if (!p) continue;
      let art = tile.querySelector(".tile-art");
      if (!art) { art = document.createElement("div"); art.className = "tile-art"; tile.prepend(art); }
      art.setAttribute("aria-hidden", "true");
      tile._p = p;
      tile._m = P.mini(art, { ...p, onSet: (el, st, pos) => mmSync(el, st, pos) });
      if (reduced) { play(tile); continue; }
      reset(tile); io.observe(tile);
      // replay on hover or focus
      let busy = 0;
      const again = () => { if (busy) return; busy = 1; reset(tile); setTimeout(() => { play(tile); setTimeout(() => (busy = 0), 900); }, 380); };
      tile.addEventListener("pointerenter", again); tile.addEventListener("focusin", again);
    }
  };

  // Machines in the fork: same strip, different bar.
  P.devices = function () {
    for (const el of document.querySelectorAll("[data-device]")) {
      const om = el.dataset.device === "om";
      const m = P.mini(el, { bar: om ? "om" : "mac", app: "Editor",
        pills: om ? [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }, { n: 3 }] : [{ n: 1, c: 3, on: 1 }, { n: 2, c: 2 }, { n: 3 }],
        wins: { a: "ed", b: "te", c: "dc" } });
      const A = { order: ["a", "b", "c"], w: { a: .5, b: .34, c: .5 }, focus: "a" }, B = { ...A, focus: "b" };
      m.set(A); el._m = m; el._A = A; el._B = B;
    }
  };
  P.deviceNudge = function (el) { if (!el?._m) return; el._m.set(el._B); setTimeout(() => el._m.set(el._A), 1300); };

  // ---------- copy ----------
  P.copy = function (live) {
    for (const btn of document.querySelectorAll("[data-copy]")) {
      const lbl = btn.querySelector(".lbl"), txt = lbl.innerHTML;
      btn.addEventListener("click", async () => {
        const code = btn.querySelector("code");
        const text = code.textContent.replace(/\s+/g, " ").trim();
        const after = btn.dataset.after && document.getElementById(btn.dataset.after);
        try { await navigator.clipboard.writeText(text); lbl.textContent = "Copied"; if (live) live.textContent = "Copied to the clipboard."; }
        catch { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lbl.textContent = "Selected"; if (live) live.textContent = "Selected. Copy it with your keyboard."; }
        btn.classList.add("done"); if (after) after.classList.add("on");
        clearTimeout(btn._t); btn._t = setTimeout(() => { lbl.innerHTML = txt; btn.classList.remove("done"); if (after) after.classList.remove("on"); if (live) live.textContent = ""; }, after ? 10000 : 4200);
      });
    }
  };

  // ---------- fork ----------
  P.fork = function (live, onChange) {
    const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent;
    const lin = document.getElementById("os-lin"), mac = document.getElementById("os-mac");
    const isLinux = /linux/i.test(plat) && !/android/i.test(plat);
    if (isLinux && lin) lin.checked = true;
    const det = document.querySelector(isLinux ? "[data-detected=lin]" : "[data-detected=mac]");
    if (det) det.hidden = false;
    for (const r of document.querySelectorAll('input[name="os"]')) r.addEventListener("change", () => {
      if (live) live.textContent = r.value === "lin" ? "Showing Linux." : "Showing macOS.";
      if (onChange) onChange(r.value);
    });
    if (onChange) onChange(isLinux ? "lin" : "mac", true);
  };

  // ---------- the story ----------
  // cfg: root, stage, strips (array of containers holding .app[data-id]), start {order,w,focus},
  // steps [{open,w,say}|{resize,w,say}|{focus,say}|{zoom,say}], heroW(W,H), geom(W,H)->{cy,h},
  // phoneScale, gap, beat (vh per beat), hold, cap, mini (.k-mini), onRender(t,info), live {open, prev, next}
  P.story = function (cfg) {
    const { root, stage, steps } = cfg;
    const strips = cfg.strips, GAP = cfg.gap ?? 16, HOLD = cfg.hold ?? .38, N = steps.length;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, still = reduced || cfg.static;
    const wins = strips.map((s) => Object.fromEntries([...s.querySelectorAll("[data-id]")].map((el) => [el.dataset.id, el])));
    const IDS = Object.keys(wins[0]);
    root.style.setProperty("--beats", N);
    if (still) root.classList.add("k-still");
    const apply = (s, st) => {
      const order = [...s.order], w = { ...s.w }; let focus = s.focus, zoom = false;
      // a new window lands next to the focused one, or at the end of the strip with {end: true}
      if (st.open) { if (st.end) order.push(st.open); else order.splice(order.indexOf(s.focus) + 1, 0, st.open); w[st.open] = st.w; focus = st.open; }
      if (st.resize) w[st.resize] = st.w;
      if (st.focus) focus = st.focus;
      if (st.zoom) zoom = st.zoom;
      return { order, w, focus, zoom };
    };
    const states = [cfg.start];
    for (const st of steps) states.push(apply(states.at(-1), st));
    let W, H, S0, G, frames, maxTot, lastW = -1, cur = 0, said = -2, live = null, liveFrom = null, liveP = 1;
    // widths are fractions of the "screen": the stage by default, or a frame the page draws
    const px = (id, w) => { const U = cfg.unit ? cfg.unit(W, H) : W; return w === "hero" ? cfg.heroW(W, H) / S0 : Math.min((W * .94) / S0, (w * U) / S0); };
    function frameOf(s) {
      const win = {}; let x = 0;
      for (const id of s.order) { const w = px(id, s.w[id]); win[id] = { x, w, o: 1 }; x += w + GAP; }
      const tot = x - GAP; let sc, tx;
      // zoom "view": stay zoomed out at cfg.viewScale but keep the focused window centred, so the strip slides under a fixed screen
      if (s.zoom === "view") { sc = S0 * (cfg.viewScale ?? .5); const f = win[s.focus]; tx = W / 2 - (f.x + f.w / 2) * sc; }
      else if (s.zoom) { sc = Math.min((W * .9) / tot, (G.zoomH ?? G.h) / (G.h / S0)); tx = (W - tot * sc) / 2; }
      else { sc = S0; const f = win[s.focus]; tx = W / 2 - (f.x + f.w / 2) * sc; }
      return { win, tot, sc, tx, focus: s.focus, zoom: s.zoom };
    }
    function fill(f, i, list) {
      for (const id of IDS) if (!f.win[id]) {
        let j; for (let d = 1; j === undefined && d < list.length; d++) j = [i + d, i - d].find((k) => list[k] && list[k].win[id] && list[k].win[id].o === 1);
        f.win[id] = { ...(j === undefined ? { x: 0, w: px(id, .5) } : list[j].win[id]), o: 0 };
      }
      return f;
    }
    function layout(force) {
      const w = stage.clientWidth;
      if (!force && w === lastW) return; lastW = w;
      W = strips[0].clientWidth; H = strips[0].clientHeight;
      S0 = cfg.scale ? cfg.scale(W, H) : W < 700 ? (cfg.phoneScale ?? .8) : 1;
      G = cfg.geom(W, H);
      frames = states.map(frameOf); frames.forEach((f, i) => fill(f, i, frames));
      maxTot = Math.max(...frames.map((f) => f.tot));
      const hv = G.h / S0;
      for (const ws of wins) for (const id of IDS) {
        Object.assign(ws[id].style, { top: G.cy - hv / 2 + "px", height: hv + "px" });
      }
      for (const s of strips) s.style.transformOrigin = `0 ${G.cy}px`;
      // snap points at every resting beat
      if (!still) {
        root.querySelectorAll(".k-snap").forEach((e) => e.remove());
        const span = root.offsetHeight - stage.offsetHeight;
        // a state rests from t = k - HOLD to t = k; snap to the middle of each rest
        for (let k = 0; k <= N; k++) { const m = document.createElement("i"); m.className = "k-snap"; m.style.top = ((k ? k - HOLD / 2 : 0) / N) * span + "px"; root.prepend(m); }
      }
      buildMini();
      if (live) { live = null; cfg.live?.hide?.(); }
      render(cur, true);
    }
    // minimap: real buttons, sized by width, named after their app
    let mb = {}, mv, mScale;
    function buildMini() {
      if (!cfg.mini) return;
      const trk = cfg.mini.querySelector(".trk"), tw = Math.min(cfg.miniW ?? 300, W * .58);
      trk.style.width = tw + "px"; mScale = tw / maxTot;
      if (!mv) {
        for (const id of IDS) {
          const b = document.createElement("button"); b.type = "button";
          const name = wins[0][id].querySelector(".tb b")?.textContent || "Paper";
          b.setAttribute("aria-label", "Show " + name); b.addEventListener("click", () => jump(id)); trk.append(b); mb[id] = b;
        }
        mv = document.createElement("div"); mv.className = "vw"; trk.append(mv);
      }
    }
    const ease = (p) => (p < .5 ? 4 * p * p * p : 1 - (2 - 2 * p) ** 3 / 2);
    const out = (p) => 1 - (1 - p) ** 3;
    const lerp = (a, b, p) => a + (b - a) * p;
    function paint(a, b, q) {
      const sc = lerp(a.sc, b.sc, q), tx = lerp(a.tx, b.tx, q);
      for (const s of strips) s.style.transform = `translate3d(${tx}px,0,0) scale(${sc})`;
      for (const id of IDS) {
        const A = a.win[id], B = b.win[id];
        const x = lerp(A.x, B.x, q), w = lerp(A.w, B.w, q);
        const landing = A.o < B.o, oq = landing ? out(Math.min(1, q / .6)) : q, o = lerp(A.o, B.o, oq);
        // the focus border stays on in the follow-focus zoom; that is the point of it
        const fa = +(a.focus === id && (!a.zoom || a.zoom === "view")), fb = +(b.focus === id && (!b.zoom || b.zoom === "view")), fo = lerp(fa, fb, q);
        for (const ws of wins) {
          const el = ws[id];
          // a new window drops in from above with a slight tilt, and settles flat
          el.style.transform = `translate3d(${x}px,${(1 - o) * -70}px,0) rotate(${(1 - o) * -1.5}deg)`;
          el.style.opacity = Math.min(1, o * 1.8);
          const wpx = Math.round(w) + "px"; if (el.style.width !== wpx) el.style.width = wpx;
          const r = el.querySelector(".ring"); if (r) r.style.opacity = fo;
        }
        if (mb[id]) {
          const bw = Math.max(18, w * mScale - 4);
          Object.assign(mb[id].style, { left: x * mScale + "px", width: bw + "px", opacity: o < .05 ? 0 : 1, visibility: o < .05 ? "hidden" : "" });
          mb[id].setAttribute("aria-current", fo > .5 ? "true" : "false"); mb[id].tabIndex = o < .5 ? -1 : 0;
        }
      }
      if (mv) {
        const vwd = Math.min((W / sc) * mScale, maxTot * mScale), trkW = maxTot * mScale;
        mv.style.width = vwd + "px"; mv.style.left = Math.max(0, Math.min(trkW - vwd, (-tx / sc) * mScale)) + "px";
      }
      const fa = a.win[a.focus] || { x: 0, w: 0 }, fb = b.win[b.focus] || fa;
      return { sc, tx, fc: lerp(fa.x + fa.w / 2, fb.x + fb.w / 2, q), vw: W / S0, vh: H / S0, cy: G.cy, W, H, S0 };
    }
    function render(t, force) {
      t = Math.max(0, Math.min(N, t));
      if (!force && t === cur && !live) return;
      cur = t;
      const atRest = t >= N - HOLD * .6;   // the last state rests from N - HOLD to N
      if (!atRest && live) { live = null; }
      if (!atRest) cfg.live?.hide?.();
      stage.classList.toggle("k-rest", atRest);
      const k = Math.min(N - 1, Math.floor(t)), q = ease(Math.max(0, Math.min(1, (t - k) / (1 - HOLD))));
      let info;
      if (live) info = paint(live.from, live.frame, ease(liveP));
      else info = paint(frames[k], frames[k + 1], q);
      const idx = Math.min(N, Math.floor(t + .62));
      if (idx !== said && cfg.cap) {
        said = idx; const c = cfg.cap, next = idx > 0 ? steps[idx - 1].say : "";
        // the same caption over consecutive beats stays put instead of fading out and back in
        if (!(next && next === c.textContent && !c.classList.contains("out"))) {
          c.classList.add("out");
          setTimeout(() => { c.textContent = next; if (idx > 0) c.classList.remove("out"); }, 150);
        }
      }
      if (atRest && cfg.live) cfg.live.show?.();
      cfg.onRender?.(t, { k, q, N, ...info, live: !!live });
    }
    // "Your turn": at the last rest the visitor can move focus and open windows
    function liveAct(st) {
      const base = live ? live.state : states[N];
      const ns = apply(base, st);
      const from = live ? live.frame : frames[N];
      const nf = fill(frameOf(ns), 0, [from]);
      live = { state: ns, frame: nf, from: { ...from, win: { ...from.win } } };
      for (const id of IDS) if (from.win[id] && !base.order.includes(id) && ns.order.includes(id)) live.from.win[id] = { ...nf.win[id], o: 0 };
      liveP = 0; const t0 = performance.now(), dur = reduced ? 1 : 520;
      const step = (now) => { liveP = Math.min(1, (now - t0) / dur); render(cur, true); if (liveP < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    if (cfg.live) {
      cfg.live.prev?.addEventListener("click", () => { const s = live ? live.state : states[N]; const i = s.order.indexOf(s.focus); liveAct({ focus: s.order[Math.max(0, i - 1)] }); });
      cfg.live.next?.addEventListener("click", () => { const s = live ? live.state : states[N]; const i = s.order.indexOf(s.focus); liveAct({ focus: s.order[Math.min(s.order.length - 1, i + 1)] }); });
      cfg.live.open?.addEventListener("click", () => { const s = live ? live.state : states[N]; const spare = IDS.find((id) => !s.order.includes(id)); if (spare) liveAct({ open: spare, w: .5 }); else cfg.live.full?.(); });
      cfg.live.zoom?.addEventListener("click", () => { const s = live ? live.state : states[N]; liveAct({ zoom: !s.zoom }); cfg.live.zoomed?.(!s.zoom); });
      // arrow keys move focus while the stage has focus
      stage.addEventListener("keydown", (e) => {
        if (!(cur >= N - HOLD * .6 || still) || !["ArrowLeft", "ArrowRight"].includes(e.key) || e.target.closest("button, a, input")) return;
        e.preventDefault(); (e.key === "ArrowLeft" ? cfg.live.prev : cfg.live.next)?.click();
      });
    }
    function progress() { const span = root.offsetHeight - stage.offsetHeight; return span > 0 ? Math.max(0, Math.min(1, -root.getBoundingClientRect().top / span)) : 0; }
    function jump(id) {
      if (still || cur >= N - HOLD * .6) {
        // at rest or without motion, move the picture directly
        if (cfg.live) { liveAct({ focus: id }); return; }
      }
      let j = states.findIndex((s, i) => i > 0 && s.focus === id && !s.zoom && s.order.includes(id)); if (id === cfg.start.focus) j = 0;
      const span = root.offsetHeight - stage.offsetHeight;
      scrollTo({ top: root.offsetTop + ((j ? j - HOLD / 2 : 0) / N) * span, behavior: "smooth" });
    }
    let raf = 0;
    // without motion the page shows one frame: the last by default, or cfg.stillAt
    if (still) { cur = cfg.stillAt ?? N; }
    else addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(progress() * N); }); }, { passive: true });
    addEventListener("resize", () => layout(false));
    if (!still) cur = progress() * N;
    layout(true);
    document.fonts?.ready.then(() => layout(true));
    return { render, layout, states, steps };
  };
})();
