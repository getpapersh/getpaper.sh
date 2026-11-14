(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
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


})();
