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

  for (const button of $$(".share-download")) {
    button.addEventListener("click", async () => {
      const url = "https://getpaper.sh/mac/";
      if (navigator.share) {
        try { await navigator.share({ url }); return; }
        catch (error) { if (error.name === "AbortError") return; }
      }
      const ok = await copyText(url);
      say(ok ? "Copied" : "Copy failed: select the text and copy it.");
    });
  }

  for (const video of $$("video")) {
    const frame = document.createElement("div");
    frame.className = "video-frame";
    video.before(frame); frame.append(video);
    const play = document.createElement("button");
    play.type = "button"; play.className = "video-play";
    play.setAttribute("aria-label", "Play: " + video.getAttribute("aria-label"));
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18l15-9z"/></svg>';
    frame.append(play);
    play.addEventListener("click", async () => {
      try { await video.play(); video.controls = true; play.hidden = true; }
      catch { video.controls = true; play.hidden = true; }
    });
    video.controls = false;
  }

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

  const KIND = window.PaperKind = {
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
