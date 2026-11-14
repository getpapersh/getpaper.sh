// Usage: bun src/_tools/og.ts HTTP_URL OUT.png [Y]
// Serve site/ locally so root-absolute /brand/ assets resolve as they do in production.
const [page, out, y = "45"] = process.argv.slice(2);
if (!page?.startsWith("http://") && !page?.startsWith("https://")) throw new Error("Pass the locally served page URL, not a file path.");
const port = 9335 + Math.floor(Math.random() * 400);
const prof = `${out}.profile`;
const chrome = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stderr: "ignore", stdout: "ignore" });
let ws: WebSocket;
try {
  let tg: any[] = [];
  for (let i = 0; i < 100; i++) { try { tg = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tg.some((t) => t.type === "page")) break; } catch {} await Bun.sleep(100); }
  ws = new WebSocket(tg.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data as string); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }).then((m) => m.result);
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: page }); await Bun.sleep(1200);
  // the skip link is for keyboard users of the page, not part of the picture
  await send("Runtime.evaluate", { expression: `document.querySelector(".skip")?.style.setProperty("visibility", "hidden")` });
  const images = await send("Runtime.evaluate", { expression: `document.fonts.ready.then(() => [...document.images].every(img => img.complete && img.naturalWidth > 0))`, awaitPromise: true, returnByValue: true });
  if (!images.result.value) throw new Error("An image did not load; refusing to capture broken brand marks.");
  await Bun.sleep(300);
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: Number(y), width: 1440, height: 756, scale: 1200 / 1440 } });
  await Bun.write(out, Buffer.from(r.data, "base64"));
} finally {
  ws?.close(); chrome.kill(); await chrome.exited;
  (await import("node:fs")).rmSync(prof, { recursive: true, force: true });
}
