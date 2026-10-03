// usage: bun og.ts PAGE OUT.png  -- the link preview: the hero at 1440x900, the band from y=45 to y=801 scaled to 1200x630
const [page, out] = process.argv.slice(2);
const port = 9335 + Math.floor(Math.random() * 400);
const prof = `${out}.profile`;
const chrome = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stderr: "ignore", stdout: "ignore" });
let tg: any[] = [];
for (let i = 0; i < 100; i++) { try { tg = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tg.some((t) => t.type === "page")) break; } catch {} await Bun.sleep(100); }
const ws = new WebSocket(tg.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data as string); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }).then((m) => m.result);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Page.navigate", { url: "file://" + page }); await Bun.sleep(1200);
// the skip link is for keyboard users of the page, not part of the picture
await send("Runtime.evaluate", { expression: `document.querySelector(".skip").style.display = "none"` });
await Bun.sleep(300);
const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 45, width: 1440, height: 756, scale: 1200 / 1440 } });
await Bun.write(out, Buffer.from(r.data, "base64"));
ws.close(); chrome.kill(); await Bun.sleep(300); (await import("node:fs")).rmSync(prof, { recursive: true, force: true });
