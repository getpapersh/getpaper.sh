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
        const commandGaps = await evaluate(`(() => [...document.querySelectorAll('.way .k-cmd code')].map(code => {
          const prefix = code.firstChild, tail = code.querySelector('.command-tail').firstChild;
          const range = document.createRange();
          range.setStart(prefix, prefix.textContent.trimEnd().length - 1); range.setEnd(prefix, prefix.textContent.trimEnd().length);
          const end = range.getBoundingClientRect();
          range.setStart(tail, 0); range.setEnd(tail, 1);
          return range.getBoundingClientRect().left - end.right;
        }))()`);
        assert.equal(commandGaps.length, 2);
        assert(commandGaps.every(gap => gap > 2), `Desktop install commands need a visible space: ${JSON.stringify(commandGaps)}`);
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
  for (const path of ['/robots.txt', '/favicon.ico', '/apple-touch-icon.png']) {
    assert.equal((await fetch(base + path)).status, 200, path);
    checks++;
  }
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]});
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await send('Page.navigate', {url: base + '/'});
      await Bun.sleep(250);
      await evaluate('document.fonts.ready.then(() => true)');
      await evaluate("document.documentElement.style.scrollSnapType='none';document.documentElement.style.scrollBehavior='auto'");
      let midVisible = 0;
      for (const y of [0, 1200, 1800, 2419, 3600, ...Array.from({length: 16}, (_, i) => 1900 + i * 100)]) {
        await evaluate(`scrollTo({top:${y},behavior:'instant'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
        const frameState = await evaluate(`(() => {
          const frame=document.querySelector('.vf'), style=getComputedStyle(frame), f=frame.getBoundingClientRect();
          const visible = +style.opacity >= .05 && style.visibility !== 'hidden';
          const cuts = [...document.querySelectorAll('.hero h1,.hero .h1')].some(el=>{
            if (!el.getBoundingClientRect().width || +getComputedStyle(el.closest('.lay')).opacity < .05) return false;
            const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();
            return ([f.left,f.right].some(x=>x>=r.left&&x<=r.right)&&f.bottom>r.top&&f.top<r.bottom)||([f.top,f.bottom].some(y=>y>=r.top&&y<=r.bottom)&&f.right>r.left&&f.left<r.right);
          });
          return {visible, cuts: visible && cuts};
        })()`);
        if (y >= 1900 && y <= 3400 && (y - 1900) % 100 === 0 && frameState.visible) midVisible++;
        assert(!frameState.cuts, `Viewfinder cuts headline at ${width}px, ${scheme}, scroll ${y}`);
      }
      if (width === 768) {
        assert(midVisible >= 8, `Tablet viewfinder disappeared through the middle of the story: ${midVisible}/16`);
        checks++;
      }
      checks++;
    }
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await send('Page.navigate', {url: base + '/mac/'});await Bun.sleep(250);
      await evaluate('document.fonts.ready.then(() => true)');
      const hierarchy = await evaluate(`(() => {
        const price=getComputedStyle(document.querySelector('#pro .col-head b')), name=getComputedStyle(document.querySelector('#pro .col-head h3'));
        return {priceSize:parseFloat(price.fontSize),nameSize:parseFloat(name.fontSize),priceWeight:+price.fontWeight,nameWeight:+name.fontWeight,priceColor:price.color,nameColor:name.color};
      })()`);
      assert(hierarchy.priceSize < hierarchy.nameSize && hierarchy.priceWeight < hierarchy.nameWeight && hierarchy.priceColor !== hierarchy.nameColor, `Sales-off comparison price hierarchy: ${JSON.stringify(hierarchy)}`);
      checks++;
    }
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
    const standalone = 'a.btn, a.mobile-dmg, .top a, footer a, .links a, .way .more-way a, .prod a, .text-links a, .way-panel .sub a';
    const targets = ['/', '/mac/', '/paperland/', '/terms/', '/privacy/', '/mac/activate/'].map(route => [route, standalone]);
    for (const [route, selector] of targets) {
      await send('Page.navigate', {url: base + route});await Bun.sleep(250);
      await evaluate('document.fonts.ready.then(() => true)');
      const short = await evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>!e.closest('[inert]')).map(e=>({text:e.textContent.trim(),box:e.getBoundingClientRect().toJSON()})).filter(e=>e.box.width>0&&e.box.height>0&&(e.box.width<43.9||e.box.height<43.9)))()`);
      assert.deepEqual(short, [], `${route} ${scheme}: short mobile tap targets`);
      const enlargedInline = await evaluate(`(() => [...document.querySelectorAll('p a, li a')].filter(e=>!e.matches(${JSON.stringify(standalone)})&&!e.closest('[inert]')&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='inline').map(e=>e.textContent.trim()))()`);
      assert.deepEqual(enlargedInline, [], `${route} ${scheme}: in-sentence links must stay inline`);
      if (route === '/terms/') {
        const lineHeight = await evaluate(`(() => {
          const p=document.querySelector('.legal p a[href="mailto:billing@getpaper.sh"]').closest('p'), copy=p.cloneNode(true);
          p.after(copy);for(const a of copy.querySelectorAll('a'))Object.assign(a.style,{display:'inline',minHeight:'0',minWidth:'0',padding:'0'});
          const heights=[p.getBoundingClientRect().height,copy.getBoundingClientRect().height];copy.remove();return heights;
        })()`);
        assert.equal(lineHeight[0], lineHeight[1], 'Terms billing link must not inflate paragraph line spacing');
        checks++;
      }
      assert.equal(await evaluate('document.documentElement.scrollWidth'), 390, `${route}: mobile overflow`);
      if (route === '/mac/') {
        const closed = await evaluate(`(() => {const a=document.querySelector('.top .trial-cta').getBoundingClientRect(),b=document.getElementById('header-sales').getBoundingClientRect();return {gap:b.top-a.bottom,fonts:[...document.querySelectorAll('.decide .price b,.purchase .price b')].map(e=>parseFloat(getComputedStyle(e).fontSize))};})()`);
        assert(closed.gap >= 6 && closed.fonts.every(size=>size<=28), 'Sales-off price hierarchy and header spacing');
        checks++;
      }
      if (['/terms/', '/privacy/', '/mac/activate/'].includes(route)) {
        assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().bottom<=0"), route+' skip hidden');
        await evaluate("document.querySelector('.skip').focus()");
        assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().top>=0"), route+' skip visible on focus');
        checks++;
      }
      checks++;
    }
  }
  const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const loadStrips = async (width, height, scheme, reduced = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await send('Emulation.setEmulatedMedia', { features: [{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}] });
    await send('Page.navigate', {url:base+'/mac/'}); await Bun.sleep(300);
    await evaluate('document.fonts.ready'); await settle();
    await evaluate(`document.documentElement.style.scrollBehavior='auto';window.lsRows=[...document.querySelectorAll('.ls .pin')];
      window.lsY=(kind,p)=>{const pin=lsRows.find(e=>e.dataset.row===kind),s=pin.querySelector('.stick');return Math.round(scrollY+pin.getBoundingClientRect().top-parseFloat(getComputedStyle(s).top)+(pin.offsetHeight-s.offsetHeight)*p)};
      window.lsRings=pin=>[...pin.querySelectorAll('.trk.in .win.f,.lift-layer .win.lift')].filter(e=>getComputedStyle(e).display!=='none').length;
      window.lsTransforms=pin=>[...pin.querySelectorAll('.track,.win')].map(e=>e.style.transform);
      window.lsTx=kind=>document.querySelector('.ls [data-row='+kind+'] .trk.in .track').style.transform.match(/[-.0-9]+/g).map(Number);`);
    assert(await evaluate("document.querySelector('.ls').dataset.ready==='1'"), 'Live Strips initialized');
  };
  const go = async (kind, p) => { await evaluate(`scrollTo({top:lsY('${kind}',${p}),behavior:'instant'})`); await settle(); };
  for (const scheme of ['light','dark']) {
    await loadStrips(1440,900,scheme);
    for (const kind of ['switch','resize','heights','send','overview']) {
      for (const p of [0,.4,1]) { await go(kind,p); assert.equal(await evaluate(`lsRings(lsRows.find(e=>e.dataset.row==='${kind}'))`),1,`${scheme} ${kind} one ring at ${p}`); checks++; }
    }
    for (const kind of ['switch','resize','overview','send','heights']) {
      await go(kind,.2); const first = await evaluate(`lsTransforms(lsRows.find(e=>e.dataset.row==='${kind}'))`);
      await go(kind,.7); const mid = await evaluate(`lsTransforms(lsRows.find(e=>e.dataset.row==='${kind}'))`);
      assert.notDeepEqual(mid,first,`${kind} responds to scroll`);
      await go(kind,.2); assert.deepEqual(await evaluate(`lsTransforms(lsRows.find(e=>e.dataset.row==='${kind}'))`), first, `${kind} exact reverse`); checks++;
    }
    for (const kind of ['switch','resize','overview']) {
      const values = [];
      const y = await evaluate(`lsY('${kind}',${kind==='switch'?.3:.2})`), k = kind==='switch'?68:225;
      for (const top of [y,y+k,y+2*k]) { await evaluate(`scrollTo({top:${top},behavior:'instant'})`); await settle(); values.push(await evaluate(`lsTx('${kind}')`)); }
      const i=kind==='overview'?1:0, tolerance=i?.001:.5;
      assert(Math.abs(values[1][i]-(values[0][i]+values[2][i])/2)<=tolerance,`${kind} linear: ${JSON.stringify(values)}`); checks++;
    }
    assert(await evaluate("[...document.querySelectorAll('.ls .track,.ls .win,.ls .map u')].every(e=>getComputedStyle(e).transitionDuration==='0s')"),'No camera transitions');
    await go('send',0);
    assert(await evaluate("(()=>{const p=lsRows.find(e=>e.dataset.row==='send'),a=p.querySelector('.lift').getBoundingClientRect(),b=p.querySelector('.viewport').getBoundingClientRect();return a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom})()"),'Send starts inside viewport');
    await go('overview',1);
    assert(await evaluate("(()=>{const p=lsRows.find(e=>e.dataset.row==='overview'),v=p.querySelector('.viewport').getBoundingClientRect();return [...p.querySelectorAll('.trk.in .win')].every(e=>{const r=e.getBoundingClientRect();return r.left>=v.left-1&&r.right<=v.right+1&&r.top>=v.top-1&&r.bottom<=v.bottom+1})})()"),'Overview fits at p=1');
    for (const [selector, min] of [['.ls .label',15],['.ls .note',5.5],['.ls .ls-lead',5.5]]) {
      const result = await state(selector); assert(result.ratio>=min,`${scheme} ${selector}: ${result.ratio}`); console.log(`PASS: Live Strips ${scheme} ${selector} contrast ${result.ratio.toFixed(4)}:1`); checks++;
    }
    if (scheme==='dark') assert(await evaluate("(()=>{const b=document.querySelector('.ls .band'),p=b.querySelector('.peek');return getComputedStyle(p).filter.includes('brightness(')&&getComputedStyle(p).getPropertyValue('--peek').trim()==='1'&&getComputedStyle(b).backgroundImage.includes('linear-gradient')})()"),'Dark terminal peeks dim by luminance with ink edges');
    for (const [width,height] of [[1440,900],[1440,700],[768,1024]]) {
      await loadStrips(width,height,scheme);
      assert(await evaluate("lsRows.every(p=>{const s=p.querySelector('.stick');return getComputedStyle(s).position==='sticky'&&p.offsetHeight-s.offsetHeight<=innerHeight+1&&s.offsetHeight<=innerHeight-32})"),`Pin bounds ${width}x${height}`);
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width); checks++;
    }
  }
  for (const width of [1440,390]) {
    await loadStrips(width,width===390?844:900,'light',true);
    assert(await evaluate("lsRows.every(p=>{const s=p.querySelector('.stick');return getComputedStyle(s).position!=='sticky'&&p.offsetHeight<=s.offsetHeight+1&&lsRings(p)===1})"),'Reduced motion: static and one ring');
    assert(await evaluate("[...document.querySelectorAll('.ls .swipe')].every(e=>getComputedStyle(e).display==='none'||e.scrollWidth<=e.clientWidth)"),'Reduced motion has no swipe');
    const first=await evaluate('lsRows.map(lsTransforms)');
    await evaluate("scrollTo({top:2000,behavior:'instant'})");await settle();
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:400,deltaX:300,deltaY:0});await settle();
    assert.deepEqual(await evaluate('lsRows.map(lsTransforms)'),first,'Reduced motion transforms stay fixed');
    assert(await evaluate("!!document.querySelector('.ls .map b.f')"),'Static Minimap focus');
    assert.equal(await evaluate('document.documentElement.scrollWidth'),width); checks+=5;
  }
  for (const scheme of ['light','dark']) {
    await loadStrips(390,844,scheme);
    assert(await evaluate("lsRows.every(p=>getComputedStyle(p.querySelector('.stick')).position==='static'&&lsRings(p)===1)"),'Phone no pins and one ring');
    assert(await evaluate("[...document.querySelectorAll('.ls .swipe')].every(e=>getComputedStyle(e).overflowX==='auto'&&e.clientHeight>=44&&e.scrollWidth>e.clientWidth&&getComputedStyle(e.parentElement).touchAction!=='pan-x')"),'Phone swipe surfaces and vertical page scroll');
    await evaluate("document.querySelector('.ls [data-row=switch] .band').scrollIntoView({block:'center',behavior:'instant'})"); await settle();
    const first=await evaluate("document.querySelector('.ls [data-row=switch] .trk.in .win.f').dataset.id");
    await evaluate("document.querySelector('.ls [data-row=switch] .swipe').scrollLeft+=240");await settle();
    assert.notEqual(await evaluate("document.querySelector('.ls [data-row=switch] .trk.in .win.f').dataset.id"),first,'Focus follows native swipe');
    // The media preferences can change without a reload.
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await settle();
    assert(await evaluate("lsRows.every(p=>lsRings(p)===1)&&[...document.querySelectorAll('.ls .swipe')].every(e=>getComputedStyle(e).display==='none')"),'Live reduced-motion change');
    checks+=4;
  }
  console.log('PASS: Live Strips reverse, linearity, pin bounds, focus, send, Overview, phone swipe and reduced motion');
  console.log(`PASS: ${checks} computed interaction, keyboard, copy and tablet navigation checks; no accent-on-accent text; home follows both system schemes`);
} finally {
  ws?.close(); chrome.kill(); server.stop(true);
  await chrome.exited;
  rmSync(profile, { recursive: true, force: true });
}
