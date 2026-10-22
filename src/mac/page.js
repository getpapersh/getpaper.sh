(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const live = $("#live");
  const say = (t) => { if (!live) return; live.textContent = ""; setTimeout(() => (live.textContent = t), 30); };

  const themeBtns = $$("[data-theme-set]");
  const media = matchMedia("(prefers-color-scheme: dark)");
  const store = { get() { try { return localStorage.getItem("pm-theme"); } catch { return null; } }, set(v) { try { v ? localStorage.setItem("pm-theme", v) : localStorage.removeItem("pm-theme"); } catch {} } };
  function applyTheme() {
    const pin = store.get();
    root.dataset.mode = pin || (media.matches ? "dark" : "light");
    for (const b of themeBtns) b.setAttribute("aria-pressed", String((b.dataset.themeSet || null) === (pin || "") || (!pin && b.dataset.themeSet === "")));
  }
  for (const b of themeBtns) b.addEventListener("click", () => { store.set(b.dataset.themeSet || null); applyTheme(); });
  media.addEventListener?.("change", applyTheme);
  applyTheme();

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    const ta = Object.assign(document.createElement("textarea"), { value: t, readOnly: true });
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove(); return ok;
  }
  function wireCopy(btn, getText) {
    const lbl = $(".lbl", btn) || btn, idle = lbl.textContent;
    let timer;
    btn.addEventListener("click", async () => {
      const ok = await copyText(getText());
      clearTimeout(timer);
      btn.classList.toggle("done", ok);
      lbl.textContent = ok ? "Copied" : "Select and copy";
      say(ok ? btn.dataset.after || "Copied" : "Copy failed: select the text and copy it.");
      timer = setTimeout(() => { btn.classList.remove("done"); lbl.textContent = idle; }, 2400);
    });
  }
  for (const b of $$("[data-copy]")) wireCopy(b, () => b.dataset.copy || $("#" + b.dataset.copyFrom).textContent.trim());

  for (const list of $$("[role=tablist][data-ways]")) {
    const tabs = $$("[role=tab]", list);
    const pick = (t, focus) => {
      for (const x of tabs) {
        const on = x === t;
        x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1;
        $("#" + x.getAttribute("aria-controls")).hidden = !on;
      }
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => pick(t));
      t.addEventListener("keydown", (e) => {
        const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault(); pick(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
  }

  const KIND = {
    ed: '<i class="tb"></i><b class="gut"></b><b class="ln"><i style="--w:34%" class="k"></i><i style="--w:58%"></i><i style="--w:46%" class="f"></i><i style="--w:30%"></i><i style="--w:52%" class="s"></i><i style="--w:0"></i><i style="--w:40%" class="k"></i><i style="--w:62%"></i><i style="--w:36%" class="f"></i><i style="--w:48%"></i></b>',
    te: '<i class="tb"></i><b class="ln"><i style="--w:22%" class="p"></i><i style="--w:46%" class="g"></i><i style="--w:40%" class="g"></i><i style="--w:52%" class="g"></i><i style="--w:0"></i><i style="--w:28%" class="p"></i><i style="--w:54%"></i><i style="--w:12%" class="p"></i></b>',
    ph: '<i class="tb"></i><b class="url"></b><b class="photo"></b><b class="ln"><i style="--w:62%" class="h"></i><i style="--w:88%"></i><i style="--w:74%"></i></b>',
    mu: '<i class="tb"></i><b class="art"></b><b class="ln c"><i style="--w:44%" class="h"></i><i style="--w:30%"></i></b>',
    dc: '<i class="tb"></i><b class="ln"><i style="--w:56%" class="h"></i><i style="--w:90%"></i><i style="--w:84%"></i><i style="--w:70%"></i></b><b class="fig"></b>',
  };
  const winHTML = (k) => KIND[k] || KIND.dc;

  // Geometry contract: strip units are fractions of the screen's usable width (1 = full width), the
  // width presets PaperMac uses. Everything else is px of the stage, recomputed on resize.
  function StripDemo(fig) {
    const stage = $(".stage", fig), layers = $$(".trk", fig), scr = $(".scr", fig), cap = $(".cap", fig), map = $(".map", fig), btn = $(".pause", fig);
    let wins = [
      { id: "a", k: "ph", w: .5 }, { id: "b", k: "ed", w: .5 }, { id: "c", k: "te", w: .34 },
      { id: "d", k: "mu", w: .5 }, { id: "e", k: "dc", w: .67 }, { id: "f", k: "ed", w: .5 },
    ];
    const START = JSON.stringify(wins);
    let focus = "b", zoom = false, G;
    const els = new Map();
    function make(win, hidden) {
      const pair = layers.map((L) => {
        const a = document.createElement("div");
        a.className = "win " + win.k; a.innerHTML = winHTML(win.k);
        if (hidden) a.style.opacity = "0";
        $(".track", L).append(a); return a;
      });
      els.set(win.id, pair);
    }
    wins.forEach((w) => make(w));
    function geo() {
      const W = stage.clientWidth, H = stage.clientHeight;
      let sh = H - 8, sw = sh * 1.6;
      if (sw > W * .9) { sw = W * .9; sh = sw / 1.6; }
      const sx = (W - sw) / 2, sy = (H - sh) / 2, b = Math.max(5, sw * .011);
      const ix = sx + b, iy = sy + b, iw = sw - 2 * b, ih = sh - 2 * b;
      const bar = Math.max(9, ih * .05), g = iw * .014, top = iy + bar + g, h = ih - bar - 2 * g;
      G = { W, H, sx, sy, sw, sh, ix, iy, iw, ih, bar, g, top, h, U: iw - 2 * g };
      Object.assign(scr.style, { left: sx + "px", top: sy + "px", width: sw + "px", height: sh + "px" });
      scr.style.setProperty("--b", b + "px"); scr.style.setProperty("--bar", bar + "px");
      const r = Math.max(4, sw * .012);
      layers[1].style.clipPath = `inset(${iy + bar}px ${W - ix - iw}px ${H - iy - ih}px ${ix}px round 0 0 ${r}px ${r}px)`;
      fig.style.setProperty("--u", (h / 30).toFixed(2) + "px");
    }
    const px = (w) => w * (G.U + G.g) - G.g;
    function layout() {
      let x = 0; const pos = new Map();
      for (const w of wins) { pos.set(w.id, { x, wpx: px(w.w) }); x += px(w.w) + G.g; }
      const T = x - G.g, f = pos.get(focus);
      let s = 1, tx = G.ix + G.iw / 2 - (f.x + f.wpx / 2);
      if (zoom) { s = Math.min(1, (G.iw - 2 * G.g) / T); tx = G.ix + G.iw / 2 - (s * T) / 2; }
      for (const L of layers) {
        const t = $(".track", L);
        t.style.transformOrigin = `0 ${G.top + G.h / 2}px`;
        t.style.transform = `translateX(${tx}px) scale(${s})`;
      }
      for (const w of wins) {
        const p = pos.get(w.id);
        for (const el of els.get(w.id)) {
          Object.assign(el.style, { width: p.wpx + "px", height: G.h + "px", top: G.top + "px", transform: `translateX(${p.x}px)`, fontSize: G.h / 30 + "px" });
          el.classList.toggle("f", w.id === focus);
        }
      }
      // minimap: the whole Strip, the focused window, and the part the screen shows
      if (map) {
        const MW = map.clientWidth || 240, k = MW / T;
        const v0 = Math.max(0, (G.ix - tx) / s), v1 = Math.min(T, (G.ix + G.iw - tx) / s);
        map.innerHTML = wins.map((w) => { const p = pos.get(w.id); return `<b class="${w.id === focus ? "f" : ""}" style="left:${p.x * k}px;width:${Math.max(3, p.wpx * k - 2)}px"></b>`; }).join("")
          + `<u style="left:${v0 * k - 3}px;width:${(v1 - v0) * k + 6}px"></u>`;
      }
    }
    const setCap = (t) => {
      if (!cap) return;
      cap.classList.add("out");
      setTimeout(() => { cap.textContent = t; cap.classList.remove("out"); }, 220);
    };
    const BEATS = JSON.parse(fig.dataset.beats);
    const ACTIONS = [
      () => { focus = "c"; },
      () => { const i = wins.findIndex((w) => w.id === "c"); const n = { id: "n", k: "dc", w: .5 }; wins.splice(i + 1, 0, n); make(n, true); focus = "n"; requestAnimationFrame(() => els.get("n").forEach((e) => (e.style.opacity = ""))); },
      () => { wins.find((w) => w.id === "n").w = 1; },
      () => { zoom = true; },
      () => { zoom = false; focus = "e"; },
      () => { const old = els.get("n"); old.forEach((e) => (e.style.opacity = "0")); setTimeout(() => old.forEach((e) => e.remove()), 600); wins = JSON.parse(START); focus = "b"; },
    ];
    let beat = -1, timer = null, playing = !reduced(), visible = false;
    function step() {
      beat = (beat + 1) % ACTIONS.length;
      ACTIONS[beat](); layout(); setCap(BEATS[beat]);
    }
    function sched() {
      clearInterval(timer); timer = null;
      if (playing && visible) timer = setInterval(step, 2700);
    }
    btn?.addEventListener("click", () => {
      playing = !playing;
      btn.dataset.paused = String(!playing);
      $(".lbl", btn).textContent = playing ? "Pause" : "Play";
      sched();
    });
    if (!playing && btn) { btn.dataset.paused = "true"; $(".lbl", btn).textContent = "Play"; }
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sched(); }, { threshold: .15 }).observe(fig);
    geo(); fig.classList.add("still"); layout();
    if (cap) cap.textContent = fig.dataset.rest || "";
    requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.remove("still")));
    let rz; addEventListener("resize", () => { clearTimeout(rz); fig.classList.add("still"); geo(); layout(); rz = setTimeout(() => fig.classList.remove("still"), 120); });
  }
  for (const f of $$("[data-strip-demo]")) StripDemo(f);

  // Coordinates are % of the screen's window area (below the menu bar); duo pictures use % of the figure.
  const W = (id, x, y, w, h, k = "ed", fl = "") => ({ id, x, y, w, h, k, fl });
  const row = (ids, xs, ws, y = 0, h = 100, f = "", ks = "phedtemudced") => [...ids].map((id, i) => W(id, xs[i], y, ws[i], h, ks.slice((i * 2) % 12, (i * 2) % 12 + 2), id === f ? "f" : ""));
  const S = {
    strip: [
      row("abcde", [-30, 20, 70, 120, 170], [48, 48, 48, 48, 48], 0, 100, "b"),
      row("abcde", [-80, -30, 20, 70, 120], [48, 48, 48, 48, 48], 0, 100, "c"),
      row("abcde", [-130, -80, -30, 20, 70], [48, 48, 48, 48, 48], 0, 100, "d"),
    ],
    resize: [
      row("abc", [1, 51, 101], [48, 48, 48], 0, 100, "b"),
      row("abc", [-34, 15, 87], [48, 70, 48], 0, 100, "b"),
      row("abc", [-49, 1, 101], [48, 98, 48], 0, 100, "b"),
    ],
    lanes2: [
      row("ab", [1, 51], [48, 48], 0, 100, "b"),
      [...row("ab", [1, 51], [48, 48], 0, 48.5), ...row("cd", [1, 37], [34, 48], 51.5, 48.5, "c", "temued")],
    ],
    stack2: [
      row("abc", [1, 51, 101], [48, 48, 48], 0, 100, "c"),
      [W("a", 1, 0, 48, 100, "ph"), W("b", 51, 0, 48, 48.5, "ed"), W("c", 51, 51.5, 48, 48.5, "te", "f")],
    ],
    overview: [
      row("abcde", [-30, 20, 82, 132, 182], [48, 60, 48, 48, 48], 0, 100, "b"),
      row("abcde", [3, 22.5, 46, 64, 82.5], [18, 22, 17, 17, 15], 30, 36, "b"),
    ],
    minimap: [
      [...row("abcd", [-30, 20, 70, 120], [48, 48, 48, 48], 0, 100, "b"), W("mm", 24, 78, 52, 16, "mm"), W("mv", 33.5, 75.5, 16, 21, "mv")],
      [...row("abcd", [-80, -30, 20, 70], [48, 48, 48, 48], 0, 100, "c"), W("mm", 24, 78, 52, 16, "mm"), W("mv", 46.5, 75.5, 16, 21, "mv")],
    ],
    switcher: [
      row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"),
      [...row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"), W("sw", 18, 26, 64, 46, "sw", "s1")],
      [...row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"), W("sw", 18, 26, 64, 46, "sw", "s3")],
      row("abc", [-80, -30, 20], [48, 48, 48], 0, 100, "c"),
    ],
    send: [
      [W("a", 4, 32, 19, 38, "ph"), W("b", 25, 32, 19, 38, "ed", "f"), W("c", 56, 32, 19, 38, "te"), W("d", 77, 32, 19, 38, "mu")],
      [W("a", 4, 32, 19, 38, "ph"), W("b", 40.5, 24, 19, 38, "ed", "f lift"), W("c", 56, 32, 19, 38, "te"), W("d", 77, 32, 19, 38, "mu")],
      [W("a", 14.5, 32, 19, 38, "ph"), W("b", 56, 32, 19, 38, "ed", "f"), W("c", 77, 32, 19, 38, "te"), W("d", 98, 32, 19, 38, "mu", "gone")],
    ],
    displays: [
      [W("a", 4, 32, 19, 38, "ph"), W("b", 25, 32, 19, 38, "ed", "f"), W("c", 46, 32, 19, 38, "te", "gone"), W("d", 56, 32, 19, 38, "mu"), W("e", 77, 32, 19, 38, "dc")],
      [W("a", -17, 32, 19, 38, "ph", "gone"), W("b", 4, 32, 19, 38, "ed"), W("c", 25, 32, 19, 38, "te", "f"), W("d", 56, 32, 19, 38, "mu"), W("e", 77, 32, 19, 38, "dc")],
    ],
    lanes3: [
      [...row("ab", [1, 51], [48, 48], 0, 48.5), ...row("cd", [1, 37], [34, 48], 51.5, 48.5, "c", "temued")],
      [...row("ab", [1, 51], [48, 48], 0, 31.5), ...row("cd", [1, 37], [34, 48], 34.25, 31.5, "", "temued"), ...row("ef", [1, 51], [48, 48], 68.5, 31.5, "e", "dcph")],
    ],
    uneven: [
      [...row("ab", [1, 51], [48, 48], 0, 48.5), ...row("cd", [1, 37], [34, 48], 51.5, 48.5, "c", "temued")],
      [...row("ab", [1, 51], [48, 48], 0, 66), ...row("cd", [1, 37], [34, 48], 69, 31, "c", "temued")],
      [...row("ab", [1, 51], [48, 48], 0, 31), ...row("cd", [1, 37], [34, 48], 34, 66, "c", "temued")],
    ],
    stack3: [
      [W("a", 1, 0, 48, 100, "ph"), W("b", 51, 0, 48, 48.5, "ed"), W("c", 51, 51.5, 48, 48.5, "te"), W("d", 101, 0, 48, 100, "mu", "f")],
      [W("a", 1, 0, 48, 100, "ph"), W("b", 51, 0, 48, 31.5, "ed"), W("c", 51, 34.25, 48, 31.5, "te"), W("d", 51, 68.5, 48, 31.5, "mu", "f")],
    ],
    previews: [
      [...row("abcd", [-30, 20, 70, 120], [48, 48, 48, 48], 0, 100, "b"), W("mm", 24, 78, 52, 16, "mm"), W("mv", 33.5, 75.5, 16, 21, "mv"), W("cur", 70, 96, 5, 9, "cur")],
      [...row("abcd", [-30, 20, 70, 120], [48, 48, 48, 48], 0, 100, "b"), W("mm", 24, 78, 52, 16, "mm"), W("mv", 33.5, 75.5, 16, 21, "mv"), W("cur", 64, 84, 5, 9, "cur"), W("pv", 52, 30, 30, 42, "pv te")],
    ],
    synced: [
      [W("a", 4, 32, 19, 38, "ph"), W("b", 25, 32, 19, 38, "ed", "f"), W("c", 56, 32, 19, 38, "te"), W("d", 77, 32, 19, 38, "mu"), W("e", 108, 32, 19, 38, "dc", "gone")],
      [W("a", -27, 32, 19, 38, "ph", "gone"), W("b", 4, 32, 19, 38, "ed"), W("c", 25, 32, 19, 38, "te", "f"), W("d", 56, 32, 19, 38, "mu"), W("e", 77, 32, 19, 38, "dc")],
    ],
    limelight: [
      row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"),
      Object.assign(row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"), { cls: "ll" }),
    ],
    names: [
      Object.assign(row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"), { cls: "" }),
      Object.assign(row("abc", [-30, 20, 70], [48, 48, 48], 0, 100, "b"), { cls: "named" }),
    ],
    snooze: [
      row("abc", [1, 34, 67], [32, 32, 32], 0, 100, "b"),
      [W("a", 1, 0, 48, 100, "ph"), W("b", 84, 80, 12, 14, "ed", "snz"), W("c", 51, 0, 48, 100, "te", "f")],
      row("abc", [1, 34, 67], [32, 32, 32], 0, 100, "b"),
    ],
    select: [
      [W("a", 1, 0, 26, 100, "ph"), W("b", 29, 0, 48, 100, "ed"), W("c", 79, 0, 36, 100, "te")],
      [W("a", 1, 0, 26, 100, "ph", "sel"), W("b", 29, 0, 48, 100, "ed", "sel"), W("c", 79, 0, 36, 100, "te", "sel")],
      [W("a", 1, 0, 32, 100, "ph", "sel"), W("b", 34, 0, 32, 100, "ed", "sel"), W("c", 67, 0, 32, 100, "te", "sel")],
      [W("a", 1, 0, 32, 100, "ph"), W("b", 34, 0, 32, 100, "ed", "f"), W("c", 67, 0, 32, 100, "te")],
    ],
  };
  const DUO = new Set(["send", "displays", "synced"]);
  const special = {
    mm: '<i style="left:2%;width:18%"></i><i class="f" style="left:22%;width:18%"></i><i style="left:42%;width:12%"></i><i style="left:56%;width:18%"></i><i style="left:76%;width:22%"></i>',
    sw: '<span class="t ph"></span><span class="t ed"></span><span class="t te"></span><span class="t mu"></span>',
    cur: '<svg viewBox="0 0 12 18" aria-hidden="true"><path d="M1 1v14l3.6-3.3 2.5 5.5 2.4-1.1-2.5-5.4H12z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  };
  function Picture(fig) {
    const name = fig.dataset.pic, states = S[name];
    if (!states) return;
    const duo = DUO.has(name);
    const box = $(".mini", fig);
    box.classList.toggle("duo", duo);
    box.innerHTML = duo
      ? '<div class="scr2 l"><i class="mb"></i></div><div class="scr2 r"><i class="mb"></i></div><div class="area"></div>'
      : '<div class="mb"><b class="ap"></b><span class="dt"><i></i><i></i><i></i></span></div><div class="area"></div>';
    const area = $(".area", box), els = new Map();
    for (const st of states) for (const w of st) if (!els.has(w.id)) {
      const el = document.createElement("div");
      const sp = w.k.split(" ")[0];
      el.className = "w " + w.k;
      el.innerHTML = special[sp] ?? (sp === "mv" ? "" : sp === "pv" ? '<i class="tb"></i>' : winHTML(sp));
      area.append(el); els.set(w.id, el);
    }
    let i = 0, t = null;
    const show = (n) => {
      const st = states[n];
      box.className = "mini" + (duo ? " duo" : "") + (st.cls ? " " + st.cls : "");
      for (const [id, el] of els) {
        const w = st.find((x) => x.id === id);
        if (!w) { el.style.opacity = "0"; continue; }
        Object.assign(el.style, { left: w.x + "%", top: w.y + "%", width: w.w + "%", height: w.h + "%", opacity: "" });
        el.className = "w " + w.k + (w.fl ? " " + w.fl.split(" ").map((f) => (/^s\d$/.test(f) ? "on" + f.slice(1) : f)).join(" ") : "");
      }
    };
    const play = () => {
      if (reduced()) { show(states.length - 1); return; }
      clearInterval(t); i = 0; show(0);
      t = setInterval(() => { i++; if (i >= states.length) { clearInterval(t); return; } show(i); }, 1250);
    };
    show(reduced() ? states.length - 1 : 0);
    let seen = false;
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen) { seen = true; setTimeout(play, 250); } }, { threshold: .6 }).observe(fig);
    fig.addEventListener("pointerenter", play);
    fig.addEventListener("focusin", play);
  }
  $$("[data-pic]").forEach(Picture);

  for (const sc of $$("[data-strip-scroller]")) {
    const track = $(".rail", sc), items = $$(".rail > *", sc), mm = $(".railmap", sc), prev = $(".prev", sc), next = $(".next", sc);
    mm.innerHTML = items.map((it, n) => `<button type="button" aria-label="Show ${it.querySelector("figcaption")?.textContent.trim() || "item " + (n + 1)}"></button>`).join("") + "<u></u>";
    const bars = $$("button", mm), frame = $("u", mm);
    const go = (n) => items[Math.max(0, Math.min(items.length - 1, n))].scrollIntoView({ behavior: reduced() ? "auto" : "smooth", inline: "start", block: "nearest" });
    bars.forEach((b, n) => b.addEventListener("click", () => go(n)));
    const firstVisible = () => { const x = track.scrollLeft; let best = 0; items.forEach((it, n) => { if (it.offsetLeft - track.offsetLeft <= x + 8) best = n; }); return best; };
    prev?.addEventListener("click", () => go(firstVisible() - 1));
    next?.addEventListener("click", () => go(firstVisible() + 1));
    const sync = () => {
      const max = track.scrollWidth, w = track.clientWidth, x = track.scrollLeft, M = mm.clientWidth;
      const n = items.length, gapPx = 4, bw = (M - gapPx * (n - 1)) / n;
      bars.forEach((b, k) => { b.style.left = k * (bw + gapPx) + "px"; b.style.width = bw + "px"; });
      frame.style.left = (x / max) * M - 3 + "px"; frame.style.width = (w / max) * M + 6 + "px";
      if (prev) prev.disabled = x < 4; if (next) next.disabled = x > max - w - 4;
      items.forEach((it, k) => { const l = it.offsetLeft - track.offsetLeft - x; bars[k].classList.toggle("in", l > -it.clientWidth / 2 && l < w - it.clientWidth / 2); });
    };
    track.addEventListener("scroll", sync, { passive: true }); addEventListener("resize", sync); sync();
  }
})();
