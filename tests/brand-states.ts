// Check the rendered cascade, including the theme selector and hover label overlays.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

const site = resolve(process.argv[2]);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const file = resolve(site, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
  return file.startsWith(site + sep) ? new Response(Bun.file(file)) : new Response(null, { status: 403 });
} });
const base = `http://127.0.0.1:${server.port}`;
const profile = mkdtempSync(resolve(tmpdir(), "paper-brand-states-"));
const chrome = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
let ws: WebSocket;
try {
  const portFile = resolve(profile, "DevToolsActivePort");
  let port = "";
  // Chrome can create the port file before writing its contents.
  for (let i = 0; i < 100 && !port; i++) {
    if (existsSync(portFile)) port = readFileSync(portFile, "utf8").split("\n")[0];
    if (!port) await Bun.sleep(100);
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((done) => ws.onopen = done);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => { const message = JSON.parse(event.data as string); pending.get(message.id)?.(message); pending.delete(message.id); };
  const send = async (method, params = {}) => {
    const message: any = await new Promise((done) => { const next = ++id; pending.set(next, done); ws.send(JSON.stringify({ id: next, method, params })); });
    assert(!message.error, JSON.stringify(message.error));
    return message.result;
  };
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const state = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}), label = el.querySelector('.lbl') || el;
    const rgb = (s) => s.match(/[\\d.]+/g).map(Number);
    const blend = (fg, bg) => fg.slice(0, 3).map((x, i) => x * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const background = (el) => {
      const layers = []; for (let p = el; p; p = p.parentElement) layers.push(rgb(getComputedStyle(p).backgroundColor));
      return layers.reverse().reduce((bg, layer) => blend(layer, bg), [255,255,255]);
    };
    const lum = (rgb) => rgb.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126,.7152,.0722][i], 0);
    const contrast = (fg, bg) => { const [light, dark] = [lum(fg), lum(bg)].sort((a,b) => b-a); return (light+.05)/(dark+.05); };
    const bg = background(label), fg = blend(rgb(getComputedStyle(label).color), bg);
    const root = getComputedStyle(document.documentElement), accent = root.getPropertyValue('--brand-accent').trim(), accentText = root.getPropertyValue('--brand-accentText').trim();
    const color = (hex) => hex.match(/[a-f\\d]{2}/gi).map(x => parseInt(x,16));
    const same = (a,b) => a.every((x,i) => Math.abs(x-b[i]) < .01);
    // Catch accentText on an accent fill, even when a more specific rule wins.
    const collisions = [...document.querySelectorAll('body *')].filter(e => {
      if (!e.getBoundingClientRect().width || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      const c = rgb(getComputedStyle(e).color), b = background(e);
      return same(b,color(accent)) && (same(c,color(accent)) || same(c,color(accentText)));
    }).map(e => e.className);
    return { ratio: contrast(fg,bg), color: fg, background: bg, done: el.classList.contains('done'), collisions };
  })()`);
  const hover = async (selector) => {
    const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center',behavior:'instant'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await Bun.sleep(350);
    return point;
  };
  let checks = 0;
  const verify = async (selector, label, copied = false) => {
    const result = await state(selector);
    assert(result.ratio >= 4.5, `${label}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.collisions, [], `${label}: accent text on accent fill`);
    if (copied) assert(result.done, `${label}: copy did not reach its done state`);
    console.log(`PASS: ${label}: ${result.ratio.toFixed(4)}:1`);
    checks++;
  };
  await send("Page.enable");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    for (const route of ["/", "/mac/"]) {
      await send("Page.navigate", { url: base + route });
      await Bun.sleep(650);
      await evaluate("document.fonts.ready.then(() => true)");
      await evaluate("document.documentElement.style.scrollBehavior='auto';scrollTo({top:0,behavior:'instant'})");
      assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().bottom <= 0"), `${route}: skip link must be hidden before focus`);
      await evaluate("document.querySelector('.skip').focus()");
      assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().top >= 0"), `${route}: skip link must be visible on focus`);
      await evaluate("document.querySelector('.skip').blur()");
      checks++;
      if (route === "/") {
        assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), scheme === "light" ? "rgb(242, 239, 231)" : "rgb(18, 19, 23)", "Home must follow the system scheme");
        const videoRatio = await evaluate("(() => {const r=document.querySelector('.home-overview').getBoundingClientRect();return r.width/r.height;})()");
        assert(Math.abs(videoRatio - 1.6) < .01, `Home Overview recording aspect ratio: ${videoRatio}`);
        checks++;
        const truth = await evaluate(`(() => {
          const section = document.querySelector('.product-truth'), rail = section.closest('.more');
          const style = getComputedStyle(document.querySelector('.trust'));
          return {color: style.color, neutral: getComputedStyle(document.querySelector('.hero-facts')).color,
            rail: !!rail && getComputedStyle(rail, '::before').content !== 'none',
            pro: [...document.querySelectorAll('[data-tile="limelight"] figcaption > .on, [data-tile="snooze"] figcaption > .on')].map(e => e.textContent.trim()),
            facts: document.querySelector('.hero-facts').textContent};
        })()`);
        assert.equal(truth.color, truth.neutral, "Trust copy must use the neutral secondary text color");
        assert(truth.rail, "The timeline rail must include the product truth section");
        assert.deepEqual(truth.pro, ["macOS · Pro", "macOS · Pro"], "Limelight and snoozing must carry Pro tags");
        assert.equal(truth.facts, "Full-width windows. Scrolling Strips on macOS and Linux.");
        checks++;
        await verify('.trust', `home trust text, system ${scheme}`);
        await hover(".k-cmd");
        await verify(".k-cmd", `home Copy hover, system ${scheme}`);
      } else {
        await hover(".top nav .btn.pro");
        await verify(".top nav .btn.pro", `Mac header Pro hover, ${scheme}`);
        const point = await hover("#install .cmd");
        await verify("#install .cmd", `Mac Copy hover, ${scheme}`);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
        await Bun.sleep(200);
        await verify("#install .cmd", `Mac Copied while hovered, ${scheme}`, true);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
        await Bun.sleep(200);
        await verify("#install .cmd", `Mac Copied after pointer leaves, ${scheme}`, true);
      }
    }
  }
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: scheme}]});
    for (const width of [701, 768, 1000]) {
      await send("Emulation.setDeviceMetricsOverride", {width, height: 1024, deviceScaleFactor: 1, mobile: false});
      await send("Page.navigate", {url: base + "/paperland/"});
      await Bun.sleep(250);
      await evaluate("document.fonts.ready.then(() => true)");
      const nav = await evaluate(`(() => [...document.querySelectorAll('.top nav a')].map(e => {
        const r = e.getBoundingClientRect(); return {text: e.textContent, display: getComputedStyle(e).display,
          visible: r.width > 0 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth};
      }))()`);
      assert.equal(nav.length, 3);
      assert(nav.every(link => link.display !== 'none' && link.visible), `PaperLand nav ${width}px ${scheme}: ${JSON.stringify(nav)}`);
      console.log(`PASS: PaperLand navigation visible at ${width}x1024, ${scheme}`);
      checks++;
    }
  }
  console.log(`PASS: ${checks} computed interaction, keyboard, copy and tablet navigation checks; no accent-on-accent text; home follows both system schemes`);
} finally {
  ws?.close(); chrome.kill(); server.stop(true);
  await chrome.exited;
  rmSync(profile, { recursive: true, force: true });
}
