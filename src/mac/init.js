// Apply the saved colour mode before first paint to avoid a theme flash.
(() => { let p = null; try { p = localStorage.getItem("pm-theme"); } catch {} document.documentElement.dataset.mode = p || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); })();
