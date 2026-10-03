// Round 6: realistic desktop chrome for a strip. Needs logos.js. See desks6.css for the sources of the Omarchy values.
(() => {
  const D = (window.D6 = {});
  const I = {
    wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.6a9 9 0 0 1 12.4 0M9.2 16.1a4.2 4.2 0 0 1 5.6 0"/><circle cx="12" cy="19.4" r="1.2" fill="currentColor" stroke="none"/></svg>',
    battery: '<svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="6.5" width="22" height="11" rx="3"/><rect x="4" y="9" width="14" height="6" rx="1.4" fill="currentColor" stroke="none"/><path d="M25.5 10v4" stroke-linecap="round"/></svg>',
    cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="6" rx="3"/><circle cx="17.6" cy="7.5" r="1.6" fill="currentColor"/><rect x="3" y="13.5" width="18" height="6" rx="3"/><circle cx="6.4" cy="16.5" r="1.6" fill="currentColor"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    bt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/></svg>',
  };
  D.ICONS = I;
  // macOS: transparent menu bar, glass dock
  D.mac = (strip, app = "Paper") => `<div class="d6 mac"><div class="cb"><div class="wp"></div></div>${strip}
    <div class="cf"><div class="bar6"><span class="apple">${LOGOS.apple}</span><span class="app-name">${app}</span><span class="menus"><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span></span><span class="sp"></span>
      <span class="st">${I.battery}${I.wifi}${I.search}${I.cc}<span>Fri Oct 2&nbsp;&nbsp;9:41 AM</span></span></div>
    <div class="dock"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
  // Omarchy: the omarchy-shell bar, workspaces left, clock centre, status right
  D.om = (strip, active = 1) => `<div class="d6 om"><div class="cb"><div class="wp"></div></div>${strip}
    <div class="cf"><div class="bar6"><span class="om-logo">${LOGOS.omarchy}</span><span class="ws">${[1, 2, 3, 4, 5].map((n) => (n === active ? "<b></b>" : `<span>${n}</span>`)).join("")}</span>
      <span class="clock">Friday 09:41</span><span class="st">${I.bt}${I.wifi}${I.vol}${I.power}</span></div></div></div>`;
  // keycaps; the page sets --press (0..1) on each kbd to animate a press.
  // macOS uses PaperMac's Command+Option style with the Arrows layout (both built in; ⌘⌥ is its recommended base):
  // ⌘⌥←/→ focus, ⌘⌥Return full width. Omarchy defaults: Super+←/→ focus, Super+Alt+F full width.
  const CHORDS = {
    mac: { left: ["⌘", "⌥", "←"], right: ["⌘", "⌥", "→"], full: ["⌘", "⌥", "↩"], hold: ["⌘", "⌥"] },
    om: { left: ["Super", "←"], right: ["Super", "→"], full: ["Super", "Alt", "F"] },
  };
  D.kc = (keys) => `<span class="keys6">${keys.map((k) => `<kbd class="${k.length > 1 ? "wide" : /[⌘⌥⌃⇧]/.test(k) ? "mod" : ""}">${k}</kbd>`).join("")}</span>`;
  D.keys = (os, dir = "left") => D.kc(CHORDS[os][dir]).replace('class="keys6"', `class="keys6" data-os="${os}"`);
  D.press = (el, p) => { for (const k of el.querySelectorAll("kbd")) k.style.setProperty("--press", p); };
})();
// A still desktop picture at a virtual 1440x900, scaled to its container by the page (D6.fit).
// wins: [[kind, widthFraction], ...]; the window at index f is focused and centred.
(() => {
  const D = window.D6;
  D.still = (os, wins = [["mu", .34], ["ph", .5], ["ch", .5]], f = 1) => {
    const W = 1440, gap = os === "om" ? 10 : 18, top = os === "om" ? 40 : 72, bot = os === "om" ? 10 : 126; // Omarchy: 30px bar, gaps_in 5 (10 between), gaps_out 10
    const ws = wins.map(([k, w]) => ({ k, w: Math.round(W * w) }));
    let x = 0; for (const w of ws) { w.x = x; x += w.w + gap; }
    const off = W / 2 - (ws[f].x + ws[f].w / 2);
    const strip = `<div class="strip">${ws.map((w, i) => Paper.app(w.k, "s" + i, i + 1).replace('class="app', `style="left:${w.x + off}px;top:${top}px;width:${w.w}px;height:${900 - top - bot}px" class="app${i === f ? " f6" : ""}`)).join("")}</div>`;
    return `<div class="still6"><div class="in6">${os === "mac" ? D.mac(strip, "Photos") : D.om(strip, 2)}</div></div>`;
  };
  D.fit = (root = document) => {
    const fit = () => { for (const s of root.querySelectorAll(".still6")) s.firstElementChild.style.transform = `scale(${s.clientWidth / 1440})`; };
    fit(); addEventListener("resize", fit);
  };
})();
