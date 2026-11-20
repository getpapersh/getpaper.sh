(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  // Phones show the recording alone (the same query as the CSS); the interactive demo starts at tablet width.
  const phone = matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 520px)");
  const reduced = () => motion.matches;
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

  const promo = $(".hero-promo");
  if (!reduced()) {
    promo.autoplay = true;
    promo.play().catch(() => {});
  }
  motion.addEventListener("change", () => {
    if (reduced()) {
      promo.autoplay = false;
      promo.pause();
    }
  });

  function StripDemo(fig) {
    const strips = $$("[data-strip]", fig);
    const windows = $$(".win", fig), initialWindowCount = windows.length, stripLimit = 4;
    // New windows rotate through every example page in a shuffled round, never the same app twice in a row; the
    // next round starts once all are used, and a page already open gets a number.
    let round = [], lastApp = "";
    const shuffle = list => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const nextPage = () => {
      if (!round.length) {
        // Each app's pages in a random order, dealt one app at a time in a random app order, so neighbours never
        // share an app (every app has the same number of pages).
        const byApp = Map.groupBy(shuffle([...$("#demo-new-window", fig).content.children]), page => page.dataset.app);
        while ([...byApp.values()].some(pages => pages.length)) {
          const apps = shuffle([...byApp.keys()].filter(app => byApp.get(app).length));
          if (apps.length > 1 && apps[0] === (round.at(-1)?.dataset.app ?? lastApp)) apps.push(apps.shift());
          for (const app of apps) round.push(byApp.get(app).pop());
        }
      }
      const page = round.shift();
      lastApp = page.dataset.app;
      return page;
    };
    const canvas = $(".demo-canvas", fig), status = $("[role=status]", fig);
    const tourCue = $(".demo-tour", fig), app = $("[data-demo-app]", fig);
    const minimap = $(".demo-minimap", fig), mapRows = $$(".map-row", minimap), mapTrack = $(".map-track", minimap);
    // Floating windows have their own zone in the Minimap header, as in the app: a chip raises the window, dragging
    // it onto a row tiles it there, and dropping a tile on the zone floats that window.
    const floatZone = $(".map-float", minimap);
    const floatChip = Object.assign(document.createElement("button"), { type: "button", className: "map-float-chip", hidden: true });
    floatChip.append(Object.assign(document.createElement("kbd"), { className: "jump-badge", ariaHidden: "true" }));
    floatZone.append(floatChip);
    floatChip.addEventListener("click", () => { if (floating) run("jump", true, floating.win); });
    // Minimized windows wait in their own zone left of Floating, as in the app: a chip restores its window, dragging
    // it onto a row restores it there, and dropping a tile on the zone minimizes that window.
    const minZone = $(".map-min", minimap), minChips = new Map(), minimized = [];
    const statusMenu = $(".demo-status-menu", fig), menuSummary = $("summary", statusMenu);
    const desktopCount = $("[data-desktop-count]", statusMenu);
    // Desktops: each keeps its own Strips, Minimap rows, focus, minimized and floating windows and wallpaper; the
    // screen shows one at a time. Their pills sit at the left of the Minimap header, as in the app.
    const desktopsEl = $(".map-desktops", minimap), desktops = [];
    let desk = 0, desktopPills = [];
    const footageVideo = $(".demo-footage video", fig), footageInput = $("#demo-view-footage", fig);
    const menuButtons = new Map();
    const mapTiles = new Map();
    const buttons = new Map($$("[data-command]", fig).map(button => [button.dataset.command, button]));
    const pauseButton = buttons.get("pause");
    const settings = { map: "peek", focus: "centered", place: "after" };
    const selections = strips.map(strip => strip.firstElementChild);
    const presets = ["var(--standard-width)", "72cqw", "89cqw", "max(155px, 36cqw)"];
    let row = 0, current, target, timer, announcement, frame, lastCue, finishSlide, floating, mapTimer;
    let visible = false, stopped = false, footage = false, beat = 0;
    let jumping = false, switcherOpen = false, previews = true, expanded = false, noSlide = false, chordTimer;
    const tileWindows = new WeakMap();
    let mapOn = true, mapVisible = false;

    const track = () => strips[row];
    const active = () => target ?? selections[row];
    const board = () => fig.classList.contains("infinite");
    const center = win => win.offsetLeft + (win.offsetWidth - track().clientWidth) / 2;
    const items = () => [...track().children];
    const placement = win => {
      if (settings.focus === "centered") return center(win);
      const rail = track(), first = rail.firstElementChild, last = rail.lastElementChild;
      const start = first.offsetLeft, end = last.offsetLeft + last.offsetWidth - rail.clientWidth;
      if (settings.focus === "fill") return end < start ? (start + end) / 2 : Math.max(start, Math.min(end, center(win)));
      const left = win.offsetLeft, right = left + win.offsetWidth - rail.clientWidth;
      const reveal = Math.min(left, Math.max(right, rail.scrollLeft));
      return Math.max(start, Math.min(end, reveal));
    };
    const nearest = () => items().reduce((best, win) =>
      Math.abs(track().scrollLeft - center(win)) < Math.abs(track().scrollLeft - center(best)) ? win : best);
    const title = win => $(".tb", win).textContent;
    const announce = message => {
      clearTimeout(announcement);
      if (stopped) announcement = setTimeout(() => { status.textContent = message; }, 80);
    };
    const neighbor = delta => items()[items().indexOf(active()) + delta];
    const destination = delta => strips[row + delta];
    const full = win => win.hasAttribute("data-full");
    const width = win => full(win) ? "calc(100cqw - 2 * var(--gap))" : win.dataset.cqw ? `${win.dataset.cqw}cqw` :
      Number(win.dataset.preset) ? presets[Number(win.dataset.preset)] :
      win.hasAttribute("data-new") ? "max(180px, 50cqw)" : presets[0];
    // A window's rendered width; one on the hidden Strip is resolved by a probe in the visible Strip, where the
    // phone width rules and container units apply too.
    const cssWidth = win => {
      if (win.offsetWidth) return win.offsetWidth;
      const probe = document.createElement("i");
      probe.style.cssText = `position:absolute;visibility:hidden;width:${width(win)}`;
      track().append(probe);
      const px = probe.offsetWidth;
      probe.remove();
      return px;
    };
    const syncMap = () => {
      if (minimap.hidden) return;
      $("[data-map-app]", minimap).textContent = current.dataset.app;
      for (const [win, tile] of mapTiles) {
        if (win === current) tile.setAttribute("aria-current", "true");
        else tile.removeAttribute("aria-current");
      }
      mapRows.forEach((mapRow, i) => { mapRow.toggleAttribute("data-active", i === row); });
      paintFloats();
      paintMinimized();
      if (board()) return;
      // A Strip a move just emptied has no tiles to measure; it is about to disappear.
      const firstTile = $(".map-tile", mapRows[row]);
      if (!firstTile || !track().children.length) return;
      const rail = track(), start = rail.firstElementChild.offsetLeft, scale = mapScale();
      // The outline and the scrollbar thumb mark the whole screen at the tiles' scale, empty room beside the
      // windows included, as the app's do.
      // Kept inside the row: the Minimap's fixed 4 px tile gaps can add a pixel or two at the far ends.
      const rowWidth = mapRows[row].clientWidth;
      const left = Math.max(0, firstTile.offsetLeft + scale * (rail.scrollLeft - start));
      const width = Math.min(scale * rail.clientWidth, rowWidth - left);
      for (const [element, offset] of [[mapRows[row], 0], [minimap, mapRows[row].offsetLeft - mapTrack.offsetLeft]]) {
        element.style.setProperty("--view-left", `${offset + left}px`);
        element.style.setProperty("--view-width", `${width}px`);
      }
    };
    // Minimap px per Strip px, measured from the first tile, after the shared room before the windows.
    const mapScale = () => {
      const rail = track(), firstTile = $(".map-tile", mapRows[row]), lastTile = mapRows[row].lastElementChild;
      const start = rail.firstElementChild.offsetLeft;
      return (lastTile.offsetLeft + lastTile.offsetWidth - firstTile.offsetLeft) / (rail.lastElementChild.offsetLeft + rail.lastElementChild.offsetWidth - start);
    };
    const paintMap = () => {
      const had = minimap.contains(document.activeElement);
      minimap.hidden = !(mapVisible || jumping || fig.classList.contains("map-held")) || board();
      if (minimap.hidden && minimap.contains(tipFor)) hideTip();
      fig.classList.toggle("has-map", !minimap.hidden);
      syncMap();
      rescueFocus(had);
    };
    // A focused control that a board, a Strip change or a fading Minimap hides hands focus to the demo screen,
    // so shortcuts and screen readers keep their place. Chrome moves focus to <body> as soon as layout sees the
    // control hidden, so callers note whether the demo held focus before they hide anything.
    const holdsFocus = () => fig.contains(document.activeElement) && document.activeElement !== canvas;
    const rescueFocus = had => {
      const focused = document.activeElement;
      if (had && (!fig.contains(focused) || !focused.getClientRects().length)) canvas.focus({ preventScroll: true });
    };
    // Like the app, a Peek Minimap stays while the pointer or focus is on it.
    const releaseMap = () => {
      clearTimeout(mapTimer);
      if (mapVisible && settings.map === "peek" && !jumping && !minimap.matches(":hover, :focus-within, .dragging, .menu-open") && !minimap.querySelector(".carried")) {
        mapTimer = setTimeout(() => { mapVisible = false; paintMap(); }, 2000);
      }
    };
    const revealMap = (requested = false) => {
      mapVisible = mapOn && (settings.map !== "manual" || requested);
      paintMap();
      releaseMap();
    };
    const syncWidths = strip => {
      if (!strip.children.length) return;
      strip.style.setProperty("--first-width", width(strip.firstElementChild));
      strip.style.setProperty("--last-width", width(strip.lastElementChild));
      const mapRow = mapRows[strips.indexOf(strip)];
      [...strip.children].forEach((win, i) => {
        let tile = mapTiles.get(win);
        if (!tile) {
          tile = document.createElement("button");
          tile.type = "button";
          tile.className = "map-tile";
          tile.dataset.app = win.dataset.app;
          tile.append(Object.assign(document.createElement("b"), { textContent: title(win) }),
            Object.assign(document.createElement("small"), { textContent: win.dataset.app, ariaHidden: "true" }),
            Object.assign(document.createElement("kbd"), { className: "jump-badge", ariaHidden: "true" }));
          tileWindows.set(tile, win);
          tile.dataset.tip = `Focus ${title(win)} on its Strip. Drag it to move the window, or drag an edge to resize it. Right-click or press ⇧F10 for more.`;
          for (const side of ["start", "end"]) {
            const edge = Object.assign(document.createElement("i"), { className: "tile-edge", ariaHidden: "true" });
            Object.assign(edge.dataset, { edge: side, tip: `Drag to resize ${title(win)}.` });
            tile.append(edge);
          }
          tile.addEventListener("click", () => run("jump", true, win));
          mapTiles.set(win, tile);
        }
        const defaultWeight = win.hasAttribute("data-new") ? .5 : .53;
        const weight = full(win) ? 1 : win.dataset.cqw ? win.dataset.cqw / 100 : [defaultWeight, .72, .89, .36][Number(win.dataset.preset ?? 0)];
        tile.style.setProperty("--map-weight", weight);
        win.style.setProperty("--map-weight", weight);
        if (mapRow.children[i + 1] !== tile) mapRow.insertBefore(tile, mapRow.children[i + 1] ?? null);
      });
      const weights = rail => [...rail.children].map(win => Number(win.style.getPropertyValue("--map-weight")));
      const sum = list => list.reduce((total, weight) => total + weight, 0);
      minimap.style.setProperty("--map-total", Math.max(...strips.map(rail => sum(weights(rail)))));
      // Like the app's, the Minimap depicts everything the screen can travel, the centering room before a Strip's
      // first window and after its last included (in screen widths). Rows share the room before, so they stay aligned.
      // Windows sit a gap apart (their side margins), which the span counts too. A Strip a move just emptied is
      // skipped; it is about to disappear.
      const filled = strips.filter(rail => rail.children.length), shown = track().firstElementChild;
      const gap = shown && track().clientWidth ? 2 * parseFloat(getComputedStyle(shown).marginLeft) / track().clientWidth || 0 : 0;
      const lead = Math.max(...filled.map(rail => (1 - weights(rail)[0]) / 2));
      minimap.style.setProperty("--map-lead", lead);
      minimap.style.setProperty("--map-span", Math.max(...filled.map(rail =>
        lead + sum(weights(rail)) + gap * (rail.children.length - 1) + (1 - weights(rail).at(-1)) / 2)));
      paintJump();
    };
    // Why each command is unavailable right now; an empty reason means it is available.
    const blocked = (target = focusedWindow()) => {
      const zoomed = board() && "Close Infinite Canvas first.";
      const side = delta => !neighbor(delta) && `There is no window to the ${delta < 0 ? "left" : "right"}.`;
      const strip = delta => !destination(delta) && `There is no Strip ${delta < 0 ? "above" : "below"}.`;
      const alone = tiledCount() < 2 && "The demo keeps one window on its Strips.";
      // Moving past the first or last Strip starts a new one, unless the window is its Strip's only one.
      const make = delta => !destination(delta) && (items().length < 2 ? "This is the only window on its Strip."
        : strips.length >= stripLimit && `The demo stops at ${stripLimit} Strips.`);
      return {
        left: side(-1), right: side(1), above: strip(-1), below: strip(1),
        moveLeft: zoomed || side(-1), moveRight: zoomed || side(1),
        moveAbove: zoomed || make(-1), moveBelow: zoomed || make(1),
        full: zoomed || (floating?.win === target && "Return the window to the Strip to fill its width."), resize: zoomed, jumpTo: board() && "Infinite Canvas already shows the letters.",
        newWindow: zoomed,
        // A floating window may always close or minimize; a tiled one only while another stays on the Strips.
        float: zoomed || (!floating && alone), minimize: zoomed || (floating?.win !== target && alone), close: zoomed || (floating?.win !== target && alone),
      };
    };
    const syncButtons = () => {
      for (const [id, reason] of Object.entries(blocked())) buttons.get(id).setAttribute("aria-disabled", String(Boolean(reason)));
      buttons.get("full").setAttribute("aria-pressed", String(full(active())));
      buttons.get("float").setAttribute("aria-checked", String(Boolean(floating)));
      buttons.get("limelight").setAttribute("aria-checked", String(fig.classList.contains("limelight")));
      buttons.get("outline").setAttribute("aria-checked", String(fig.classList.contains("outline")));
      buttons.get("minimap").setAttribute("aria-checked", String(mapOn));
      buttons.get("overview").setAttribute("aria-pressed", String(switcherOpen));
      buttons.get("jumpTo").setAttribute("aria-pressed", String(jumping));
      buttons.get("infinite").setAttribute("aria-pressed", String(board()));
      buttons.get("previews").setAttribute("aria-checked", String(previews));
      for (const { button, setting, value } of settingButtons) {
        button.setAttribute("aria-pressed", String(settings[setting] === value));
        button.disabled = setting === "map" && !mapOn;
      }
      desktopCount.textContent = windows.length - minimized.length;
      paintDesktops();
      // The last tiled window's red and yellow lights are off, the way macOS greys a light that cannot act.
      const keep = tiledCount() < 2;
      for (const light of $$(".rail .tl-close, .rail .tl-minimize", fig)) {
        light.setAttribute("aria-disabled", String(keep));
        light.dataset.tip = keep ? "The demo keeps one window on its Strips." : light.dataset.tipBase;
        light.dataset.tipKeys = keep ? "" : light.dataset.keysBase;
      }
      const pin = $("[data-map-tool=pin]", minimap), pinned = settings.map === "pinned";
      pin.setAttribute("aria-pressed", String(pinned));
      pin.dataset.tip = pinned ? "Unpin the Minimap so it fades after focus changes." : "Pin the Minimap so it stays on screen.";
      for (const [id, proxy] of menuButtons) {
        const button = buttons.get(id);
        for (const attr of ["aria-disabled", "aria-checked", "aria-pressed"]) {
          if (button.hasAttribute(attr)) proxy.setAttribute(attr, button.getAttribute(attr));
        }
      }
      syncMap();
    };
    const select = win => {
      selections[row] = win;
      if (win !== current) {
        current?.removeAttribute("aria-current");
        win.setAttribute("aria-current", "true");
        current = win;
        app.textContent = win.dataset.app;
        if (settings.map !== "manual") revealMap();
        announce(`Strip ${row + 1}, ${title(win)}`);
      }
      syncButtons();
    };
    const syncScroll = () => {
      frame = null;
      if (board()) return;
      if (carry?.on || tileDrag?.on || sizing?.on) return syncMap();
      if (target && Math.abs(track().scrollLeft - placement(target)) < 1.5) {
        const win = target;
        target = null;
        select(win);
        return;
      }
      if (target && settings.focus !== "centered") return;
      select(nearest());
    };
    const focus = (win, smooth = false) => {
      target = null;
      if (board()) { select(win); return; }
      const left = placement(win);
      if (smooth && !reduced() && Math.abs(left - track().scrollLeft) >= 1.5) {
        target = win;
        syncButtons();
        track().scrollTo({ left, behavior: "smooth" });
      } else {
        track().scrollTo({ left, behavior: "instant" });
        select(win);
      }
    };
    const showStrip = (index, win = selections[index]) => {
      if (win?.parentElement !== strips[index]) win = strips[index].firstElementChild;
      const had = holdsFocus();
      finishSlide?.();
      const delta = index - row, previous = track();
      row = index;
      strips.forEach((strip, i) => { strip.hidden = !board() && i !== row; });
      focus(win);
      rescueFocus(had);
      // When the Strip on screen was just removed, the old one cannot slide out.
      const skip = noSlide;
      noSlide = false;
      if (!delta || reduced() || board() || skip) return;

      const incoming = track();
      previous.hidden = false;
      previous.inert = true;
      previous.setAttribute("data-slide", "");
      incoming.setAttribute("data-slide", "");
      const timing = { duration: 340, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" };
      const outgoing = previous.animate([{ translate: "0 0" }, { translate: `0 ${-100 * delta}%` }], timing);
      const arriving = incoming.animate([{ translate: `0 ${100 * delta}%` }, { translate: "0 0" }], timing);
      finishSlide = () => {
        finishSlide = null;
        arriving.onfinish = null;
        previous.hidden = true;
        previous.inert = false;
        previous.removeAttribute("data-slide");
        incoming.removeAttribute("data-slide");
        outgoing.cancel();
        arriving.cancel();
      };
      arriving.onfinish = finishSlide;
    };
    const move = delta => {
      const win = active(), next = neighbor(delta);
      if (!next) return;
      if (delta < 0) next.before(win);
      else next.after(win);
      syncWidths(track());
      focus(win);
      announce(`${title(win)} moved ${delta < 0 ? "left" : "right"}`);
    };
    // Strips come and go like the app's lanes: moving a window past the first or last Strip starts a new one, and
    // a Strip left empty disappears. A third Strip and more are Pro, as on the page's Free and Pro list.
    const tiledCount = () => strips.reduce((sum, rail) => sum + rail.children.length, 0);
    const watchScroll = strip => strip.addEventListener("scroll", () => {
      if (strip === track() && frame == null) frame = requestAnimationFrame(syncScroll);
    }, { passive: true });
    const labelStrips = () => strips.forEach((rail, i) => {
      rail.setAttribute("aria-label", `Strip ${i + 1}`);
      rail.style.setProperty("--row", i);
      mapRows[i].setAttribute("aria-label", `Strip ${i + 1}`);
    });
    const newRail = () => {
      const rail = Object.assign(document.createElement("div"), { className: "rail", hidden: !board() });
      rail.setAttribute("data-strip", "");
      rail.setAttribute("role", "group");
      watchScroll(rail);
      return rail;
    };
    const newMapRow = () => {
      const mapRow = Object.assign(document.createElement("div"), { className: "map-row" });
      mapRow.setAttribute("role", "group");
      mapRow.append(Object.assign(document.createElement("i"), { className: "map-view", ariaHidden: "true" }));
      return mapRow;
    };
    const addStrip = at => {
      const rail = newRail(), mapRow = newMapRow();
      if (at < strips.length) {
        strips[at].before(rail);
        mapRows[at].before(mapRow);
      } else {
        strips.at(-1).after(rail);
        mapRows.at(-1).after(mapRow);
      }
      strips.splice(at, 0, rail);
      mapRows.splice(at, 0, mapRow);
      selections.splice(at, 0, null);
      if (at <= row) row++;
      labelStrips();
      return at;
    };
    // Removes empty Strips (never the last one) and returns whether the Strip on screen was among them.
    const pruneStrips = () => {
      finishSlide?.();
      const shown = strips[row];
      for (let i = strips.length - 1; i >= 0; i--) {
        if (strips.length < 2 || strips[i].children.length) continue;
        strips[i].remove();
        mapRows[i].remove();
        strips.splice(i, 1);
        mapRows.splice(i, 1);
        selections.splice(i, 1);
      }
      labelStrips();
      const index = strips.indexOf(shown);
      row = index >= 0 ? index : Math.min(row, strips.length - 1);
      noSlide = index < 0;
      return index < 0;
    };
    const send = delta => {
      const win = active(), from = track(), created = !destination(delta);
      const to = destination(delta) ?? strips[addStrip(delta < 0 ? 0 : strips.length)];
      selections[strips.indexOf(from)] = neighbor(1) ?? neighbor(-1);
      const after = selections[strips.indexOf(to)];
      if (after?.parentElement === to) after.after(win);
      else to.append(win);
      syncWidths(from);
      syncWidths(to);
      pruneStrips();
      const index = strips.indexOf(to);
      showStrip(index, win);
      announce(`${title(win)} moved to ${created ? "new " : ""}Strip ${index + 1}`);
    };
    const setWidth = (win, message) => {
      win.style.setProperty("--window-width", width(win));
      syncWidths(track());
      focus(win);
      announce(`${title(win)}, ${message}`);
    };
    const clearCue = () => {
      lastCue?.removeAttribute("data-tour-active");
      tourCue.hidden = true;
    };
    const setTourPaused = paused => {
      stopped = paused;
      pauseButton.firstChild.textContent = paused ? "Resume tour " : "Pause tour ";
      $("kbd", pauseButton).hidden = paused;
      if (paused) pauseButton.removeAttribute("aria-keyshortcuts");
      else pauseButton.setAttribute("aria-keyshortcuts", "Escape");
      if (!paused && !visible) canvas.scrollIntoView({ block: "center", behavior: "instant" });
      schedule();
    };
    const takeOver = () => { if (!stopped) setTourPaused(true); };
    const showBoard = mode => {
      const had = holdsFocus();
      // Entering from the Strip view, the camera starts where the focused window already sits.
      const from = mode && !board() && !reduced() ? active().getBoundingClientRect() : null;
      cancelAnimationFrame(boardMove);
      if (pan) {
        if (canvas.hasPointerCapture(pan.id)) canvas.releasePointerCapture(pan.id);
        canvas.classList.remove("panning");
        pan = null;
      }
      if (mode) {
        closeSwitcher();
        setJumping(false);
      }
      fig.classList.toggle("infinite", mode === "infinite");
      $(".demo-board-title", fig).hidden = !mode;
      for (const button of $$(".rail .overview-pick", fig)) button.hidden = !mode;
      hideTip();
      showStrip(row, active());
      paintMap();
      paintJump();
      if (mode) fitBoard();
      if (from) flyIn(from);
      if (floating && !board()) moveFloat(floating.x, floating.y);
      rescueFocus(had);
    };
    const toggleBoard = mode => {
      showBoard(fig.classList.contains(mode) ? null : mode);
      announce(board() ? "Infinite Canvas. Drag to pan, zoom with the buttons, or type a window's letter." : `Strip ${row + 1}, ${title(active())}`);
    };
    const addWindow = () => {
      const positions = new Map(items().map(win => [win, win.offsetLeft]));
      const win = nextPage().cloneNode(true), bar = $(".tb", win), base = bar.textContent;
      // A page that is already open gets a number, as a second window of the same document would.
      for (let n = 2; windows.some(other => title(other) === bar.textContent); n++) bar.textContent = `${base} ${n}`;
      win.style.setProperty("--window-width", width(win));
      if (settings.place === "after") active().after(win);
      else track().append(win);
      windows.push(win);
      bindPicker(win);
      syncWidths(track());
      if (!reduced()) {
        const timing = { duration: 300, easing: "ease-out" };
        for (const [neighbor, left] of positions) {
          const shift = left - neighbor.offsetLeft;
          if (shift) neighbor.animate([{ translate: `${shift}px` }, { translate: "0px" }], timing);
        }
        win.animate([{ opacity: .3, scale: ".93" }, { opacity: 1, scale: "1" }], timing);
      }
      focus(win, true);
      announce(`${title(win)} opened.`);
    };
    const grip = win => $(".tb", win);
    const floatFocused = () => Boolean(floating) && document.activeElement === grip(floating.win);
    const focusedWindow = () => floatFocused() ? floating.win : active();
    const paintFloats = () => {
      floatZone.hidden = !floating && !fig.classList.contains("box-dragging");
      floatChip.hidden = !floating;
      if (!floating) return;
      const { win } = floating;
      floatChip.dataset.app = win.dataset.app;
      floatChip.setAttribute("aria-label", `${title(win)}, floating window`);
      floatChip.dataset.tip = `Raise ${title(win)}. Drag it onto a row to tile it there. Right-click or press ⇧F10 for more.`;
      floatChip.classList.toggle("focused", document.activeElement === grip(win));
    };
    const paintMinimized = () => {
      minZone.hidden = !minimized.length && !fig.classList.contains("box-dragging");
      for (const [win, chip] of minChips) {
        if (minimized.some(entry => entry.win === win)) continue;
        chip.remove();
        minChips.delete(win);
      }
      for (const { win } of minimized) {
        if (minChips.has(win)) continue;
        const chip = Object.assign(document.createElement("button"), { type: "button", className: "map-min-chip" });
        chip.dataset.app = win.dataset.app;
        chip.dataset.tip = `Restore ${title(win)}. Drag it onto a row to restore it there. Right-click or press ⇧F10 for more.`;
        chip.setAttribute("aria-label", `${title(win)}, minimized window`);
        chip.append(Object.assign(document.createElement("kbd"), { className: "jump-badge", ariaHidden: "true" }));
        chip.addEventListener("click", () => run("jump", true, win));
        minChips.set(win, chip);
        minZone.append(chip);
      }
    };
    // Returns the floating window to a Strip: where it came from, or a slot chosen in the Minimap.
    // Clears what floating gave a window, so it can tile again.
    const ground = win => {
      win.style.removeProperty("--float-x");
      win.style.removeProperty("--float-y");
      for (const attr of ["tabindex", "role", "aria-label", "data-tip"]) grip(win).removeAttribute(attr);
    };
    const unfloat = (strip = floating.strip, next = floating.next, navigate = true) => {
      const { win } = floating;
      // Its Strip may have gone while it floated.
      if (!strips.includes(strip)) [strip, next] = [track(), null];
      floating = drag = null;
      ground(win);
      strip.insertBefore(win, next?.parentElement === strip ? next : null);
      syncWidths(strip);
      if (navigate) showStrip(strips.indexOf(strip), win);
      paintFloats();
      announce(`${title(win)} returned to the Strip.`);
    };
    // The demo keeps one floating window, so floating another returns the first to its Strip.
    const floatWindow = win => {
      // The previous floating window goes home first; it may land beside this one and change what remains.
      if (floating) unfloat(undefined, undefined, false);
      const strip = win.parentElement, index = strips.indexOf(strip), next = win.nextElementSibling;
      const remaining = next ?? win.previousElementSibling;
      floating = { win, strip, next, x: 0, y: 0 };
      Object.assign(grip(win), { tabIndex: 0 });
      grip(win).setAttribute("role", "button");
      grip(win).setAttribute("aria-label", `${title(win)}, floating`);
      grip(win).dataset.tip = "Drag the title bar or use the arrow keys to move this window. Press Enter to return it to the Strip.";
      canvas.append(win);
      mapTiles.get(win).remove();
      if (selections[index] === win) selections[index] = remaining;
      syncWidths(strip);
      // Focus moves only if the floated window had it; either way the current Strip settles on its focused window.
      if (pruneStrips()) showStrip(row);
      else focus(active());
      paintFloats();
      announce(`${title(win)} floated above the Strip.`);
    };
    const toggleFloat = () => floating ? unfloat() : floatWindow(active());
    // Takes a tiled window off its Strip; a Strip left empty disappears and the view settles on a window.
    const lift = win => {
      if (target === win) target = null;
      const rail = win.parentElement, index = strips.indexOf(rail), next = win.nextElementSibling;
      const slot = [...rail.children].indexOf(win);
      if (selections[index] === win) selections[index] = next ?? win.previousElementSibling;
      win.remove();
      mapTiles.get(win)?.remove();
      syncWidths(rail);
      if (pruneStrips()) showStrip(row);
      else focus(active());
      return { strip: rail, next, slot };
    };
    // A minimized window is only in the Minimized zone; closing it just drops its entry.
    const discardMinimized = win => {
      minimized.splice(minimized.findIndex(entry => entry.win === win), 1);
      paintMinimized();
    };
    const closeWindow = win => {
      const had = fig.contains(document.activeElement);
      if (floating?.win === win) unfloat(undefined, undefined, false);
      if (minimized.some(entry => entry.win === win)) discardMinimized(win);
      else lift(win);
      windows.splice(windows.indexOf(win), 1);
      mapTiles.delete(win);
      paintJump();
      syncButtons();
      rescueFocus(had);
      announce(`${title(win)} closed.`);
    };
    const minimizeWindow = win => {
      const had = fig.contains(document.activeElement), floated = floating?.win === win;
      if (floated) unfloat(undefined, undefined, false);
      leftFrom.set(win, lineUp(win.parentElement));
      minimized.push({ win, floated, ...lift(win) });
      paintMinimized();
      paintJump();
      syncButtons();
      rescueFocus(had);
      announce(`${title(win)} minimized. Restore it from the Minimap or Overview.`);
    };
    // Back where it was, or onto the row and slot it was dropped on in the Minimap.
    // The Strip's whole order when each window was minimized, its minimized windows included, so windows minimized
    // one after another come back in their old order whatever order they return in.
    const leftFrom = new WeakMap();
    const lineUp = rail => {
      const line = [...rail.children];
      for (const { win, strip } of minimized) {
        if (strip !== rail) continue;
        const was = leftFrom.get(win), at = was.indexOf(win);
        const behind = was.slice(0, at).reverse().find(other => line.includes(other));
        const ahead = was.slice(at + 1).find(other => line.includes(other));
        line.splice(behind ? line.indexOf(behind) + 1 : ahead ? line.indexOf(ahead) : 0, 0, win);
      }
      return line;
    };
    const restoreWindow = (win, rail, before) => {
      const [entry] = minimized.splice(minimized.findIndex(item => item.win === win), 1), chosen = rail !== undefined;
      rail ??= strips.includes(entry.strip) ? entry.strip : track();
      if (before === undefined) {
        // After the nearest window that was before it and is on the Strip now, else before the nearest after it,
        // else its old position.
        const kids = [...rail.children], line = leftFrom.get(win), at = line.indexOf(win);
        const behind = line.slice(0, at).reverse().find(other => kids.includes(other));
        const ahead = line.slice(at + 1).find(other => kids.includes(other));
        before = behind ? behind.nextElementSibling : ahead ?? (rail === entry.strip ? rail.children[entry.slot] ?? null : null);
      }
      rail.insertBefore(win, before);
      syncWidths(rail);
      paintMinimized();
      const index = strips.indexOf(rail), floats = entry.floated && !chosen;
      // A window minimized while floating comes back floating, as in the app, unless it was dropped on a row.
      if (!floats) showStrip(index, win);
      else {
        floatWindow(win);
        grip(win).focus({ preventScroll: true });
        syncButtons();
      }
      announce(`${title(win)} restored${floats ? " as a floating window" : ` to Strip ${index + 1}`}.`);
    };
    // Traffic lights act on their own window, focused or not, as in macOS. A floating window may always close or
    // minimize; green fills the Strip's width (in the app it opens macOS full screen).
    // Whether the last light click acted; a double-click's second click is ignored only after one that did.
    let lightActed = false;
    const lightAction = (kind, win) => {
      if (floating?.win !== win || kind === "full") return run(kind, true, win);
      if (footage) return;
      takeOver();
      if (kind === "close") closeWindow(win);
      else minimizeWindow(win);
    };
    // Offsets are CSS px from the window's resting place; the window stays inside the screen.
    const moveFloat = (x, y) => {
      const { win } = floating, area = canvas.getBoundingClientRect(), box = win.getBoundingClientRect();
      const left = box.left - floating.x, top = box.top - floating.y;
      floating.x = Math.round(Math.min(Math.max(x, area.left - left), area.right - box.width - left));
      floating.y = Math.round(Math.min(Math.max(y, area.top - top), area.bottom - box.height - top));
      win.style.setProperty("--float-x", `${floating.x}px`);
      win.style.setProperty("--float-y", `${floating.y}px`);
    };
    const commands = {
      left: ["Meta+Alt+ArrowLeft ArrowLeft", () => focus(neighbor(-1), true), "Focus the window to the left."],
      right: ["Meta+Alt+ArrowRight ArrowRight", () => focus(neighbor(1), true), "Focus the window to the right."],
      above: ["Meta+Alt+ArrowUp", () => showStrip(row - 1), "Focus the Strip above."],
      below: ["Meta+Alt+ArrowDown", () => showStrip(row + 1), "Focus the Strip below."],
      moveLeft: ["Meta+Alt+Shift+ArrowLeft", () => move(-1), "Move the focused window one place left."],
      moveRight: ["Meta+Alt+Shift+ArrowRight", () => move(1), "Move the focused window one place right."],
      moveAbove: ["Meta+Alt+Shift+ArrowUp", () => send(-1), "Move the focused window to the Strip above."],
      moveBelow: ["Meta+Alt+Shift+ArrowDown", () => send(1), "Move the focused window to the Strip below."],
      full: ["Meta+Alt+KeyF", win => {
        win ??= focusedWindow();
        setWidth(win, win.toggleAttribute("data-full") ? "full width" : "restored width");
      }, "Expand the focused window to full width or restore it."],
      resize: ["Meta+Alt+Shift+Enter", () => {
        const win = active();
        win.removeAttribute("data-full");
        delete win.dataset.cqw;
        win.dataset.preset = (Number(win.dataset.preset ?? 0) + 1) % presets.length;
        setWidth(win, "next width preset");
      }, "Resize the focused window to the next width preset."],
      float: ["Meta+Alt+KeyT", toggleFloat, "Float the focused window above the Strip or return it."],
      limelight: ["Meta+Alt+Control+KeyL", () => {
        const on = fig.classList.toggle("limelight");
        syncButtons();
        announce(`Limelight ${on ? "on" : "off"}`);
      }, "Dim the other windows so the focused one is easier to see."],
      outline: ["Meta+Alt+Control+KeyB", () => {
        const on = fig.classList.toggle("outline");
        syncButtons();
        announce(`Outline ${on ? "on" : "off"}`);
      }, "Draw a border around the focused window when Outline is on."],
      minimap: ["Meta+Alt+KeyM", () => {
        mapOn = !mapOn || (settings.map !== "pinned" && !mapVisible);
        revealMap(true);
        syncButtons();
        announce(`Minimap ${mapOn ? "on" : "off"}`);
      }, "Show or hide a map of the windows and viewport."],
      // Option–Tab first; ⌥⌘O for systems that take Option–Tab before the page sees it.
      overview: ["Alt+Tab Meta+Alt+KeyO", (_, manual) => toggleSwitcher(manual), "Search or jump to any window on every Strip. Option–Tab works while the demo screen has focus."],
      jumpTo: ["Meta+Alt+KeyJ", (_, manual) => {
        setJumping(!jumping);
        // Safari leaves focus where it was when a button is clicked, and the letters are typed into the demo.
        if (jumping && manual && !fig.contains(document.activeElement)) canvas.focus({ preventScroll: true });
      }, "Show a letter on every window. Let go of the keys, then type a letter to jump there. Holding ⌥⇧⌘ works too."],
      infinite: ["Shift+KeyI", () => toggleBoard("infinite"), "Zoom out over the whole Desktop. Drag to pan and type a letter to jump."],
      previews: ["", () => {
        previews = !previews;
        syncButtons();
        announce(`Window previews ${previews ? "on" : "off"}`);
      }, "Preview a window when you hover its Minimap tile."],
      newWindow: ["Shift+KeyN", addWindow, "Open another example window and make room on the Strip."],
      minimize: ["Shift+KeyM", win => minimizeWindow(win ?? focusedWindow()), "Minimize the focused window to the Minimap."],
      close: ["Shift+KeyW", win => closeWindow(win ?? focusedWindow()), "Close the focused window."],
      pause: ["Escape", () => { if (!board()) focus(nearest()); }, "Stop the tour and take control of the demo."],
      focus: ["", win => focus(win, true)],
      jump: ["", win => {
        canvas.focus({ preventScroll: true });
        closeSwitcher(true);
        setJumping(false);
        if (board()) showBoard(null);
        if (floating?.win === win) {
          grip(win).focus({ preventScroll: true });
          announce(`${title(win)}, floating`);
        } else if (minimized.some(entry => entry.win === win)) restoreWindow(win);
        else showStrip(strips.indexOf(win.parentElement), win);
      }],
    };
    const run = (id, manual, arg) => {
      closeContext();
      if (carry || tileDrag || sizing) cancelDrags();
      // Read live, so a command follows where focus is now (the floating window's title bar, say), and resolved
      // once, so closing Overview below cannot hand the action a different window than the check saw.
      if (["full", "minimize", "close"].includes(id)) arg ??= focusedWindow();
      const reason = blocked(arg)[id], enabled = !reason;
      if (manual && !enabled && !footage) announce(reason);
      if (manual && footage && (!enabled || id === "pause")) return;
      if (manual && phone.matches) return;
      if (manual && footage) showView(false);
      if (manual) takeOver();
      if (jumping && id !== "jumpTo") setJumping(false);
      if (switcherOpen && id !== "overview" && id !== "jump") closeSwitcher();
      if (enabled) commands[id][1](arg, manual);
    };
    const showView = showFootage => {
      footageInput.checked = showFootage;
      $("#demo-view-demo", fig).checked = !showFootage;
      applyView();
    };
    // The demo stays laid out under the recording, so its scroll positions and windows survive a switch.
    const applyView = () => {
      footage = footageInput.checked;
      if (footage) {
        // Nothing modal survives into the recording: a drag, a pending hold, latched letters or an open Overview.
        cancelDrags();
        setJumping(false);
        closeSwitcher();
      }
      for (const element of [$(".demo-menu", fig), canvas, minimap]) element.inert = footage;
      if (footage) {
        statusMenu.open = false;
        hideTip();
        // A phone visitor starts the recording with its controls; it never downloads unasked.
        if (!reduced() && !phone.matches) footageVideo.play().catch(() => {});
      } else {
        footageVideo.pause();
        syncMap();
      }
      schedule();
    };
    for (const input of $$("[name=demo-view]", fig)) input.addEventListener("change", applyView);

    const shortcuts = id => commands[id][0].split(" ").filter(Boolean);
    const shortcutText = shortcut => shortcut
      .replace(/^Meta\+Alt\+(Control\+|Shift\+)?/, (_, modifier) =>
        modifier === "Control+" ? "⌃⌥⌘" : modifier === "Shift+" ? "⌥⇧⌘" : "⌥⌘")
      .replace(/^Alt\+/, "⌥").replace("Tab", "⇥")
      .replace("ArrowLeft", "←").replace("ArrowRight", "→").replace("ArrowUp", "↑").replace("ArrowDown", "↓")
      .replace("Shift+", "⇧").replace("Enter", "↵").replace("Key", "").replace("Escape", "Esc");
    const keymap = new Map();
    for (const [id, button] of buttons) {
      const kbd = document.createElement("kbd");
      kbd.textContent = shortcuts(id).length ? shortcutText(shortcuts(id)[0]) : "";
      kbd.setAttribute("aria-hidden", "true");
      kbd.hidden = button.hasAttribute("data-key-in-label") || !kbd.textContent;
      // shortcut: spells out Option chords only, the one kind a label names today.
      if (button.hasAttribute("data-key-in-label")) {
        const label = document.createElement("span");
        label.append(button.firstChild.textContent.trim(),
          Object.assign(document.createElement("span"), { className: "key-in-label", textContent: ` (${shortcuts(id)[0].replace("Alt+", "Option–")})` }));
        button.firstChild.replaceWith(label);
      }
      button.append(kbd);
      button.dataset.tipFor = id;
      button.setAttribute("aria-controls", "demo-canvas");
      if (shortcuts(id).length) button.setAttribute("aria-keyshortcuts", shortcuts(id).map(key => key.replace("Key", "")).join(" "));
      for (const key of shortcuts(id)) keymap.set(key, id);
      button.addEventListener("click", () => {
        if (id === "pause" && stopped) {
          showView(false);
          setTourPaused(false);
        } else run(id, true);
      });
    }
    for (const group of $$("[data-menu-commands]", statusMenu)) {
      for (const id of group.dataset.menuCommands.split(" ")) {
        const proxy = buttons.get(id).cloneNode(true);
        proxy.removeAttribute("data-command");
        proxy.removeAttribute("class");
        $("i", proxy)?.remove();
        $("svg", proxy)?.remove();
        proxy.hidden = false;
        proxy.addEventListener("click", () => {
          statusMenu.open = false;
          menuSummary.focus({ preventScroll: true });
          run(id, true);
        });
        menuButtons.set(id, proxy);
        group.append(proxy);
      }
    }
    const menuSettings = $(".demo-switches", fig).cloneNode(true);
    $("[data-menu-settings]", statusMenu).append(menuSettings);
    for (const proxy of $$("[data-command]", menuSettings)) {
      const id = proxy.dataset.command;
      proxy.removeAttribute("data-command");
      proxy.classList.remove("btn", "quiet", "small");
      proxy.addEventListener("click", () => run(id, true));
      menuButtons.set(id, proxy);
    }
    const setSetting = (setting, value) => {
      settings[setting] = value;
      if (setting === "map") {
        fig.dataset.mapMode = value;
        revealMap();
      } else if (setting === "focus") {
        fig.dataset.focusMode = value;
        focus(active());
      }
      syncButtons();
    };
    const settingHelp = {
      "map:pinned": "Keep the Minimap visible.",
      "map:peek": "Show the Minimap briefly when focus changes.",
      "map:manual": "Show the Minimap only when requested.",
      "focus:centered": "Center each focused window, including the first and last.",
      "focus:fill": "Center when possible and align the Strip at its edges.",
      "focus:packed": "Scroll only enough to reveal the focused window.",
      "place:after": "Insert new windows immediately after the focused window.",
      "place:end": "Append new windows to the end of the Strip.",
    };
    const settingButtons = $$("[data-setting]", fig).map(button => {
      const { setting, value } = button.dataset;
      button.addEventListener("click", () => {
        if (footage) showView(false);
        takeOver();
        setSetting(setting, value);
      });
      return { button, setting, value };
    });

    // Jump to Window: Strip 1 takes the top letter row and Strip 2 the home row, as in the app; a floating window
    // takes the next free key, like the app's auxiliary windows. Letters are typed bare and only show once ⌘, ⌥ and
    // ⌃ are up, because macOS acts on chords such as ⌥⇧⌘Q (log out at once) before a web page sees them.
    const jumpRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    // One Strip uses the home row; two use the top and home rows; three use top, home and bottom; more share the
    // rows in order, each continuing along its row (the app's SpatialJump). Anything left takes the next free key.
    const jumpKeys = () => {
      const keys = new Map(), rows = jumpRows.map(letters => [...letters]), lanes = strips.map(rail => [...rail.children]);
      lanes.forEach((wins, lane) => {
        const bank = lanes.length === 1 ? 1 : Math.floor(lane * Math.min(lanes.length, 3) / lanes.length);
        for (const win of wins) if (rows[bank].length) keys.set(win, rows[bank].shift());
      });
      const free = rows.flat();
      for (const win of [...lanes.flat(), floating?.win, ...board() ? [] : minimized.map(entry => entry.win)]) {
        if (win && !keys.has(win) && free.length) keys.set(win, free.shift());
      }
      return keys;
    };
    const paintJump = () => {
      const keys = jumpKeys();
      for (const win of windows) {
        const key = keys.get(win) ?? "";
        $(".win-badge", win).textContent = key;
        const pick = $(":scope > .overview-pick", win);
        $(".jump-badge", pick).textContent = pick.dataset.tipKeys = board() ? key : "";
        if (board() && key) pick.setAttribute("aria-keyshortcuts", key);
        else pick.removeAttribute("aria-keyshortcuts");
        const badge = mapTiles.get(win)?.querySelector(".jump-badge");
        if (badge) badge.textContent = key;
      }
      $(".jump-badge", floatChip).textContent = floating ? keys.get(floating.win) ?? "" : "";
      for (const [win, chip] of minChips) $(".jump-badge", chip).textContent = keys.get(win) ?? "";
      // The floating window is hidden on the canvas; its letter lives on a labelled target in the title bar.
      const floatTarget = $(".board-float", fig);
      floatTarget.hidden = !(board() && floating);
      if (floating) {
        $("span", floatTarget).textContent = `${title(floating.win)} (floating)`;
        floatTarget.setAttribute("aria-label", `Jump to ${title(floating.win)}, floating`);
        $(".jump-badge", floatTarget).textContent = keys.get(floating.win) ?? "";
      }
    };
    const setJumping = on => {
      clearTimeout(chordTimer);
      if (on === jumping) return;
      jumping = on;
      fig.classList.toggle("jumping", on);
      paintJump();
      if (on) {
        closeSwitcher();
        clearTimeout(mapTimer);
        announce(`Jump to Window. Let go of the keys, then type a letter: ${[...jumpKeys()].map(([win, key]) => `${key} ${title(win)}`).join(", ")}. Escape cancels.`);
      }
      // The Minimap carries the other Strip's letters, so Jump shows it even when it is off or collapsed.
      paintMap();
      if (on) reclampMap();
      if (!on) releaseMap();
      syncButtons();
    };
    const jumpCue = Object.assign(document.createElement("p"), { className: "jump-cue", ariaHidden: "true" });
    jumpCue.innerHTML = '<span class="cue-held">Let go of the keys</span><span class="cue-free">Type a letter · Esc cancels</span>';
    // In the Minimap header's centre, which Jump always shows, so it never covers a window title.
    $(".map-heading", minimap).insertBefore(jumpCue, $(".map-tools", minimap));

    // Overview: the Option–Tab switcher. Type to filter by title or app, move with Tab or the arrows, Return switches.
    const switcher = $(".demo-switcher", fig), search = $("input", switcher), results = $("#switcher-results", fig);
    const cardWindows = new Map(), modeButtons = $$(".switcher-modes button", switcher), screenEl = $(".demo-screen", fig);
    let selectedCard = null, opener = null, tabPass = false, savedQuery = "";
    // Only WebKit browsers move between buttons with Option–Tab, so only they need it handed back after a dismissal.
    // shortcut: user-agent check, since no API reports the setting; replace it if a browser ever exposes one.
    const optionTabMoves = /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent);
    const fuzzy = (query, text) => {
      let at = 0;
      for (const char of query) {
        at = text.indexOf(char, at) + 1;
        if (!at) return false;
      }
      return true;
    };
    const buildSwitcher = () => {
      cardWindows.clear();
      selectedCard = null;
      results.replaceChildren();
      results.style.setProperty("--map-total", minimap.style.getPropertyValue("--map-total"));
      const keys = jumpKeys(), groups = strips.map((rail, i) => [`Strip ${i + 1}`, [...rail.children]]);
      if (floating) groups.push(["Floating", [floating.win]]);
      if (minimized.length) groups.push(["Minimized", minimized.map(entry => entry.win)]);
      for (const [label, wins] of groups) {
        const group = Object.assign(document.createElement("div"), { className: "switcher-row" });
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", label);
        group.append(Object.assign(document.createElement("span"), { className: "switcher-label", textContent: label, ariaHidden: "true" }));
        for (const win of wins) {
          const card = Object.assign(document.createElement("div"), { className: "switcher-card", id: `switcher-option-${cardWindows.size}` });
          card.setAttribute("role", "option");
          card.dataset.app = win.dataset.app;
          card.style.setProperty("--map-weight", win.style.getPropertyValue("--map-weight") || .53);
          card.dataset.key = keys.get(win) ?? "";
          card.append(Object.assign(document.createElement("b"), { textContent: title(win) }),
            Object.assign(document.createElement("small"), { textContent: win.dataset.app }),
            Object.assign(document.createElement("kbd"), { className: "jump-badge", textContent: card.dataset.key, ariaHidden: "true" }));
          card.addEventListener("click", () => commitSwitcher(card));
          card.addEventListener("pointermove", () => selectCard(card));
          cardWindows.set(card, win);
          group.append(card);
        }
        results.append(group);
      }
    };
    const matches = () => [...cardWindows.keys()].filter(card => card.getAttribute("aria-disabled") !== "true");
    const selectCard = card => {
      if (!card || card.getAttribute("aria-disabled") === "true") return;
      selectedCard?.setAttribute("aria-selected", "false");
      selectedCard = card;
      card.setAttribute("aria-selected", "true");
      search.setAttribute("aria-activedescendant", card.id);
    };
    // Ranked like the app: every word must match the title or the app; a prefix beats a word start, which beats
    // initials ("tl" for Trail Log), which beat letters in order. Ties keep Strip order.
    const tier = (word, text) => text.startsWith(word) ? 0 : text.split(/\s+/).some(part => part.startsWith(word)) ? 1
      : text.split(/\s+/).map(part => part[0]).join("").includes(word) ? 1.5 : fuzzy(word, text.replace(/\s+/g, "")) ? 2 : Infinity;
    const rank = (words, win) => words.reduce((sum, word) =>
      sum + Math.min(tier(word, title(win).toLowerCase()), tier(word, win.dataset.app.toLowerCase())), 0);
    const filterSwitcher = () => {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean), query = words.join(" ");
      let best, bestScore = Infinity;
      for (const [card, win] of cardWindows) {
        const score = rank(words, win), hit = score < Infinity;
        card.setAttribute("aria-disabled", String(!hit));
        card.setAttribute("aria-selected", "false");
        card.classList.toggle("dim", !hit);
        if (score < bestScore) [best, bestScore] = [card, score];
      }
      const list = matches();
      selectedCard = null;
      selectCard(query ? best : list.find(card => cardWindows.get(card) === current) ?? list[0]);
      if (!list.length) search.removeAttribute("aria-activedescendant");
      if (query) announce(list.length ? `${list.length} ${list.length === 1 ? "window matches" : "windows match"}` : "No windows match");
    };
    // Search filters by typing; Jump shows every window's letter and a letter switches, as in the app's switcher.
    const setSwitcherMode = mode => {
      if (mode === "jump" && switcher.dataset.mode !== "jump") [savedQuery, search.value] = [search.value, ""];
      else if (mode === "search" && switcher.dataset.mode === "jump") search.value = savedQuery;
      switcher.dataset.mode = mode;
      search.setAttribute("aria-label", mode === "jump" ? "Type a window's letter" : "Search windows");
      search.readOnly = mode === "jump";
      search.placeholder = mode === "jump" ? "Type a window's letter" : "Search windows";
      for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
      if (mode === "search") return filterSwitcher();
      for (const card of cardWindows.keys()) {
        card.setAttribute("aria-disabled", "false");
        card.classList.remove("dim");
      }
      if (!selectedCard) selectCard(matches()[0]);
      announce(`Jump. Type a letter: ${[...cardWindows].map(([card, win]) => `${card.dataset.key} ${title(win)}`).join(", ")}.`);
    };
    for (const button of modeButtons) button.addEventListener("click", () => {
      setSwitcherMode(button.dataset.mode);
      search.focus({ preventScroll: true });
    });
    const moveSelection = step => {
      const list = matches();
      if (list.length) selectCard(list[(list.indexOf(selectedCard) + step + list.length) % list.length]);
    };
    const openSwitcher = manual => {
      if (board()) showBoard(null);
      setJumping(false);
      opener = fig.contains(document.activeElement) ? document.activeElement : null;
      switcherOpen = true;
      buildSwitcher();
      delete switcher.dataset.mode;
      search.value = manual ? "" : "notes";
      setSwitcherMode("search");
      switcher.hidden = false;
      hideTip();
      if (manual) {
        // Opened from the toolbar with the screen scrolled away, the panel comes into view before it takes focus.
        const box = canvas.getBoundingClientRect();
        if (box.top < 0 || box.bottom > innerHeight) canvas.scrollIntoView({ block: "nearest", behavior: reduced() ? "instant" : "smooth" });
        search.focus({ preventScroll: true });
        announce("Overview. Type to search, Tab to move, Return to switch, Escape to close. Option–J shows jump letters.");
      }
      syncButtons();
    };
    const closeSwitcher = (switched = false) => {
      if (!switcherOpen) return;
      switcherOpen = false;
      const had = switcher.contains(document.activeElement);
      switcher.hidden = true;
      if (had) {
        // Dismissed from the keyboard: focus goes back to what opened it, and the next Option–Tab on the screen
        // belongs to the browser until focus leaves the screen, so Safari's Option–Tab navigation can move on.
        tabPass = !switched && optionTabMoves;
        (opener?.isConnected && opener.getClientRects().length ? opener : canvas).focus({ preventScroll: true });
      }
      syncButtons();
    };
    const toggleSwitcher = manual => switcherOpen ? closeSwitcher() : openSwitcher(manual);
    const commitSwitcher = card => {
      const win = cardWindows.get(card ?? selectedCard);
      if (win && (card ?? selectedCard).getAttribute("aria-disabled") !== "true") run("jump", true, win);
    };
    search.addEventListener("input", filterSwitcher);
    search.addEventListener("keydown", event => {
      // The panel owns its keys: demo shortcuts stay out of the search field.
      event.stopPropagation();
      if ((event.altKey || event.metaKey) && !event.ctrlKey && (event.code === "KeyJ" || event.code === "KeyF")) {
        event.preventDefault();
        setSwitcherMode(event.code === "KeyJ" ? "jump" : "search");
        return;
      }
      if (switcher.dataset.mode === "jump" && /^[a-z]$/i.test(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        const card = [...cardWindows.keys()].find(card => card.dataset.key === event.key.toUpperCase());
        if (card) commitSwitcher(card);
        return;
      }
      const step = { Tab: event.shiftKey ? -1 : 1, ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        moveSelection(step);
      } else if (event.key === "Enter") {
        event.preventDefault();
        commitSwitcher();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (search.value && switcher.dataset.mode !== "jump") {
          search.value = "";
          filterSwitcher();
        } else closeSwitcher();
      }
    });
    switcher.addEventListener("pointerdown", event => { if (event.target === switcher) closeSwitcher(); });

    // Infinite Canvas lays both Strips out at full size and scales them as one board. Zoom is a factor, pan is in
    // canvas px; Fit shows both Strips, and zoom runs from the smaller of 50% and Fit up to 200%, as in the app.
    const view = { zoom: 1, x: 0, y: 0, fit: 1 };
    const boardTitle = $(".demo-board-title", fig);
    const boardSize = () => [Math.max(...strips.map(rail => rail.offsetWidth)), strips.length * (canvas.clientHeight + 64) - 64];
    const minZoom = () => Math.min(.5, view.fit);
    const paintBoard = () => {
      const rowH = parseFloat(canvas.style.getPropertyValue("--board-h")) || canvas.clientHeight, z = view.zoom;
      // Keep at least 80 px of a real row on screen. The box around both rows has a blank corner beside the
      // shorter Strip, so each row is clamped on its own and the nearest result wins.
      let best;
      strips.forEach((rail, i) => {
        const top = i * (rowH + 64) * z;
        const x = Math.min(Math.max(view.x, 80 - rail.offsetWidth * z), canvas.clientWidth - 80);
        const y = Math.min(Math.max(view.y, 80 - top - rowH * z), canvas.clientHeight - 80 - top);
        const distance = Math.hypot(x - view.x, y - view.y);
        if (!best || distance < best.distance) best = { x, y, distance };
      });
      [view.x, view.y] = [best.x, best.y];
      canvas.style.setProperty("--zoom", view.zoom);
      canvas.style.setProperty("--pan-x", `${view.x}px`);
      canvas.style.setProperty("--pan-y", `${view.y}px`);
      $("[data-board=out]", boardTitle).setAttribute("aria-disabled", String(view.zoom <= minZoom() + 1e-3));
      $("[data-board=in]", boardTitle).setAttribute("aria-disabled", String(view.zoom >= 2 - 1e-3));
    };
    // Zooming out is one camera move: the focused window shrinks from its place on the Strip into its place on the
    // fitted board while the other Strip comes into view. Zoom eases geometrically so its speed feels even, and the
    // window's corner travels in a straight line. Any zoom, pan or key takes over from the current frame.
    let boardMove;
    const flyIn = from => {
      const win = active(), box = canvas.getBoundingClientRect(), end = { ...view };
      const rowH = parseFloat(canvas.style.getPropertyValue("--board-h")) || canvas.clientHeight;
      const bx = win.offsetLeft, by = strips.indexOf(win.parentElement) * (rowH + 64) + win.offsetTop;
      const z0 = from.width / win.offsetWidth, l0 = from.left - box.left, t0 = from.top - box.top;
      const l1 = bx * end.zoom + end.x, t1 = by * end.zoom + end.y, start = performance.now();
      const step = now => {
        const t = reduced() ? 1 : Math.min(1, (now - start) / 480), e = t < .5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2;
        view.zoom = z0 * (end.zoom / z0) ** e;
        view.x = l0 + (l1 - l0) * e - bx * view.zoom;
        view.y = t0 + (t1 - t0) * e - by * view.zoom;
        if (t === 1) Object.assign(view, end);
        paintBoard();
        if (t < 1) boardMove = requestAnimationFrame(step);
      };
      step(start);
    };
    const fitBoard = () => {
      cancelAnimationFrame(boardMove);
      canvas.style.setProperty("--board-h", `${canvas.clientHeight}px`);
      const [width, height] = boardSize(), top = boardTitle.offsetHeight + 16;
      view.fit = view.zoom = Math.min(1, (canvas.clientWidth - 48) / width, (canvas.clientHeight - top - 24) / height);
      view.x = (canvas.clientWidth - width * view.zoom) / 2;
      view.y = top + (canvas.clientHeight - top - height * view.zoom) / 2;
      paintBoard();
    };
    const zoomBoard = (factor, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) => {
      cancelAnimationFrame(boardMove);
      const zoom = Math.min(2, Math.max(minZoom(), view.zoom * factor));
      view.x = x - (x - view.x) * zoom / view.zoom;
      view.y = y - (y - view.y) * zoom / view.zoom;
      view.zoom = zoom;
      paintBoard();
    };
    $(".board-float", boardTitle).addEventListener("click", () => { if (floating) run("jump", true, floating.win); });
    boardTitle.addEventListener("click", event => {
      const control = event.target.closest("[data-board]");
      if (!control || control.getAttribute("aria-disabled") === "true") return;
      takeOver();
      if (control.dataset.board === "fit") fitBoard();
      else zoomBoard(control.dataset.board === "in" ? 1.25 : .8);
    });
    // Tabbing to a window off the canvas pans the board to it, since the clipped canvas itself never scrolls.
    canvas.addEventListener("focusin", event => {
      // Keyboard focus only: a click focuses the window too, and panning under the pointer would move the target.
      if (!board() || !event.target.matches(".overview-pick:focus-visible")) return;
      const box = event.target.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
      if (box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom) return;
      cancelAnimationFrame(boardMove);
      view.x += frame.left + frame.width / 2 - (box.left + box.width / 2);
      view.y += frame.top + frame.height / 2 - (box.top + box.height / 2);
      paintBoard();
    });
    canvas.addEventListener("wheel", event => {
      const pinch = event.ctrlKey || event.metaKey;
      // A visitor scrolling past the tour keeps the page scroll; a pinch is deliberate and takes over.
      if (!board() || (!pinch && !stopped)) return;
      cancelAnimationFrame(boardMove);
      const box = canvas.getBoundingClientRect(), [x, y] = [view.x, view.y];
      if (pinch) {
        takeOver();
        zoomBoard(Math.exp(-event.deltaY * .01), event.clientX - box.left, event.clientY - box.top);
      } else {
        view.x -= event.deltaX;
        view.y -= event.deltaY;
        paintBoard();
      }
      // At the pan limit the page scrolls instead of stalling.
      if (pinch || x !== view.x || y !== view.y) event.preventDefault();
    }, { passive: false });
    // After a drag that moved, the click the browser may still send to the element under the pointer (WebKit can
    // ignore pointer capture for it) must not pick a window.
    let swallowClick = false;
    const swallowNextClick = () => {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; });
    };
    fig.addEventListener("click", event => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    }, true);
    let pan;
    canvas.addEventListener("pointerdown", event => {
      if (!board() || event.button || pan || event.target.closest(".demo-board-title")) return;
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    canvas.addEventListener("pointermove", event => {
      if (pan?.id !== event.pointerId) return;
      // A press released outside before the drag began never reaches these handlers; no button means it ended.
      if (!pan.moved && !(event.buttons & 1)) {
        pan = null;
        return;
      }
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      if (!pan.moved) {
        cancelAnimationFrame(boardMove);
        takeOver();
        pan.moved = true;
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add("panning");
      }
      Object.assign(pan, { x: event.clientX, y: event.clientY });
      view.x += dx;
      view.y += dy;
      paintBoard();
    });
    // Touch gives the pressed child implicit capture; moving capture to the canvas or Minimap fires a bubbling
    // lostpointercapture from that child, which must not end the gesture that just took capture.
    const lostElsewhere = (event, owner) => event.type === "lostpointercapture" && event.target !== owner;
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, event => {
      if (pan?.id !== event.pointerId || lostElsewhere(event, canvas)) return;
      if (pan.moved) swallowNextClick();
      pan = null;
      canvas.classList.remove("panning");
    });

    // Drag to move: a tiled window by its title bar on the Desktop, or its tile in the Minimap. A blue line marks the
    // insertion point; near the screen's top or bottom edge a Desktop drag goes to the Strip above or below. The Move
    // buttons remain the keyboard and single-tap way to do the same.
    const placeWindow = (win, to, index, created = false) => {
      const from = win.parentElement, source = strips.indexOf(from), into = strips[to];
      if (source < 0 || !into) return false;
      const before = [...into.children].filter(other => other !== win)[index] ?? null;
      // A drop back in its own slot leaves focus and the view where they were; a Strip it leaves empty disappears.
      if (from === into && win.nextElementSibling === before) return false;
      if (from !== into && selections[source] === win) selections[source] = win.nextElementSibling ?? win.previousElementSibling;
      into.insertBefore(win, before);
      syncWidths(from);
      if (from !== into) syncWidths(into);
      pruneStrips();
      const target = strips.indexOf(into);
      showStrip(target, win);
      announce(`${title(win)} moved to ${created ? "new " : ""}Strip ${target + 1}, position ${[...into.children].indexOf(win) + 1}`);
      return true;
    };
    const caret = Object.assign(document.createElement("i"), { className: "drop-caret", hidden: true });
    fig.append(caret);
    const slotFor = (list, x) => list.filter(element => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2 < x;
    }).length;
    const showCaret = (list, index, band) => {
      const boxes = list.map(element => element.getBoundingClientRect());
      // Between two neighbours the line sits mid-gap, so it lands inside the carried item's own slot when nothing moves.
      const x = !boxes.length ? band.left + 6 : !index ? boxes[0].left - 3 : index === boxes.length ? boxes.at(-1).right + 3 : (boxes[index - 1].right + boxes[index].left) / 2;
      Object.assign(caret.style, { left: `${Math.round(x - 1.5)}px`, top: `${Math.round(band.top)}px`, height: `${Math.round(band.height)}px` });
      caret.hidden = false;
    };
    let carry;
    canvas.addEventListener("pointerdown", event => {
      const bar = event.target.closest(".rail > .win > .tb");
      // Touch keeps the Strip's own swipe and the page scroll; touch visitors move windows with the Minimap or Move buttons.
      if (!bar || bar.parentElement.parentElement !== track() || event.button || event.pointerType === "touch" || board() || carry) return;
      carry = { id: event.pointerId, win: bar.parentElement, x: event.clientX, y: event.clientY, rail: track(), from: row, scroll: track().scrollLeft, on: false };
    });
    const moveCarry = (x, y, scroll) => {
      const rail = carry.rail, box = canvas.getBoundingClientRect(), edge = box.height * .14;
      carry.band = x < box.left + 48 ? -1 : x > box.right - 48 ? 1 : 0;
      if (scroll) rail.scrollLeft += 12 * carry.band;
      // The offset keeps the window under the pointer as the Strip scrolls beneath it.
      carry.win.style.translate = `${x - carry.x + rail.scrollLeft - carry.scroll}px ${y - carry.y}px`;
      // Title bars sit inside the top band, so an edge move also needs travel toward that edge.
      const up = y < Math.min(box.top + edge, carry.y - 24), down = y > Math.max(box.bottom - edge, carry.y + 24);
      // Past the first or last Strip an edge drop starts a new one, unless the window is its Strip's only one.
      const make = items().length > 1 && strips.length < stripLimit;
      carry.to = up && (destination(-1) || make) ? row - 1 : down && (destination(1) || make) ? row + 1 : row;
      carry.create = carry.to !== row && !strips[carry.to];
      const side = carry.to < row ? "above" : "below";
      canvas.dataset.drop = carry.to === row ? "" : side;
      canvas.dataset.dropLabel = carry.create ? `Drop to start a new Strip ${side}` : `Drop to move it to the Strip ${side}`;
      if (carry.to === row) {
        const others = items().filter(win => win !== carry.win), bar = rail.getBoundingClientRect();
        carry.index = slotFor(others, x);
        showCaret(others, carry.index, { left: bar.left, top: bar.top + 8, height: bar.height - 20 });
      } else caret.hidden = true;
    };
    // Near a side edge the Strip keeps scrolling while the pointer rests there, not only while it moves.
    const scrollCarry = () => {
      if (!carry?.on || !carry.band) {
        if (carry) carry.loop = 0;
        return;
      }
      moveCarry(carry.px, carry.py, true);
      carry.loop = requestAnimationFrame(scrollCarry);
    };
    canvas.addEventListener("pointermove", event => {
      if (carry?.id !== event.pointerId) return;
      if (!carry.on && !(event.buttons & 1)) {
        carry = null;
        return;
      }
      if (!carry.on) {
        if (Math.hypot(event.clientX - carry.x, event.clientY - carry.y) < 6) return;
        carry.on = true;
        if (jumping) setJumping(false);
        canvas.setPointerCapture(event.pointerId);
        carry.win.classList.add("carried");
        carry.rail.style.scrollSnapType = "none";
        target = null;
        hideTip();
      }
      [carry.px, carry.py] = [event.clientX, event.clientY];
      moveCarry(carry.px, carry.py, false);
      if (carry.band && !carry.loop) carry.loop = requestAnimationFrame(scrollCarry);
    });
    const liftCarry = drag => {
      cancelAnimationFrame(drag.loop);
      drag.win.classList.remove("carried");
      drag.win.style.removeProperty("translate");
      drag.rail.style.removeProperty("scroll-snap-type");
    };
    const endCarry = event => {
      if (carry?.id !== event.pointerId || lostElsewhere(event, canvas)) return;
      const drag = carry;
      carry = null;
      caret.hidden = true;
      delete canvas.dataset.drop;
      if (!drag.on) return;
      liftCarry(drag);
      swallowNextClick();
      const { win, to, index, create } = drag;
      let moved = false;
      if (event.type === "pointerup") {
        moved = create ? placeWindow(win, addStrip(to < row ? 0 : strips.length), 0, true)
          : placeWindow(win, to, to === row ? index : [...strips[to].children].indexOf(selections[to]) + 1);
      }
      // Cancelled or dropped back in place: focus stays, and only the scroll the drag caused is undone.
      if (!moved) focus(active());
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, endCarry);
    let tileDrag;
    minimap.addEventListener("pointerdown", event => {
      const tile = event.target.closest(".map-tile, .map-float-chip, .map-min-chip");
      if (!tile || event.target.closest(".tile-edge") || event.button || tileDrag) return;
      const source = tile === floatChip ? "float" : tile.matches(".map-min-chip") ? "min" : "tile";
      const win = source === "float" ? floating?.win : source === "min" ? [...minChips].find(([, chip]) => chip === tile)?.[0] : tileWindows.get(tile);
      if (win) tileDrag = { id: event.pointerId, tile, win, source, x: event.clientX, y: event.clientY, on: false };
    });
    minimap.addEventListener("pointermove", event => {
      if (tileDrag?.id !== event.pointerId) return;
      if (!tileDrag.on && !(event.buttons & 1)) {
        tileDrag = null;
        return;
      }
      const dx = event.clientX - tileDrag.x, dy = event.clientY - tileDrag.y;
      if (!tileDrag.on) {
        if (Math.hypot(dx, dy) < 5) return;
        tileDrag.on = true;
        takeOver();
        // Both rows stay out and expanded for the whole drag, even when Jump revealed them or phone Peek shows one.
        // Only a dragged tile (a box, in the app) shows the zones as drop targets.
        closeContext();
        fig.classList.add("map-held", ...tileDrag.source === "tile" ? ["box-dragging"] : []);
        closeSwitcher();
        if (jumping) setJumping(false);
        paintMap();
        paintFloats();
        paintMinimized();
        reclampMap();
        minimap.setPointerCapture(event.pointerId);
        tileDrag.tile.classList.add("carried");
        clearTimeout(mapTimer);
        hideTip();
      }
      tileDrag.tile.style.translate = `${dx}px ${dy}px`;
      tileDrag.to = tileDrag.zone = null;
      caret.hidden = true;
      minimap.classList.remove("new-strip");
      // Rows win over the header zones: a tile dropped in the Floating zone floats its window and one in the
      // Minimized zone minimizes it (never the demo's last tiled window); a chip lands only on a row, or below them.
      const inside = box => event.clientX > box.left - 4 && event.clientX < box.right + 4 && event.clientY > box.top - 4 && event.clientY < box.bottom + 4;
      const overRow = mapRows.some(mapRow => mapRow.getBoundingClientRect().height && inside(mapRow.getBoundingClientRect()));
      if (tileDrag.source === "tile" && !overRow && tiledCount() > 1) {
        tileDrag.zone = inside(floatZone.getBoundingClientRect()) ? "float" : inside(minZone.getBoundingClientRect()) ? "min" : null;
      }
      floatZone.classList.toggle("active", tileDrag.zone === "float");
      minZone.classList.toggle("active", tileDrag.zone === "min");
      if (tileDrag.zone) return;
      // Well outside the panel the drop is abandoned, as the app treats its gutter.
      const panel = minimap.getBoundingClientRect();
      if (event.clientX < panel.left - 24 || event.clientX > panel.right + 24 || event.clientY < panel.top - 24 || event.clientY > panel.bottom + 24) return;
      // Only a tile starts one, as in the app; a Strip's only window may, unless it is already the last Strip.
      // A Strip's only window leaves its Strip behind, so the count after the move is what the cap and the label use.
      const alone = tileDrag.source === "tile" && tileDrag.win.parentElement.children.length < 2, count = strips.length + 1 - alone;
      if (!overRow && event.clientY > mapRows.at(-1).getBoundingClientRect().bottom && count <= stripLimit && tileDrag.source === "tile"
        && (!alone || tileDrag.win.parentElement !== strips.at(-1))) {
        [tileDrag.to, tileDrag.index] = [strips.length, 0];
        minimap.dataset.newStrip = `New Strip ${count}`;
        minimap.classList.add("new-strip");
        return;
      }
      if (tileDrag.source !== "tile" && !overRow) return;
      let nearest = Infinity;
      mapRows.forEach((mapRow, i) => {
        const box = mapRow.getBoundingClientRect(), distance = Math.abs(event.clientY - box.top - box.height / 2);
        if (box.height && distance < nearest) [nearest, tileDrag.to] = [distance, i];
      });
      if (tileDrag.to == null) return;
      const others = $$(".map-tile", mapRows[tileDrag.to]).filter(tile => tile !== tileDrag.tile);
      tileDrag.index = slotFor(others, event.clientX);
      showCaret(others, tileDrag.index, mapRows[tileDrag.to].getBoundingClientRect());
    });
    const releaseMapHold = () => {
      fig.classList.remove("map-held", "box-dragging");
      floatZone.classList.remove("active");
      minZone.classList.remove("active");
      minimap.classList.remove("new-strip");
      paintMap();
      releaseMap();
      paintFloats();
      paintMinimized();
    };
    const settleTile = drag => {
      drag.tile.classList.remove("carried");
      drag.tile.style.removeProperty("translate");
      releaseMapHold();
    };
    const endTileDrag = event => {
      if (tileDrag?.id !== event.pointerId || lostElsewhere(event, minimap)) return;
      const drag = tileDrag;
      tileDrag = null;
      caret.hidden = true;
      if (!drag.on) return;
      settleTile(drag);
      swallowNextClick();
      if (event.type !== "pointerup") return;
      const { win, source, zone, index } = drag;
      if (zone === "float") return floatWindow(win);
      if (zone === "min") return minimizeWindow(win);
      if (drag.to == null) return;
      const created = drag.to === strips.length, to = created ? addStrip(strips.length) : drag.to;
      const before = [...strips[to].children].filter(other => other !== win)[index] ?? null;
      if (source === "float") unfloat(strips[to], before);
      else if (source === "min") restoreWindow(win, strips[to], before);
      else placeWindow(win, to, index, created);
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) minimap.addEventListener(type, endTileDrag);

    // Resize by an edge, as in the app: either side edge of a tiled window on the Desktop, or of its Minimap tile.
    // The opposite edge stays where it is while dragging; on release the view settles on the focused window, which
    // does not change. Widths are kept as a share of the screen, between about the app's 240 px floor on a laptop
    // display and full width. Mouse and pen only, so a touch swipe still scrolls; Resize and Full are the
    // keyboard and single-tap way.
    const widthRange = win => {
      const screenWidth = screenEl.clientWidth, gap = 2 * parseFloat(getComputedStyle(win).marginLeft) || 0;
      return [Math.max(120, .16 * screenWidth), screenWidth - 2 * gap];
    };
    const setCustomWidth = (win, px) => {
      const screenWidth = screenEl.clientWidth, [min, max] = widthRange(win);
      const value = Math.min(max, Math.max(min, px));
      win.removeAttribute("data-full");
      delete win.dataset.preset;
      win.dataset.cqw = (value / screenWidth * 100).toFixed(2);
      win.style.setProperty("--window-width", width(win));
      syncWidths(win.parentElement);
    };
    let sizing;
    fig.addEventListener("pointerdown", event => {
      const edge = event.target.closest(".win-edge, .tile-edge");
      if (!edge || event.button || event.pointerType === "touch" || sizing || board()) return;
      // A light under the press wins over the resize edge, whatever the browser's hit testing.
      if (document.elementsFromPoint(event.clientX, event.clientY).some(element => element.matches(".traffic button"))) return;
      const map = edge.classList.contains("tile-edge"), win = map ? tileWindows.get(edge.parentElement) : edge.parentElement;
      if (!strips.includes(win?.parentElement)) return;
      event.preventDefault();
      // Width comes from the share of the screen, so a window on the hidden Strip resizes from its tile too; a tile
      // converts pointer travel at its own scale.
      const start = cssWidth(win);
      const rail = win.parentElement;
      sizing = { id: event.pointerId, win, edge, map, on: false, side: edge.dataset.edge, x: event.clientX, start, rail,
        ratio: map ? start / edge.parentElement.offsetWidth : 1,
        spacers: ["--first-width", "--last-width"].map(name => rail.style.getPropertyValue(name)), lead: 0, trail: 0 };
      // On the Desktop a shared edge trades width with the neighbour, as the app's edge zones do, so the Strip keeps
      // its length; an outer edge, and any Minimap box edge, resizes the window alone.
      const neighbour = !map && (edge.dataset.edge === "end" ? win.nextElementSibling : win.previousElementSibling);
      if (neighbour) Object.assign(sizing, { neighbour, neighbourStart: cssWidth(neighbour) });
    });
    const beginSizing = () => {
      const { edge, map, rail, id } = sizing;
      sizing.on = true;
      // A tile resize keeps the Minimap out and expanded even when Jump revealed it.
      if (map) fig.classList.add("map-held");
      closeSwitcher();
      takeOver();
      setJumping(false);
      hideTip();
      edge.setPointerCapture(id);
      fig.classList.add("sizing");
      rail.style.scrollSnapType = "none";
      if (map) {
        paintMap();
        reclampMap();
      }
    };
    fig.addEventListener("pointermove", event => {
      if (sizing?.id !== event.pointerId) return;
      if (!sizing.on) {
        // A click near an edge stays a click: resizing starts only after 3 px of sideways travel.
        if (!(event.buttons & 1)) {
          sizing = null;
          return;
        }
        if (Math.abs(event.clientX - sizing.x) < 3) return;
        beginSizing();
      }
      const { win, side, rail, neighbour } = sizing, anchor = () => side === "start" ? win.getBoundingClientRect().right : win.getBoundingClientRect().left;
      const before = anchor();
      let delta = (event.clientX - sizing.x) * sizing.ratio * (side === "start" ? -1 : 1);
      sizing.moved ||= Math.abs(delta) >= 1;
      if (neighbour) {
        const [min, max] = widthRange(win);
        delta = Math.min(max - sizing.start, sizing.neighbourStart - min, Math.max(min - sizing.start, sizing.neighbourStart - max, delta));
        setCustomWidth(neighbour, sizing.neighbourStart - delta);
      }
      setCustomWidth(win, sizing.start + delta);
      // The centring spacers follow the first and last widths; held until release, they cannot push the fixed edge,
      // and they widen when the Strip cannot scroll far enough at either end to keep that edge still.
      const spacers = () => {
        rail.style.setProperty("--first-width", `calc(${sizing.spacers[0]} - ${2 * sizing.lead}px)`);
        rail.style.setProperty("--last-width", `calc(${sizing.spacers[1]} - ${2 * sizing.trail}px)`);
      };
      spacers();
      if (rail !== track()) return;
      rail.scrollLeft += anchor() - before;
      const left = anchor() - before;
      if (left < -.5) sizing.lead -= left;
      else if (left > .5) sizing.trail += left;
      else return;
      spacers();
      if (left > .5) rail.scrollLeft += left;
    });
    const finishSizing = drag => {
      fig.classList.remove("sizing");
      syncWidths(drag.rail);
      drag.rail.style.removeProperty("scroll-snap-type");
      if (fig.classList.contains("map-held")) releaseMapHold();
      if (drag.rail === track()) focus(active(), true);
    };
    const endSizing = event => {
      if (sizing?.id !== event.pointerId || lostElsewhere(event, sizing.edge)) return;
      const drag = sizing;
      sizing = null;
      if (!drag.on) return;
      finishSizing(drag);
      swallowNextClick();
      if (drag.moved) announce(`${title(drag.win)} resized to ${Math.round(drag.win.dataset.cqw)}% of the screen width`);
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) fig.addEventListener(type, endSizing);
    // A command, the board or the recording during a drag ends it where it started; the release then does nothing,
    // not even the click it would end with.
    let cancelledPointer = null;
    fig.addEventListener("pointerup", event => {
      if (event.pointerId !== cancelledPointer) return;
      cancelledPointer = null;
      swallowNextClick();
    }, true);
    const cancelDrags = () => {
      cancelledPointer = [carry, tileDrag, sizing].find(drag => drag?.on)?.id ?? null;
      if (carry?.on) liftCarry(carry);
      if (tileDrag?.on) settleTile(tileDrag);
      if (sizing?.on) finishSizing(sizing);
      carry = tileDrag = sizing = null;
      caret.hidden = true;
      delete canvas.dataset.drop;
      minimap.classList.remove("new-strip");
    };

    // Right-click menu, as on the app's Minimap boxes and switcher cards: Float or Tile, Minimize or Restore, Move
    // Strip Up or Down, Close Window and Quit the app. Items the demo cannot honour (Snooze, Send to Display,
    // overrides) are left out rather than shown dead.
    const contextMenu = Object.assign(document.createElement("div"), { className: "demo-context", hidden: true });
    contextMenu.setAttribute("role", "menu");
    fig.append(contextMenu);
    const contextActions = new Map();
    let contextFor = null;
    const windowOf = element => element === floatChip ? floating?.win
      : element.matches(".map-min-chip") ? [...minChips].find(([, chip]) => chip === element)?.[0]
      : element.matches(".switcher-card") ? cardWindows.get(element) : tileWindows.get(element);
    function paintDesktops() {
      desktopPills.forEach((pill, i) => {
        const here = i === desk, d = desktops[i];
        const count = here ? windows.length - minimized.length : d.windows.length - d.minimized.length;
        pill.querySelector("b").textContent = i + 1;
        pill.querySelector("sup").textContent = count;
        pill.querySelector(".map-desktop-name").textContent = d.name;
        if (here) pill.setAttribute("aria-current", "true");
        else pill.removeAttribute("aria-current");
        pill.setAttribute("aria-label", `${nameOf(i)}, Desktop ${i + 1}, ${count} window${count === 1 ? "" : "s"}`);
        pill.dataset.tip = `${here ? `${nameOf(i)} is on the screen.` : `Switch to ${nameOf(i)}.`} Double-click to rename it, or right-click for more.`;
      });
      if (!desktops.length) return;
      $("[data-desktop-number]", statusMenu).textContent = desk + 1;
      menuSummary.setAttribute("aria-label", `PaperMac menu, ${nameOf(desk)}, Desktop ${desk + 1}`);
      $(".switcher-desktop", fig).textContent = nameOf(desk);
      $("[data-desktop-name]", fig).textContent = nameOf(desk);
    }
    function closeContext(restore = contextMenu.contains(document.activeElement)) {
      if (contextMenu.hidden) return;
      contextMenu.hidden = true;
      minimap.classList.remove("menu-open");
      releaseMap();
      // Overview cards are options of the search field, which keeps focus.
      const back = contextFor?.matches(".switcher-card") ? search : contextFor;
      if (restore && back?.isConnected) back.focus({ preventScroll: true });
      if (restore) rescueFocus(true);
      contextFor = null;
    }
    // Swaps a whole Strip with its neighbour; the Strip on screen stays on screen.
    const moveStrip = (from, delta) => {
      const to = from + delta;
      for (const list of [strips, mapRows]) {
        if (delta < 0) list[to].before(list[from]);
        else list[to].after(list[from]);
        [list[from], list[to]] = [list[to], list[from]];
      }
      [selections[from], selections[to]] = [selections[to], selections[from]];
      if (row === from) row = to;
      else if (row === to) row = from;
      labelStrips();
      syncMap();
      paintJump();
      syncButtons();
      if (!mapVisible) revealMap();
      announce(`Strip ${from + 1} is now Strip ${to + 1}.`);
    };
    const quitApp = app => {
      const closing = windows.filter(other => other.dataset.app === app);
      for (const win of closing) closeWindow(win);
      paintJump();
      syncButtons();
      announce(`Quit ${app}; ${closing.length} window${closing.length === 1 ? "" : "s"} closed.`);
    };
    const openContext = (element, x, y) => {
      if (element.matches(".map-desktop")) {
        const i = Number(element.dataset.desktop);
        return showMenu(element, x, y, desktopItems(i), `${nameOf(i)} desktop`);
      }
      const win = windowOf(element);
      if (!win) return;
      const isFloat = floating?.win === win, entry = minimized.find(item => item.win === win), isMin = Boolean(entry);
      const lane = strips.indexOf(win.parentElement), app = win.dataset.app;
      const keep = "The demo keeps one window on its Strips.";
      const lastTiled = !isFloat && !isMin && tiledCount() < 2 && keep;
      const appCount = windows.filter(other => other.dataset.app === app).length;
      const items = [
        [isFloat || entry?.floated ? "Tile Window" : "Float Window", isMin ? "Restore it first." : lastTiled, () => isFloat ? unfloat() : floatWindow(win)],
        isMin ? ["Restore", "", () => restoreWindow(win)] : ["Minimize", lastTiled, () => minimizeWindow(win)],
        ...lane < 0 || strips.length < 2 ? [] : ["-", `Strip ${lane + 1}`,
          ["Move Strip Up", !lane && "It is already the first Strip.", () => moveStrip(lane, -1), false, `Move Strip ${lane + 1} up`],
          ["Move Strip Down", lane === strips.length - 1 && "It is already the last Strip.", () => moveStrip(lane, 1), false, `Move Strip ${lane + 1} down`]],
        "-",
        ["Close Window", lastTiled, () => closeWindow(win)],
        [`Quit ${app}${appCount > 1 ? ` (${appCount} windows)` : ""}`, strips.every(rail => [...rail.children].every(other => other.dataset.app === app)) && keep, () => quitApp(app), true],
      ];
      showMenu(element, x, y, items, `${title(win)} window`);
    };
    const showMenu = (element, x, y, items, label) => {
      takeOver();
      hideTip();
      contextMenu.replaceChildren();
      contextActions.clear();
      for (const item of items) {
        if (item === "-") {
          contextMenu.append(Object.assign(document.createElement("div"), { role: "separator" }));
          continue;
        }
        if (typeof item === "string") {
          contextMenu.append(Object.assign(document.createElement("div"), { className: "menu-heading", textContent: item, ariaHidden: "true" }));
          continue;
        }
        const [label, reason, action, destructive, spoken] = item;
        const button = Object.assign(document.createElement("button"), { type: "button", textContent: label, tabIndex: -1 });
        button.setAttribute("role", "menuitem");
        if (reason) Object.assign(button.dataset, { tip: reason });
        button.setAttribute("aria-disabled", String(Boolean(reason)));
        if (destructive) button.dataset.destructive = "";
        if (spoken) button.setAttribute("aria-label", spoken);
        contextActions.set(button, action);
        contextMenu.append(button);
      }
      contextMenu.setAttribute("aria-label", label);
      contextFor = element;
      minimap.classList.toggle("menu-open", minimap.contains(element));
      contextMenu.hidden = false;
      const box = contextMenu.getBoundingClientRect();
      contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
      contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
      ($("[role=menuitem]:not([aria-disabled=true])", contextMenu) ?? $("[role=menuitem]", contextMenu)).focus({ preventScroll: true });
    };
    let pointerMenu = false;
    search.addEventListener("pointerdown", event => { pointerMenu = event.button === 2 || event.ctrlKey; });
    fig.addEventListener("contextmenu", event => {
      // From the keyboard, the search field's menu is the selected card's; a right-click there keeps the browser's.
      const element = event.target === search ? !pointerMenu && selectedCard
        : event.target.closest(".map-tile, .map-float-chip, .map-min-chip, .switcher-card, .map-desktop");
      pointerMenu = false;
      if (!element || element.getAttribute("aria-disabled") === "true" || footage || board()) return;
      event.preventDefault();
      // A keyboard or VoiceOver menu has no pointer inside the item; open it under the item instead.
      const box = element.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      openContext(element, inside ? event.clientX : box.left, inside ? event.clientY : box.bottom + 4);
    });
    fig.addEventListener("keydown", event => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      const element = event.target === search ? selectedCard : event.target.closest?.(".map-tile, .map-float-chip, .map-min-chip, .map-desktop");
      if (!element || element.getAttribute("aria-disabled") === "true" || footage || board()) return;
      event.preventDefault();
      event.stopPropagation();
      const box = element.getBoundingClientRect();
      openContext(element, box.left, box.bottom + 4);
    }, true);
    contextMenu.addEventListener("keydown", event => {
      // The menu owns its keys: demo shortcuts stay out of it.
      event.stopPropagation();
      const items = $$("[role=menuitem]", contextMenu), at = items.indexOf(document.activeElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (step) {
        event.preventDefault();
        items[(at + step + items.length) % items.length].focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        items.at(event.key === "Home" ? 0 : -1).focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        closeContext(true);
      }
    });
    contextMenu.addEventListener("mousedown", event => event.preventDefault());
    contextMenu.addEventListener("click", event => {
      const item = event.target.closest("[role=menuitem]");
      if (!item || item.getAttribute("aria-disabled") === "true") return;
      const action = contextActions.get(item), from = contextFor;
      closeContext(false);
      if (switcherOpen) closeSwitcher();
      takeOver();
      setJumping(false);
      action();
      // The item keeps focus when it survives the action (Move Strip); otherwise the demo screen takes it.
      if (from.isConnected && from.getClientRects().length) from.focus({ preventScroll: true });
      else rescueFocus(true);
    });
    document.addEventListener("pointerdown", event => { if (!contextMenu.contains(event.target)) closeContext(); }, true);
    addEventListener("scroll", event => {
      if (event.target === document || event.target.contains?.(contextFor)) closeContext();
    }, { capture: true, passive: true });
    addEventListener("blur", () => closeContext());

    // The Minimap moves by its background, like the app's panel, and stays on the screen below the menu bar.
    const mapOffset = { x: 0, y: 0 };
    let mapDrag;
    const moveMap = (x, y) => {
      // Inside the glass, not the bezel around it.
      const outer = screenEl.getBoundingClientRect(), bar = $(".demo-menu", fig).getBoundingClientRect();
      const screen = { left: outer.left + screenEl.clientLeft, top: outer.top + screenEl.clientTop };
      Object.assign(screen, { right: screen.left + screenEl.clientWidth, bottom: screen.top + screenEl.clientHeight });
      const box = minimap.getBoundingClientRect(), left = box.left - mapOffset.x, top = box.top - mapOffset.y;
      mapOffset.x = Math.round(Math.min(Math.max(x, screen.left + 4 - left), screen.right - 4 - box.width - left));
      mapOffset.y = Math.round(Math.min(Math.max(y, bar.bottom + 4 - top), screen.bottom - 4 - box.height - top));
      minimap.style.setProperty("--map-x", `${mapOffset.x}px`);
      minimap.style.setProperty("--map-y", `${mapOffset.y}px`);
    };
    // Expanding a collapsed Minimap moved up near the menu bar would push it off the top; pull it back in.
    const reclampMap = () => {
      if (!minimap.hidden && getComputedStyle(minimap).position === "absolute") moveMap(mapOffset.x, mapOffset.y);
    };
    minimap.addEventListener("pointerdown", event => {
      if (event.button || mapDrag || event.target.closest("button, input, .map-track, .map-float, .map-desktops") || getComputedStyle(minimap).position !== "absolute") return;
      mapDrag = { id: event.pointerId, x: event.clientX - mapOffset.x, y: event.clientY - mapOffset.y };
      takeOver();
      minimap.setPointerCapture(event.pointerId);
      minimap.classList.add("dragging");
    });
    minimap.addEventListener("pointermove", event => {
      if (mapDrag?.id === event.pointerId) moveMap(event.clientX - mapDrag.x, event.clientY - mapDrag.y);
    });
    minimap.addEventListener("lostpointercapture", event => {
      if (mapDrag?.id !== event.pointerId || event.target !== minimap) return;
      mapDrag = null;
      minimap.classList.remove("dragging");
      releaseMap();
    });

    // Hover previews (Pro): a scaled copy of the window, and for the Desktop pill a to-scale map of both Strips.
    const previewOf = win => {
      const reference = win.offsetWidth ? win : track().firstElementChild;
      const height = reference.offsetHeight;
      const width = cssWidth(win);
      const scale = Math.min(296 / width, 170 / height);
      const frame = Object.assign(document.createElement("div"), { className: "tip-shot", ariaHidden: "true" });
      frame.style.cssText = `width:${Math.round(width * scale)}px;height:${Math.round(height * scale)}px`;
      const shot = win.cloneNode(true);
      for (const node of shot.querySelectorAll("[id], .overview-pick, .jump-badge")) node.matches("[id]") ? node.removeAttribute("id") : node.remove();
      for (const attr of ["aria-current", "tabindex", "role", "aria-label"]) shot.removeAttribute(attr);
      shot.inert = true;
      shot.style.cssText = `width:${width}px;height:${height}px;transform:scale(${scale})`;
      frame.append(shot);
      return [frame, Object.assign(document.createElement("span"), { className: "tip-pro", textContent: "Pro · Window preview" })];
    };
    const desktopOf = () => {
      const card = Object.assign(document.createElement("div"), { className: "tip-desktop", ariaHidden: "true" });
      card.style.setProperty("--map-total", minimap.style.getPropertyValue("--map-total"));
      for (const rail of strips) {
        const lane = Object.assign(document.createElement("div"), { className: "tip-lane" });
        for (const win of rail.children) {
          const box = Object.assign(document.createElement("i"), { textContent: title(win), className: win === current ? "current" : "" });
          box.style.setProperty("--map-weight", win.style.getPropertyValue("--map-weight"));
          lane.append(box);
        }
        card.append(lane);
      }
      return [card];
    };

    // One tooltip for the whole demo: hover after a pause, keyboard focus at once, a tap for two seconds.
    const tip = Object.assign(document.createElement("div"), { className: "demo-tip", id: "demo-tip", hidden: true });
    tip.setAttribute("role", "tooltip");
    tip.innerHTML = '<span></span><kbd aria-hidden="true"></kbd><div class="tip-extra"></div>';
    fig.append(tip);
    let tipFor = null, tipNext = null, tipTimer, tipHide, lastPointer = "mouse";
    const tipTarget = element => $("input", element) ?? element;
    const helpFor = element => {
      const found = element?.closest?.("[data-tip-for], [data-setting], [data-tip], .rail > .win > .tb, .rail > .win");
      return found && fig.contains(found) ? found : null;
    };
    const help = element => {
      const id = element.dataset.tipFor;
      if (element.dataset.setting) {
        const text = settingHelp[`${element.dataset.setting}:${element.dataset.value}`];
        return { text: element.disabled ? `${text} Turn the Minimap on first.` : text, keys: "" };
      }
      if (element.matches(".win")) return { text: board() || !stopped || element.hasAttribute("aria-current") ? "" : `Focus ${title(element)}.`, keys: "" };
      if (element.matches(".rail > .win > .tb")) return { text: board() || !stopped || !matchMedia("(any-pointer: fine)").matches ? "" : `Drag the title bar to move ${title(element.parentElement)} along the Strip, or to the top or bottom edge for the other Strip.`, keys: "" };
      if (element.matches(".map-tile") && previews) return { text: element.dataset.tip, keys: "", preview: tileWindows.get(element) };
      if (element === menuSummary) return { text: element.dataset.tip, keys: "", desktop: true };
      if (!id) return { text: element.dataset.tip, keys: element.dataset.tipKeys ?? "" };
      if (id === "pause" && stopped) return { text: "Continue the tour from its next step.", keys: "" };
      const reason = blocked()[id];
      return { text: reason ? `${commands[id][2]} ${reason}` : commands[id][2], keys: shortcuts(id).map(shortcutText).join(" or ") };
    };
    const hideTip = () => {
      clearTimeout(tipTimer);
      clearTimeout(tipHide);
      const fromMap = minimap.contains(tipFor);
      if (tipFor) tipTarget(tipFor).removeAttribute("aria-describedby");
      tipFor = tipNext = tipHide = null;
      tip.hidden = true;
      if (fromMap) setTimeout(releaseMap);
    };
    const showTip = (element, brief) => {
      const { text, keys, preview, desktop } = help(element);
      hideTip();
      if (!text || !element.getClientRects().length) return;
      tipFor = element;
      $("span", tip).textContent = text;
      $("kbd", tip).textContent = keys;
      $(".tip-extra", tip).replaceChildren(...(preview ? previewOf(preview) : desktop ? desktopOf() : []));
      tip.hidden = false;
      tipTarget(element).setAttribute("aria-describedby", tip.id);
      const anchor = (element.matches(".rail > .win") ? grip(element) : element).getBoundingClientRect(), box = tip.getBoundingClientRect();
      // Help for things on the simulated screen stays on the screen rather than over the enclosure.
      const screen = element.closest(".demo-screen")?.getBoundingClientRect();
      const below = anchor.top - 8 - box.height < Math.max(0, screen?.top ?? 0);
      const inside = screen && screen.width > box.width + 16;
      const low = Math.max(8, inside ? screen.left + 8 : 8), high = Math.min(innerWidth, inside ? screen.right : innerWidth) - box.width - 8;
      const left = Math.min(Math.max(low, anchor.left + (anchor.width - box.width) / 2), high);
      tip.style.translate = `${Math.round(left)}px ${Math.round(below ? anchor.bottom + 8 : anchor.top - 8 - box.height)}px`;
      if (brief) tipHide = setTimeout(hideTip, 2400);
    };
    fig.addEventListener("pointerdown", event => {
      lastPointer = event.pointerType;
      if (event.pointerType !== "touch") hideTip();
    }, true);
    // The tooltip lets clicks through to the controls under it, yet stays while the pointer rests on it or crosses the gap.
    const overTip = (x, y) => {
      if (tip.hidden) return false;
      const box = tip.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top - 8 && y <= box.bottom + 8;
    };
    const keyboardFocused = element => element.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
    document.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      // Same help target, or resting on the tooltip: keep it. A part with its own help (a window's title bar or resize
      // edge) takes over even though the window contains it.
      if (tipFor && (helpFor(event.target) === tipFor || overTip(event.clientX, event.clientY))) {
        clearTimeout(tipHide);
        clearTimeout(tipTimer);
        tipHide = null;
        tipNext = tipFor;
        return;
      }
      if (tipFor && !tipHide && !keyboardFocused(tipFor)) tipHide = setTimeout(hideTip, 150);
      const element = helpFor(event.target);
      if (element === tipNext) return;
      clearTimeout(tipTimer);
      tipNext = element;
      if (element) tipTimer = setTimeout(() => showTip(element), tipFor ? 0 : 450);
    });
    document.documentElement.addEventListener("pointerleave", () => {
      clearTimeout(tipTimer);
      tipNext = null;
      if (tipFor && !keyboardFocused(tipFor)) hideTip();
    });
    fig.addEventListener("focusin", event => {
      const element = helpFor(event.target);
      if (element && event.target.matches(":focus-visible")) showTip(element);
    });
    fig.addEventListener("focusout", event => {
      if (tipFor?.contains(event.target) && !tipFor.contains(event.relatedTarget)) hideTip();
    });
    fig.addEventListener("click", event => {
      const element = helpFor(event.target);
      if (!element) return;
      if (lastPointer === "touch" && event.detail) showTip(element, true);
      else if (!event.detail) requestAnimationFrame(() => { if (element.contains(document.activeElement)) showTip(element); });
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") hideTip(); });
    addEventListener("scroll", event => {
      if (event.target === document || event.target.contains?.(tipFor) || event.target.contains?.(tipNext)) hideTip();
    }, { capture: true, passive: true });
    addEventListener("resize", hideTip);

    minimap.addEventListener("click", event => {
      const tool = event.target.closest("[data-map-tool]");
      if (!tool) return;
      takeOver();
      if (tool.dataset.mapTool === "pin") setSetting("map", settings.map === "pinned" ? "peek" : "pinned");
      else if (tool.dataset.mapTool === "collapse") {
        const collapsed = minimap.classList.toggle("collapsed");
        tool.setAttribute("aria-expanded", String(!collapsed));
        tool.setAttribute("aria-label", collapsed ? "Expand the Minimap" : "Collapse the Minimap");
        if (getComputedStyle(minimap).position === "absolute") moveMap(mapOffset.x, mapOffset.y);
        syncMap();
      } else {
        canvas.focus({ preventScroll: true });
        clearTimeout(mapTimer);
        mapVisible = false;
        paintMap();
        announce("Minimap hidden until focus moves");
      }
    });
    for (const type of ["pointerleave", "focusout"]) minimap.addEventListener(type, () => setTimeout(releaseMap));
    for (const type of ["pointerenter", "focusin"]) minimap.addEventListener(type, () => clearTimeout(mapTimer));
    let scrub;
    mapTrack.addEventListener("pointerdown", event => {
      if (scrub || event.button || board()) return;
      nativeInput();
      const rail = track(), scale = mapScale(), thumb = $("i", mapTrack).getBoundingClientRect();
      rail.style.scrollSnapType = "none";
      if (event.clientX < thumb.left || event.clientX > thumb.right) {
        const x = event.clientX - mapRows[row].getBoundingClientRect().left - $(".map-tile", mapRows[row]).offsetLeft;
        rail.scrollLeft = rail.firstElementChild.offsetLeft + x / scale - rail.clientWidth / 2;
      }
      scrub = { id: event.pointerId, x: event.clientX, left: rail.scrollLeft, scale, rail };
      mapTrack.setPointerCapture(event.pointerId);
    });
    mapTrack.addEventListener("pointermove", event => {
      if (scrub?.id === event.pointerId) scrub.rail.scrollLeft = scrub.left + (event.clientX - scrub.x) / scrub.scale;
    });
    mapTrack.addEventListener("lostpointercapture", event => {
      if (scrub?.id !== event.pointerId || event.target !== mapTrack) return;
      scrub.rail.style.removeProperty("scroll-snap-type");
      scrub = null;
    });

    let drag;
    canvas.addEventListener("pointerdown", event => {
      if (drag || !floating || event.button || event.target !== grip(floating.win)) return;
      drag = { id: event.pointerId, x: event.clientX - floating.x, y: event.clientY - floating.y };
      event.target.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (drag?.id === event.pointerId) moveFloat(event.clientX - drag.x, event.clientY - drag.y);
    });
    canvas.addEventListener("lostpointercapture", event => { if (drag?.id === event.pointerId) drag = null; });
    canvas.addEventListener("click", event => {
      if (!floating || event.detail || event.target !== grip(floating.win)) return;
      run("float", true);
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener("keydown", event => {
      if (!floating || event.target !== grip(floating.win) || event.metaKey || event.altKey || event.ctrlKey) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        run("float", true);
        canvas.focus({ preventScroll: true });
        return;
      }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const distance = event.shiftKey ? 64 : 16;
      moveFloat(floating.x + step[0] * distance, floating.y + step[1] * distance);
    });
    statusMenu.addEventListener("toggle", () => {
      if (statusMenu.open) {
        takeOver();
        closeSwitcher();
      }
      else if (statusMenu.contains(tipFor)) hideTip();
    });
    document.addEventListener("click", event => {
      if (statusMenu.open && !statusMenu.contains(event.target)) statusMenu.open = false;
    });
    document.addEventListener("focusin", event => {
      if (statusMenu.open && !statusMenu.contains(event.target)) statusMenu.open = false;
    });
    const bindPicker = win => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "overview-pick";
      button.hidden = true;
      button.append(Object.assign(document.createElement("kbd"), { className: "jump-badge", ariaHidden: "true" }));
      win.append(Object.assign(document.createElement("kbd"), { className: "jump-badge win-badge", ariaHidden: "true" }));
      button.setAttribute("aria-label", `Focus ${title(win)}`);
      button.dataset.tip = `Focus ${title(win)} and return to its Strip.`;
      button.addEventListener("click", () => run("jump", true, win));
      win.append(button);
      const lights = Object.assign(document.createElement("span"), { className: "traffic" });
      for (const [kind, label, tip, keys] of [
        ["close", `Close ${title(win)}`, `Close ${title(win)}.`, "⇧W"],
        ["minimize", `Minimize ${title(win)}`, `Minimize ${title(win)} to the Minimap.`, "⇧M"],
        ["full", `Full width for ${title(win)}`, "Fill the Strip's width, or restore it. In the app, green opens macOS full screen.", "⌥⌘F"],
      ]) {
        const light = Object.assign(document.createElement("button"), { type: "button", className: `tl tl-${kind}`, tabIndex: -1 });
        light.setAttribute("aria-label", label);
        Object.assign(light.dataset, { light: kind, tip, tipBase: tip, tipKeys: keys, keysBase: keys });
        lights.append(light);
      }
      // On touch, the first tap on an unfocused floating window's lights focuses it, as for tiles. Read on
      // pointerdown, because iOS moves focus before the tap ends.
      let firstTap = false;
      lights.addEventListener("pointerdown", event => {
        firstTap = event.pointerType === "touch" && floating?.win === win && !floatFocused();
      });
      lights.addEventListener("click", event => {
        const light = event.target.closest("[data-light]");
        if (!light) return;
        event.stopPropagation();
        // The next window slides in under the pointer, so the second click of a double-click must not close it too.
        if (event.detail > 1 && lightActed) return;
        lightActed = !firstTap;
        if (firstTap) {
          firstTap = false;
          grip(win).focus({ preventScroll: true });
          return;
        }
        lightAction(light.dataset.light, win);
      });
      win.prepend(lights);
      for (const side of ["start", "end"]) {
        const edge = Object.assign(document.createElement("i"), { className: "win-edge", ariaHidden: "true" });
        Object.assign(edge.dataset, { edge: side, tip: `Drag to resize ${title(win)}.` });
        win.append(edge);
      }
    };
    windows.forEach(bindPicker);
    fig.addEventListener("click", event => {
      if (!event.detail || event.target.closest("a, [data-command=pause], .demo-status-menu, .demo-view, .demo-footage")) return;
      if (!fig.contains(document.activeElement)) canvas.focus({ preventScroll: true });
      const win = event.target.closest(".rail > .win");
      if (win && !board() && !event.target.closest("button")) run("focus", true, win);
    });
    fig.addEventListener("focusin", event => {
      if (!stopped && !footage && event.target.matches(":focus-visible") && !event.target.closest(".demo-view")) run("pause", true);
    });
    fig.addEventListener("keyup", () => clearTimeout(chordTimer));
    fig.addEventListener("keydown", event => {
      if (event.code === "Escape" && expanded && (footage || (!jumping && !switcherOpen && !board() && !statusMenu.open))) {
        event.preventDefault();
        setExpanded(false);
        return;
      }
      if (event.target.closest(".demo-footage") || (event.target.type === "radio" && event.key.startsWith("Arrow"))) return;
      if (footage && !event.target.closest(".demo-controls, .demo-caption")) return;
      if (event.target.closest("a")) return;
      if (event.code === "Escape" && statusMenu.open) {
        event.preventDefault();
        statusMenu.open = false;
        menuSummary.focus({ preventScroll: true });
        return;
      }
      // Holding ⌥⇧⌘ for a moment shows the jump letters; they stay after release until a letter or Escape.
      if (["Meta", "Alt", "Shift"].includes(event.key) && event.metaKey && event.altKey && event.shiftKey && !event.ctrlKey) {
        if (!jumping && !board() && !switcherOpen && !footage) {
          clearTimeout(chordTimer);
          chordTimer = setTimeout(() => { takeOver(); setJumping(true); }, 300);
        }
        return;
      }
      clearTimeout(chordTimer);
      if (event.code === "Escape" && (jumping || switcherOpen || board())) {
        event.preventDefault();
        takeOver();
        if (jumping) setJumping(false);
        else if (switcherOpen) closeSwitcher();
        else run("infinite", true);
        return;
      }
      if ((jumping || board()) && !event.metaKey && !event.altKey && !event.ctrlKey) {
        // The printed letter, not the key position, so AZERTY and Dvorak visitors type what the badge shows.
        const key = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : "";
        const win = key && [...jumpKeys()].find(([, letter]) => letter === key)?.[0];
        if (win) {
          event.preventDefault();
          run("jump", true, win);
          return;
        }
        // Any other typed character does nothing in Jump (a Cyrillic Ц is on the W key), rather than reaching ⇧W.
        if (jumping && event.key.length === 1) {
          event.preventDefault();
          return;
        }
      }
      if (board() && !event.metaKey && !event.altKey && !event.ctrlKey) {
        const zoom = { Equal: 1.25, NumpadAdd: 1.25, Minus: .8, NumpadSubtract: .8 }[event.code];
        if (zoom || event.code === "Digit0" || event.code === "Numpad0") {
          event.preventDefault();
          takeOver();
          if (zoom) zoomBoard(zoom);
          else fitBoard();
          return;
        }
      }
      const shiftOnly = event.shiftKey && !event.metaKey && !event.altKey && !event.ctrlKey;
      const letter = shiftOnly && /^[a-z]$/i.test(event.key) && `Key${event.key.toUpperCase()}`;
      // Shift with punctuation (AZERTY's ? on the M key) is no shortcut; a letter in another script keeps the key's position.
      if (shiftOnly && event.code.startsWith("Key") && !letter && !/^\p{L}$/u.test(event.key)) return;
      const shortcut = [
        event.metaKey && "Meta", event.altKey && "Alt", event.ctrlKey && "Control", event.shiftKey && "Shift", letter || event.code,
      ].filter(Boolean).join("+");
      const id = keymap.get(shortcut);
      if (!id || (id === "pause" && stopped)) return;
      if (event.repeat && ["close", "minimize", "newWindow"].includes(id)) {
        event.preventDefault();
        return;
      }
      // Safari moves between buttons with Option–Tab by default, so it opens Overview only from the demo screen
      // (windows, Minimap, menu bar), where the app's own Option–Tab lives; elsewhere, and after a keyboard
      // dismissal until focus leaves the screen, it belongs to the browser. Inside the open panel the search field
      // takes it and cycles the selection.
      if (shortcut === "Alt+Tab" && (footage || switcherOpen || tabPass || !screenEl.contains(event.target))) return;
      event.preventDefault();
      run(id, true);
    });
    // Expanded view: the screen alone, as large as the browser window allows; everything else on the page goes inert
    // so focus stays on the demo, and Escape or the button returns.
    const expandButton = $("[data-expand]", fig);
    let inertNodes = [];
    const setExpanded = on => {
      if (on === expanded) return;
      closeContext();
      expanded = on;
      fig.classList.toggle("expanded", on);
      document.documentElement.classList.toggle("demo-expanded", on);
      expandButton.dataset.tip = on ? "Return to the page. Escape works too." : "Show the demo as large as the browser window allows. Escape returns to the page.";
      hideTip();
      if (on) {
        takeOver();
        for (let node = fig; node.parentElement && node !== document.body; node = node.parentElement) {
          for (const sibling of node.parentElement.children) if (sibling !== node && !sibling.inert) inertNodes.push(sibling);
        }
        for (const node of [$(".demo-view", fig), $(".demo-controls", fig), pauseButton, $(".demo-caption a", fig)]) if (node && !node.inert) inertNodes.push(node);
        for (const node of inertNodes) node.inert = true;
        (switcherOpen ? search : footage ? footageVideo : canvas).focus({ preventScroll: true });
      } else {
        for (const node of inertNodes) node.inert = false;
        inertNodes = [];
        expandButton.focus({ preventScroll: true });
      }
      // The screen changed size: settle the Strip or refit the board at the new scale.
      requestAnimationFrame(() => board() ? fitBoard() : focus(active()));
      announce(on ? "Expanded view. Escape returns to the page." : "Back on the page.");
    };
    expandButton.addEventListener("click", () => setExpanded(!expanded));
    document.addEventListener("keydown", event => {
      if (event.code !== "Escape" || !expanded || fig.contains(event.target)) return;
      // Focus fell out of the demo: the same order as on the screen, an open layer first, then the view.
      if (!contextMenu.hidden) closeContext(true);
      else if (statusMenu.open) {
        statusMenu.open = false;
        menuSummary.focus({ preventScroll: true });
      } else if (!footage && (jumping || switcherOpen || board())) {
        takeOver();
        if (jumping) setJumping(false);
        else if (switcherOpen) closeSwitcher();
        else run("infinite", true);
        canvas.focus({ preventScroll: true });
      } else setExpanded(false);
    });
    expandButton.hidden = false;
    buttons.get("newWindow").hidden = false;
    const nativeInput = () => { takeOver(); setJumping(false); target = null; syncButtons(); };
    // The float chip turns solid orange while the floating window has focus.
    fig.addEventListener("focusin", paintFloats);
    fig.addEventListener("focusout", event => {
      setTimeout(paintFloats);
      if (!fig.contains(event.relatedTarget)) setJumping(false);
      if (!screenEl.contains(event.relatedTarget)) tabPass = false;
    });
    screenEl.addEventListener("pointerdown", () => { tabPass = false; });
    // Letters hide while ⌘, ⌥ or ⌃ is down, so no badge invites a chord macOS acts on before the page can.
    const trackChord = event => fig.classList.toggle("chord-held", event.metaKey || event.altKey || event.ctrlKey);
    addEventListener("keydown", trackChord, true);
    addEventListener("keyup", trackChord, true);
    addEventListener("blur", () => {
      fig.classList.remove("chord-held");
      clearTimeout(chordTimer);
      setJumping(false);
    });
    // A touch on the open canvas may be the start of a page scroll, so it takes over only once it pans the board.
    canvas.addEventListener("pointerdown", event => { if (!(board() && event.pointerType === "touch")) nativeInput(); });
    canvas.addEventListener("wheel", ({ deltaX, deltaY, shiftKey }) => {
      // On the board the wheel belongs to the board's own handler, which leaves the tour alone while it runs.
      if (!board() && (deltaX || (shiftKey && deltaY))) nativeInput();
    }, { passive: true });
    strips.forEach(watchScroll);

    const tour = ["right", "newWindow", "resize", "below", "above", "moveLeft", "limelight", "outline",
      "full", "full", "jumpTo", "overview", "overview", "infinite", "infinite", "outline", "limelight", "left"];
    const schedule = () => {
      clearInterval(timer);
      clearCue();
      pauseButton.hidden = reduced();
      fig.classList.toggle("touring", visible && !stopped && !footage && !reduced());
      if (visible && !stopped && !footage && !reduced()) {
        timer = setInterval(() => {
          const id = tour[beat];
          beat = (beat + 1) % tour.length;
          const button = buttons.get(id);
          if (button.getAttribute("aria-disabled") === "true" || (id === "newWindow" && windows.length > initialWindowCount)) return;
          clearCue();
          run(id, false);
          lastCue = button;
          lastCue.setAttribute("data-tour-active", "");
          tourCue.textContent = commands[id][2];
          tourCue.hidden = false;
        }, 2200);
      }
    };
    // A short viewport can never show 35% of the taller 16:10 screen, so filling the viewport also counts.
    new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.intersectionRatio >= .35 || entry.intersectionRect.height >= .9 * (entry.rootBounds?.height ?? innerHeight);
      if (visible !== was) schedule();
    }, { threshold: Array.from({ length: 101 }, (_, i) => i / 100) }).observe(canvas);
    motion.addEventListener("change", () => {
      if (reduced()) {
        finishSlide?.();
        footageVideo.pause();
      }
      schedule();
    });
    new ResizeObserver(() => {
      syncMap();
      if (floating?.win.getClientRects().length) moveFloat(floating.x, floating.y);
      if (board()) fitBoard();
      if (getComputedStyle(minimap).position === "absolute" && minimap.getClientRects().length) moveMap(mapOffset.x, mapOffset.y);
    }).observe(canvas);
    labelStrips();
    const clock = $("[data-clock]", fig);
    const tick = () => {
      clock.textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
        .format(new Date()).replaceAll(",", "");
    };
    tick();
    setInterval(tick, 30000);
    strips[0].tabIndex = -1;
    canvas.tabIndex = 0;
    strips.forEach(syncWidths);
    fig.dataset.mapMode = settings.map;
    const nameOf = i => desktops[i].name || `Desktop ${i + 1}`;
    const walls = ["work", "personal", "dusk", "forest", "violet"];
    const makeDesktop = (name, wall, pages) => {
      const rail = newRail(), mapRow = newMapRow();
      rail.hidden = true;
      for (const page of pages) {
        const win = page.cloneNode(true);
        win.style.setProperty("--window-width", width(win));
        rail.append(win);
        bindPicker(win);
      }
      return { name, wall, strips: [rail], mapRows: [mapRow], selections: [rail.firstElementChild], row: 0, minimized: [], windows: [...rail.children], floating: null };
    };
    // The Desktop on screen keeps its state in the shared arrays; a switch stores it and swaps the next one in.
    const switchDesktop = index => {
      if (index === desk || !desktops[index]) return;
      closeContext();
      cancelDrags();
      setJumping(false);
      closeSwitcher();
      if (board()) showBoard(null);
      takeOver();
      finishSlide?.();
      target = null;
      const had = holdsFocus(), from = desktops[desk], to = desktops[index];
      if (floating) floating.win.remove();
      Object.assign(from, { strips: [...strips], mapRows: [...mapRows], selections: [...selections], row, minimized: [...minimized], windows: [...windows], floating });
      from.strips[0].before(...to.strips);
      for (const rail of from.strips) rail.remove();
      from.mapRows[0].before(...to.mapRows);
      for (const mapRow of from.mapRows) mapRow.remove();
      desk = index;
      strips.splice(0, Infinity, ...to.strips);
      mapRows.splice(0, Infinity, ...to.mapRows);
      selections.splice(0, Infinity, ...to.selections);
      minimized.splice(0, Infinity, ...to.minimized);
      windows.splice(0, Infinity, ...to.windows);
      row = to.row;
      floating = to.floating;
      if (floating) canvas.append(floating.win);
      screenEl.dataset.wall = to.wall;
      // On screen before measuring: a hidden Strip has no width.
      strips.forEach((strip, i) => { strip.hidden = i !== row; });
      strips.forEach(syncWidths);
      labelStrips();
      showStrip(row);
      paintMinimized();
      paintFloats();
      paintJump();
      syncButtons();
      rescueFocus(had);
      announce(`${nameOf(index)}, Desktop ${index + 1}.`);
    };
    // A new Desktop gets the next wallpaper and one window to start, so there is something to tile.
    const addDesktop = () => {
      desktops.push(makeDesktop("", walls[desktops.length % walls.length], [nextPage()]));
      buildPills();
      switchDesktop(desktops.length - 1);
      announce(`Desktop ${desktops.length} added, with one window. Double-click its pill to name it.`);
    };
    // Its windows join the Desktop on screen, or its neighbour when it is the one on screen, as macOS moves them.
    const removeDesktop = i => {
      if (desktops.length < 2) return;
      const name = nameOf(i);
      if (i === desk) switchDesktop(i ? i - 1 : 1);
      const moving = desktops[i].windows;
      if (desktops[i].floating) ground(desktops[i].floating.win);
      for (const win of moving) {
        track().append(win);
        windows.push(win);
      }
      desktops.splice(i, 1);
      if (i < desk) desk--;
      syncWidths(track());
      buildPills();
      paintJump();
      syncButtons();
      announce(`${name} removed. Its ${moving.length} window${moving.length === 1 ? "" : "s"} moved to ${nameOf(desk)}.`);
    };
    const renameDesktop = i => {
      const pill = desktopPills[i];
      if (!pill?.isConnected) return;
      const input = Object.assign(document.createElement("input"), {
        type: "text", className: "map-desktop-input", value: desktops[i].name, placeholder: `Desktop ${i + 1}`, maxLength: 24, spellcheck: false, autocomplete: "off",
      });
      input.setAttribute("aria-label", `Name for Desktop ${i + 1}`);
      pill.replaceWith(input);
      input.focus({ preventScroll: true });
      input.select();
      let done = false;
      // Enter or leaving the field keeps the name, Escape keeps the old one; an empty name clears it.
      const finish = keep => {
        if (done) return;
        done = true;
        if (keep) desktops[i].name = input.value.trim();
        input.replaceWith(pill);
        paintDesktops();
        pill.focus({ preventScroll: true });
        if (keep) announce(`Desktop ${i + 1} is ${desktops[i].name ? `now ${desktops[i].name}` : "unnamed"}.`);
      };
      // The field owns its keys: demo shortcuts stay out of it.
      input.addEventListener("keydown", event => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
        }
      });
      input.addEventListener("blur", () => finish(true));
    };
    const desktopItems = i => [
      ...i === desk ? [] : [["Switch to Desktop", "", () => switchDesktop(i)]],
      ["Rename…", "", () => renameDesktop(i)],
      ...desktops[i].name ? [["Clear Custom Name", "", () => {
        desktops[i].name = "";
        paintDesktops();
        announce(`Desktop ${i + 1} is unnamed.`);
      }]] : [],
      ...desktops.length > 1 ? ["-", ["Remove Desktop", "", () => removeDesktop(i), true, `Remove ${nameOf(i)}; its windows move to another Desktop`]] : [],
    ];
    const addPill = Object.assign(document.createElement("button"), { type: "button", className: "map-desktop-add" });
    addPill.setAttribute("aria-label", "New Desktop");
    addPill.dataset.tip = "Add a Desktop with its own wallpaper and a window to start.";
    addPill.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>';
    addPill.addEventListener("click", addDesktop);
    const buildPills = () => {
      const focused = [...desktopPills, addPill].indexOf(document.activeElement);
      desktopPills = desktops.map((_, i) => {
        const pill = Object.assign(document.createElement("button"), { type: "button", className: "map-desktop" });
        pill.dataset.desktop = i;
        pill.append(document.createElement("b"), document.createElement("sup"), Object.assign(document.createElement("span"), { className: "map-desktop-name" }));
        pill.addEventListener("click", () => switchDesktop(i));
        pill.addEventListener("dblclick", () => renameDesktop(i));
        return pill;
      });
      desktopsEl.replaceChildren(...desktopPills, addPill);
      paintDesktops();
      if (focused >= 0) [...desktopPills, addPill][Math.min(focused, desktopPills.length)].focus({ preventScroll: true });
    };
    showStrip(0);
    desktops.push({ name: "Work", wall: "work", strips: [...strips], mapRows: [...mapRows], selections: [...selections], row, minimized: [], windows: [...windows], floating: null });
    const examples = [...$("#demo-new-window", fig).content.children];
    desktops.push(makeDesktop("Personal", "personal", ["Weather", "Meal Plan", "Photos"].map(name => examples.find(page => title(page) === name))));
    screenEl.dataset.wall = "work";
    buildPills();
    pauseButton.hidden = reduced();
    statusMenu.hidden = false;
    $(".demo-controls", fig).hidden = false;
    if (phone.matches) showView(true);
    else applyView();
    phone.addEventListener("change", () => showView(phone.matches));
    $("#strip-caption", fig).textContent = matchMedia("(pointer: coarse)").matches
      ? "Swipe the Strip or tap a control."
      : "Click a window or use the controls. Shortcuts work while focus is inside the demo.";
  }
  StripDemo($("[data-strip-demo]"));

  const posters = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      target.poster = target.dataset.poster;
      posters.unobserve(target);
    }
  });
  $$("video[data-poster]").forEach((video) => posters.observe(video));

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
