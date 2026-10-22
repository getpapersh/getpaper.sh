// Scrub the query before other page work; the key stays in memory and is rendered as text.
(() => {
  let raw = null;
  try { raw = new URLSearchParams(location.search).get("key"); } catch {}
  if (location.search) history.replaceState(null, "", location.pathname);
  const key = raw?.trim() || "";
  let pin = null; try { pin = localStorage.getItem("pm-theme"); } catch {}
  document.documentElement.dataset.mode = pin || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    const ta = Object.assign(document.createElement("textarea"), { value: t, readOnly: true });
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove(); return ok;
  }
  addEventListener("DOMContentLoaded", () => {
    const view = document.getElementById("activate"), live = document.getElementById("live");
    if (!key) { view.classList.add("bad"); document.getElementById("act-title").focus(); return; }
    document.getElementById("act-key").textContent = key;
    const btn = document.getElementById("act-copy"), lbl = btn.querySelector(".lbl");
    let timer;
    btn.addEventListener("click", async () => {
      const ok = await copyText(key);
      clearTimeout(timer);
      btn.classList.toggle("done", ok);
      lbl.textContent = ok ? "Copied" : "Select and copy";
      live.textContent = ok ? "Key copied. Open PaperMac › Settings › License and paste." : "Copy failed: select the key and copy it.";
      timer = setTimeout(() => { btn.classList.remove("done"); lbl.textContent = "Copy key"; }, 2400);
    });
    document.getElementById("act-title").focus();
  });
})();
