// Apply the saved colour mode before first paint to avoid a theme flash.
(() => { let p = null; try { p = localStorage.getItem("pm-theme"); } catch {} document.documentElement.dataset.mode = p || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); })();
// Launch prices show until the launch sale ends; the markup defaults to the regular prices.
if (Date.now() < Date.parse("2026-12-02T07:59:00Z")) document.documentElement.classList.add("launch");
