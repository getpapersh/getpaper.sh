(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
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
    const windows = $$(".win", fig), initialWindowCount = windows.length, windowLimit = 9;
    const canvas = $(".demo-canvas", fig), status = $("[role=status]", fig);
    const tourCue = $(".demo-tour", fig), app = $("[data-demo-app]", fig);
    const minimap = $(".demo-minimap", fig), mapRows = $$(".map-row", minimap);
    const statusMenu = $(".demo-status-menu", fig), menuSummary = $("summary", statusMenu);
    const desktopCount = $("[data-desktop-count]", statusMenu);
    const menuButtons = new Map();
    const mapTiles = new Map();
    const buttons = new Map($$("[data-command]", fig).map(button => [button.dataset.command, button]));
    const pauseButton = buttons.get("pause");
    const settings = { map: "peek", focus: "centered", place: "after" };
    const selections = strips.map(strip => strip.firstElementChild);
    const presets = ["var(--standard-width)", "72cqw", "89cqw", "max(155px, 36cqw)"];
    let row = 0, current, target, timer, announcement, frame, lastCue, finishSlide, floating, mapTimer;
    let visible = false, stopped = false, beat = 0;
    let mapOn = true, mapVisible = false;

    const track = () => strips[row];
    const active = () => target ?? selections[row];
    const board = () => fig.classList.contains("overview") || fig.classList.contains("infinite");
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
    const width = win => full(win) ? "calc(100cqw - 2 * var(--gap))" :
      Number(win.dataset.preset) ? presets[Number(win.dataset.preset)] :
      win.hasAttribute("data-new") ? "max(180px, 50cqw)" : presets[0];
    const syncMap = () => {
      if (minimap.hidden) return;
      $("[data-map-app]", minimap).textContent = current.dataset.app;
      for (const [win, tile] of mapTiles) {
        if (win === current) tile.setAttribute("aria-current", "true");
        else tile.removeAttribute("aria-current");
      }
      mapRows.forEach((mapRow, i) => { mapRow.toggleAttribute("data-active", i === row); });
      if (board()) return;
      const rail = track(), start = rail.firstElementChild.offsetLeft;
      const end = rail.lastElementChild.offsetLeft + rail.lastElementChild.offsetWidth;
      const span = end - start;
      const left = Math.max(start, rail.scrollLeft);
      const right = Math.min(end, rail.scrollLeft + rail.clientWidth);
      const mapRow = mapRows[row], lastTile = mapRow.lastElementChild;
      const scale = (lastTile.offsetLeft + lastTile.offsetWidth) / span;
      mapRow.style.setProperty("--view-left", `${scale * (left - start)}px`);
      mapRow.style.setProperty("--view-width", `${scale * (right - left)}px`);
    };
    const paintMap = () => {
      minimap.hidden = !mapVisible || board();
      fig.classList.toggle("has-map", !minimap.hidden);
      syncMap();
    };
    const revealMap = (requested = false) => {
      clearTimeout(mapTimer);
      mapVisible = mapOn && (settings.map !== "manual" || requested);
      paintMap();
      if (mapVisible && settings.map === "peek") {
        mapTimer = setTimeout(() => { mapVisible = false; paintMap(); }, 2000);
      }
    };
    const syncWidths = strip => {
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
          tile.textContent = title(win);
          tile.title = `Focus ${title(win)} in the Strip (Enter or Space)`;
          tile.addEventListener("click", () => run("jump", true, win));
          mapTiles.set(win, tile);
        }
        const defaultWeight = win.hasAttribute("data-new") ? .5 : .53;
        const weight = full(win) ? 1 : [defaultWeight, .72, .89, .36][Number(win.dataset.preset ?? 0)];
        tile.style.setProperty("--map-weight", weight);
        win.style.setProperty("--map-weight", weight);
        if (mapRow.children[i + 1] !== tile) mapRow.insertBefore(tile, mapRow.children[i + 1] ?? null);
      });
    };
    const syncButtons = () => {
      for (const [id, unavailable] of [
        ["left", !neighbor(-1)], ["right", !neighbor(1)], ["above", !destination(-1)], ["below", !destination(1)],
        ["moveLeft", !neighbor(-1) || board()], ["moveRight", !neighbor(1) || board()],
        ["moveAbove", !destination(-1) || items().length === 1 || board()],
        ["moveBelow", !destination(1) || items().length === 1 || board()],
        ["full", board()], ["resize", board()], ["newWindow", board() || windows.length >= windowLimit],
        ["float", board() || (!floating && items().length < 2)],
      ]) buttons.get(id).setAttribute("aria-disabled", String(unavailable));
      buttons.get("full").setAttribute("aria-pressed", String(full(active())));
      buttons.get("float").setAttribute("aria-checked", String(Boolean(floating)));
      buttons.get("limelight").setAttribute("aria-checked", String(fig.classList.contains("limelight")));
      buttons.get("outline").setAttribute("aria-checked", String(fig.classList.contains("outline")));
      buttons.get("minimap").setAttribute("aria-checked", String(mapOn));
      buttons.get("overview").setAttribute("aria-pressed", String(fig.classList.contains("overview")));
      buttons.get("infinite").setAttribute("aria-pressed", String(fig.classList.contains("infinite")));
      for (const { button, setting, value } of settingButtons) {
        button.setAttribute("aria-pressed", String(settings[setting] === value));
        button.disabled = setting === "map" && !mapOn;
      }
      desktopCount.textContent = windows.length;
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
      finishSlide?.();
      const delta = index - row, previous = track();
      row = index;
      $("[data-strip-label]", fig).textContent = `Strip ${row + 1}`;
      strips.forEach((strip, i) => { strip.hidden = !board() && i !== row; });
      focus(win);
      if (!delta || reduced() || board()) return;

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
    const send = delta => {
      const win = active(), from = track(), to = destination(delta);
      selections[row] = neighbor(1) ?? neighbor(-1);
      selections[row + delta].after(win);
      syncWidths(from);
      syncWidths(to);
      showStrip(row + delta, win);
      announce(`${title(win)} moved to Strip ${row + 1}`);
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
      pauseButton.title = paused ? "Continue from the next tour step." : `${commands.pause[2]} (Esc)`;
      if (!paused && !visible) canvas.scrollIntoView({ block: "center", behavior: "instant" });
      schedule();
    };
    const takeOver = () => { if (!stopped) setTourPaused(true); };
    const showBoard = mode => {
      fig.classList.toggle("overview", mode === "overview");
      fig.classList.toggle("infinite", mode === "infinite");
      $(".demo-board-title", fig).hidden = mode !== "infinite";
      $$(".rail .overview-pick", fig).forEach((button, i) => {
        button.hidden = !board();
        const key = mode === "overview" ? "asdfghjkl"[i] : "";
        $("kbd", button).textContent = key.toUpperCase();
        if (key) button.setAttribute("aria-keyshortcuts", key.toUpperCase());
        else button.removeAttribute("aria-keyshortcuts");
      });
      showStrip(row, active());
      paintMap();
    };
    const toggleBoard = mode => {
      showBoard(fig.classList.contains(mode) ? null : mode);
      announce(board() ? "Choose a window to return to its Strip." : `Strip ${row + 1}, ${title(active())}`);
    };
    const addWindow = () => {
      const positions = new Map(items().map(win => [win, win.offsetLeft]));
      const win = $("#demo-new-window", fig).content.firstElementChild.cloneNode(true);
      $(".tb", win).textContent = `New Note ${windows.length - initialWindowCount + 1}`;
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
      announce(`${title(win)} opened. ${windows.length} of ${windowLimit} windows.`);
    };
    const toggleFloat = () => {
      if (floating) {
        const { win, strip, next } = floating;
        floating = null;
        strip.insertBefore(win, next?.parentElement === strip ? next : null);
        syncWidths(strip);
        showStrip(strips.indexOf(strip), win);
        announce(`${title(win)} returned to the Strip.`);
      } else {
        const win = active(), strip = track(), next = win.nextElementSibling;
        const remaining = next ?? win.previousElementSibling;
        floating = { win, strip, next };
        canvas.append(win);
        mapTiles.get(win).remove();
        syncWidths(strip);
        focus(remaining);
        announce(`${title(win)} floated above the Strip.`);
      }
    };
    const commands = {
      left: ["Meta+Alt+ArrowLeft", () => focus(neighbor(-1), true), "Focus the window to the left."],
      right: ["Meta+Alt+ArrowRight", () => focus(neighbor(1), true), "Focus the window to the right."],
      above: ["Meta+Alt+ArrowUp", () => showStrip(row - 1), "Focus the Strip above."],
      below: ["Meta+Alt+ArrowDown", () => showStrip(row + 1), "Focus the Strip below."],
      moveLeft: ["Meta+Alt+Shift+ArrowLeft", () => move(-1), "Move the focused window one place left."],
      moveRight: ["Meta+Alt+Shift+ArrowRight", () => move(1), "Move the focused window one place right."],
      moveAbove: ["Meta+Alt+Shift+ArrowUp", () => send(-1), "Move the focused window to the Strip above."],
      moveBelow: ["Meta+Alt+Shift+ArrowDown", () => send(1), "Move the focused window to the Strip below."],
      full: ["Meta+Alt+KeyF", () => {
        const win = active();
        setWidth(win, win.toggleAttribute("data-full") ? "full width" : "restored width");
      }, "Expand the focused window to full width or restore it."],
      resize: ["Meta+Alt+Shift+Enter", () => {
        const win = active();
        win.removeAttribute("data-full");
        win.dataset.preset = (Number(win.dataset.preset ?? 0) + 1) % presets.length;
        setWidth(win, "next width preset");
      }, "Resize the focused window to the next width preset."],
      float: ["Meta+Alt+KeyT", toggleFloat, "Float the focused window above the Strip or return it."],
      limelight: ["Meta+Alt+Control+KeyL", () => {
        const on = fig.classList.toggle("limelight");
        syncButtons();
        announce(`Limelight ${on ? "on" : "off"}`);
      }, "Dim the other windows when Limelight is on."],
      outline: ["Meta+Alt+Control+KeyB", () => {
        const on = fig.classList.toggle("outline");
        syncButtons();
        announce(`Outline ${on ? "on" : "off"}`);
      }, "Draw a border around the focused window when Outline is on."],
      minimap: ["Meta+Alt+KeyM", () => {
        mapOn = !mapOn || (settings.map === "manual" && !mapVisible);
        revealMap(true);
        syncButtons();
        announce(`Minimap ${mapOn ? "on" : "off"}`);
      }, "Show or hide a map of the windows and viewport."],
      overview: ["Meta+Alt+KeyO", () => toggleBoard("overview"), "See both Strips and pick a window to focus."],
      infinite: ["Shift+KeyI", () => toggleBoard("infinite"), "See the Desktop’s canvas with windows scaled by width."],
      newWindow: ["Shift+KeyN", addWindow, "Open a note and make room on the Strip."],
      pause: ["Escape", () => { if (!board()) focus(nearest()); }, "Stop the tour and take control of the demo."],
      focus: ["", win => focus(win, true)],
      jump: ["", win => {
        canvas.focus({ preventScroll: true });
        if (board()) showBoard(null);
        showStrip(strips.indexOf(win.parentElement), win);
      }],
    };
    const run = (id, manual, arg) => {
      const enabled = buttons.get(id)?.getAttribute("aria-disabled") !== "true";
      if (manual) takeOver();
      if (enabled) commands[id][1](arg);
    };

    const shortcutText = shortcut => shortcut
      .replace(/^Meta\+Alt\+(Control\+|Shift\+)?/, (_, modifier) =>
        modifier === "Control+" ? "⌃⌥⌘" : modifier === "Shift+" ? "⌥⇧⌘" : "⌥⌘")
      .replace("ArrowLeft", "←").replace("ArrowRight", "→").replace("ArrowUp", "↑").replace("ArrowDown", "↓")
      .replace("Shift+", "⇧").replace("Enter", "↵").replace("Key", "").replace("Escape", "Esc");
    const keymap = new Map([["ArrowLeft", "left"], ["ArrowRight", "right"]]);
    for (const [id, button] of buttons) {
      const [shortcut, , description] = commands[id];
      const kbd = document.createElement("kbd");
      kbd.textContent = shortcutText(shortcut);
      kbd.setAttribute("aria-hidden", "true");
      button.append(kbd);
      button.title = `${description} (${kbd.textContent})`;
      button.setAttribute("aria-controls", "demo-canvas");
      const accessibleKey = shortcut.replace("Key", "");
      button.setAttribute("aria-keyshortcuts", id === "left" || id === "right" ?
        `${accessibleKey} ${accessibleKey.split("+").at(-1)}` : accessibleKey);
      keymap.set(shortcut, id);
      button.addEventListener("click", () => {
        if (id === "pause" && stopped) setTourPaused(false);
        else run(id, true);
      });
    }
    for (const group of $$("[data-menu-commands]", statusMenu)) {
      for (const id of group.dataset.menuCommands.split(" ")) {
        const proxy = buttons.get(id).cloneNode(true);
        proxy.removeAttribute("data-command");
        proxy.removeAttribute("class");
        $("i", proxy)?.remove();
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
    const settingButtons = $$("[data-setting]", fig).map(button => {
      const { setting, value } = button.dataset;
      button.addEventListener("click", () => {
        takeOver();
        settings[setting] = value;
        if (setting === "map") {
          fig.dataset.mapMode = value;
          revealMap();
        } else if (setting === "focus") {
          fig.dataset.focusMode = value;
          focus(active());
        }
        syncButtons();
      });
      return { button, setting, value };
    });
    statusMenu.addEventListener("toggle", () => { if (statusMenu.open) takeOver(); });
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
      button.append(document.createElement("kbd"));
      $("kbd", button).setAttribute("aria-hidden", "true");
      button.setAttribute("aria-label", `Focus ${title(win)}`);
      button.title = `Focus ${title(win)} in the Strip (Enter or Space)`;
      button.addEventListener("click", () => run("jump", true, win));
      win.append(button);
    };
    windows.forEach(bindPicker);
    fig.addEventListener("click", event => {
      if (!event.detail || event.target.closest("a, [data-command=pause], .demo-status-menu")) return;
      if (!fig.contains(document.activeElement)) canvas.focus({ preventScroll: true });
      const win = event.target.closest(".rail > .win");
      if (win && !board() && !event.target.closest("button")) run("focus", true, win);
    });
    fig.addEventListener("focusin", event => {
      if (!stopped && event.target.matches(":focus-visible")) run("pause", true);
    });
    fig.addEventListener("keydown", event => {
      if (event.target.closest("a")) return;
      if (event.code === "Escape" && statusMenu.open) {
        event.preventDefault();
        statusMenu.open = false;
        menuSummary.focus({ preventScroll: true });
        return;
      }
      if (event.code === "Escape" && board()) {
        event.preventDefault();
        run(fig.classList.contains("overview") ? "overview" : "infinite", true);
        return;
      }
      if (fig.classList.contains("overview") && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
        const key = /^Key[A-Z]$/.test(event.code) ? event.code.at(-1) : "";
        const pick = key && $(`.overview-pick[aria-keyshortcuts="${key}"]`, fig);
        if (pick) {
          event.preventDefault();
          pick.click();
          return;
        }
      }
      const shortcut = [
        event.metaKey && "Meta", event.altKey && "Alt", event.ctrlKey && "Control", event.shiftKey && "Shift", event.code,
      ].filter(Boolean).join("+");
      const id = keymap.get(shortcut);
      if (!id || (id === "pause" && stopped)) return;
      event.preventDefault();
      run(id, true);
    });
    const nativeInput = () => { takeOver(); target = null; syncButtons(); };
    canvas.addEventListener("pointerdown", nativeInput);
    canvas.addEventListener("wheel", ({ deltaX, deltaY, shiftKey }) => {
      if (deltaX || (shiftKey && deltaY)) nativeInput();
    }, { passive: true });
    for (const strip of strips) {
      strip.addEventListener("scroll", () => {
        if (strip === track() && frame == null) frame = requestAnimationFrame(syncScroll);
      }, { passive: true });
    }

    const tour = ["right", "newWindow", "resize", "below", "above", "moveLeft", "limelight", "outline",
      "full", "full", "overview", "infinite", "infinite", "outline", "limelight", "left"];
    const schedule = () => {
      clearInterval(timer);
      clearCue();
      pauseButton.hidden = reduced();
      if (visible && !stopped && !reduced()) {
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
    new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= .35;
      schedule();
    }, { threshold: .35 }).observe(canvas);
    motion.addEventListener("change", () => {
      if (reduced()) finishSlide?.();
      schedule();
    });
    new ResizeObserver(syncMap).observe(canvas);
    strips[0].tabIndex = -1;
    canvas.tabIndex = 0;
    strips.forEach(syncWidths);
    fig.dataset.mapMode = settings.map;
    showStrip(0);
    pauseButton.hidden = reduced();
    statusMenu.hidden = false;
    $(".demo-controls", fig).hidden = false;
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
