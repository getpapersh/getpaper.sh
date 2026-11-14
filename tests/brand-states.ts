// Check the rendered cascade, including the theme selector and hover label overlays.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

const site = resolve(process.argv[2]);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const file = resolve(site, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
  if (!file.startsWith(site + sep)) return new Response(null, { status: 403 });
  // Exercise the promo state machine with an existing clip until the approved asset arrives.
  if (new URL(request.url).searchParams.has('promo-test')) {
    const source = new URL(request.url).searchParams.get('promo-test') === 'off' ? '' : '/media/papermac/strip.mp4';
    return new Response(readFileSync(file, 'utf8').replace(/data-promo-src="[^"]*"/, `data-promo-src="${source}"`), {headers:{'Content-Type':'text/html'}});
  }
  return new Response(Bun.file(file));
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
  const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const load = async (route, width=1440, height=900, scheme='light', reduced=false) => {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
    await send('Page.navigate',{url:base+route}); await Bun.sleep(400);
    await evaluate('document.fonts.ready.then(()=>true)'); await settle();
    await evaluate("document.documentElement.style.scrollBehavior='auto'");
  };
  const go = async (kind,p) => {
    await evaluate(`(()=>{const e=document.querySelector('[data-row="${kind}"]'),r=e.getBoundingClientRect();scrollTo({top:scrollY+r.top-innerHeight*.9+${p}*(innerHeight*.8+r.height*.5),behavior:'instant'})})()`);
    await settle();
  };
  const transforms = kind => evaluate(`[...document.querySelectorAll('[data-row="${kind}"] .track,[data-row="${kind}"] .win')].map(e=>e.style.transform)`);
  for (const scheme of ['light','dark']) {
    for (const route of ['/','/mac/']) {
      await load(route,1440,900,scheme);
      assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().bottom<=0"),'Skip hidden before focus');
      await evaluate("document.querySelector('.skip').focus()");
      assert(await evaluate("document.querySelector('.skip').getBoundingClientRect().top>=0"),'Skip visible on focus');
      await evaluate("document.querySelector('.skip').blur()"); checks++;
      assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'),scheme==='light'?'rgb(242, 239, 231)':'rgb(18, 19, 23)');
      assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollSnapType'),'none'); checks+=2;
      if (route==='/') {
        assert(await evaluate("document.querySelectorAll('.doors .door').length===2&&document.querySelectorAll('.shared article').length===3"),'Equal product doors and three shared cards');
        const heights=await evaluate("[...document.querySelectorAll('.door')].map(e=>e.getBoundingClientRect().height)");
        assert.equal(heights[0],heights[1]);
        assert(!(await evaluate("document.querySelector('main').innerText")).includes('curl'));
        await verify('.trust',`Chooser trust ${scheme}`); checks+=3;
      } else {
        await hover('.top .btn'); await verify('.top .btn',`Mac header download hover ${scheme}`);
        const point=await hover('#install .cmd'); await verify('#install .cmd',`Mac Copy hover ${scheme}`);
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point}); await Bun.sleep(200);
        await verify('#install .cmd',`Mac Copied hover ${scheme}`,true);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
        await verify('#install .cmd',`Mac Copied after leaving ${scheme}`,true);
        for (const selector of ['.ls .label','.ls .note','.founding','.lifetime-price','.buy-notice']) await verify(selector,`${selector} ${scheme}`);
      }
      await evaluate("document.querySelector('[data-theme-set=dark]').click()");
      assert.equal(await evaluate('document.documentElement.dataset.mode'),'dark');
      await evaluate("document.querySelector('[data-theme-set=light]').click()");
      assert.equal(await evaluate('document.documentElement.dataset.mode'),'light');
      await evaluate(`document.querySelector('[data-theme-set=""]').click()`); checks++;
    }
    for (const [width,height] of [[1440,900],[768,1024],[390,844]]) {
      await load('/mac/',width,height,scheme);
      const geometry=await evaluate(`(()=>[...document.querySelectorAll('.ls .pin')].map(p=>{const s=p.querySelector('.stick'),m=p.querySelector('.media'),r=m.getBoundingClientRect();return {kind:p.dataset.row,fill:r.height/innerHeight,ratio:r.width/r.height,pin:p.offsetHeight-s.offsetHeight,position:getComputedStyle(s).position}}))()`);
      assert.equal(geometry.length,4);
      for (const row of geometry) {
        const minimum=width===1440?.65:width===768?.515:.577;
        assert(row.fill>=minimum&&row.fill<=.725,`Media fill ${width}: ${JSON.stringify(row)}`);
        assert(Math.abs(row.ratio-(width===1440?1.6:width===768?4/3:4/5))<.01);
        assert.equal(row.pin,0); assert.notEqual(row.position,'sticky'); checks++;
      }
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
      for (const kind of ['switch','resize','heights','send']) {
        await go(kind,.2); const a=await transforms(kind);
        await go(kind,.7); const b=await transforms(kind); assert.notDeepEqual(a,b,kind+' scroll changes transforms');
        assert(await evaluate(`(()=>{const row=document.querySelector('[data-row="${kind}"]'),m=row.querySelector('.media').getBoundingClientRect();const rings=[...row.querySelectorAll('.win.f')].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none');return rings.length===1&&rings.some(e=>{const r=e.getBoundingClientRect();return r.left<m.right&&r.right>m.left&&r.top<m.bottom&&r.bottom>m.top})})()`),kind+' keeps one visible focus ring');
        await go(kind,.2); assert.deepEqual(await transforms(kind),a,kind+' scroll reverses'); checks+=2;
      }
      await evaluate(`window.layoutWrites=[];window.layoutObserver=new MutationObserver(records=>{for(const r of records){const old=document.createElement('i').style;old.cssText=r.oldValue||'';for(const key of ['width','height','top','font-size'])if(old.getPropertyValue(key)!==r.target.style.getPropertyValue(key))layoutWrites.push(key)}});layoutObserver.observe(document.querySelector('.ls'),{subtree:true,attributes:true,attributeFilter:['style'],attributeOldValue:true})`);
      for (const kind of ['switch','resize','heights','send']) {await go(kind,.3);await go(kind,.6);}
      assert.deepEqual(await evaluate('layoutWrites'),[],'Scroll must not mutate width, height, top or font-size');
      await evaluate('layoutObserver.disconnect()');
      assert(await evaluate("[...document.querySelectorAll('.ls .track')].every(e=>getComputedStyle(e).willChange==='transform')"),'Tracks have a compositor layer'); checks+=3;
      await load('/mac/',width,height,scheme,true);
      assert(await evaluate("document.querySelector('.hero-film').dataset.phase==='screencast'&&document.querySelector('.screencast').paused"),'Reduced motion starts on a still screencast');
      const still=await evaluate("[...document.querySelectorAll('.ls .track,.ls .win')].map(e=>e.style.transform)");
      await evaluate("scrollTo({top:2000,behavior:'instant'})");await settle();
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.ls .track,.ls .win')].map(e=>e.style.transform)"),still,'Reduced motion stays fixed');
      const snapshot=`(()=>[...document.querySelectorAll('.ls .band')].map(b=>[...b.querySelectorAll('.win')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect(),o=b.getBoundingClientRect();return [e.dataset.id,r.x-o.x,r.y-o.y,r.width,r.height]})))()`;
      const expected=await evaluate(snapshot);
      await send('Emulation.setScriptExecutionDisabled',{value:true});
      try {
        await send('Page.reload',{ignoreCache:true});await Bun.sleep(300);await evaluate('document.fonts.ready.then(()=>true)');
        assert.deepEqual(await evaluate(snapshot),expected,'No-JavaScript diagrams match the reduced-motion first frame');
        assert(await evaluate("document.querySelectorAll('.ls .band .win').length>10"),'Static windows exist without JS');
        assert(await evaluate("getComputedStyle(document.querySelector('.screencast')).display!=='none'&&document.querySelector('.screencast').controls"),'No-JS hero keeps native playback controls');
      } finally {await send('Emulation.setScriptExecutionDisabled',{value:false});} checks+=5;
    }
    for (const width of [701,768,1000]) {
      await load('/paperland/',width,1024,scheme);
      assert(await evaluate("[...document.querySelectorAll('.top nav a')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>=44&&r.left>=0&&r.right<=innerWidth})"),'PaperLand tablet nav stays visible');checks++;
    }
    for (const route of ['/','/mac/','/paperland/','/terms/','/privacy/','/mac/activate/']) {
      await load(route,390,844,scheme);
      assert.equal(await evaluate('document.documentElement.scrollWidth'),390,route+' mobile overflow');
      const selector='a.btn,a.mobile-dmg,.top a,footer nav a,footer .brand,.text-links a,button:not([hidden])';
      const short=await evaluate(`(()=>[...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>({text:e.textContent.trim(),r:e.getBoundingClientRect()})).filter(e=>e.r.width>0&&e.r.height>0&&(e.r.width<43.9||e.r.height<43.9)).map(e=>e.text))()`);
      assert.deepEqual(short,[],route+' mobile target size'); checks+=2;
    }
  }
  await load('/mac/?promo-test=off');
  assert(await evaluate("document.querySelector('.promo').currentSrc===''&&document.querySelector('[data-film-replay]').hidden&&document.querySelector('.hero-film').dataset.phase==='screencast'"),'Empty promo source starts the real loop with replay hidden');
  assert(await evaluate("!performance.getEntriesByType('resource').some(e=>e.name.endsWith('/promo.mp4'))"),'Empty promo does not request a missing media file'); checks+=2;
  await load('/mac/?promo-test=1');
  assert.equal(await evaluate("document.querySelector('.hero-film').dataset.phase"),'promo','Desktop starts the promo');
  assert(await evaluate("!document.querySelector('.promo').loop&&document.querySelector('.promo').muted&&document.querySelector('.promo').playsInline"));
  await evaluate("document.querySelector('[data-film-pause]').click()");
  assert(await evaluate("document.querySelector('.promo').paused"),'Pause stops the promo');
  await evaluate("document.querySelector('[data-film-pause]').click();document.querySelector('.promo').dispatchEvent(new Event('ended'))");await Bun.sleep(700);
  assert(await evaluate("document.querySelector('.hero-film').dataset.phase==='screencast'&&document.querySelector('.screencast').loop&&getComputedStyle(document.querySelector('.promo')).opacity==='0'"),'Promo ends in a crossfade to the loop');
  await evaluate("document.querySelector('[data-film-replay]').click()");
  assert.equal(await evaluate("document.querySelector('.hero-film').dataset.phase"),'promo');
  await evaluate("scrollTo({top:2000,behavior:'instant'})");await Bun.sleep(250);
  assert.equal(await evaluate("document.querySelector('.hero-film').dataset.phase"),'screencast','Passing hero skips promo');
  await evaluate("scrollTo({top:0,behavior:'instant'})");await Bun.sleep(250);
  assert.equal(await evaluate("document.querySelector('.hero-film').dataset.phase"),'screencast','Return does not replay the promo');
  await evaluate("document.querySelector('[data-film-pause]').click()");
  assert(await evaluate("document.querySelector('.screencast').paused"),'Pause stops loop'); checks+=8;
  for (const [width,reduced] of [[390,false],[1440,true]]) {
    await load('/mac/?promo-test=1',width,width===390?844:900,'light',reduced);
    assert.equal(await evaluate("document.querySelector('.hero-film').dataset.phase"),'screencast','Phone and reduced motion skip promo'); checks++;
  }
  for (const path of ['/robots.txt','/favicon.ico','/apple-touch-icon.png']) { assert.equal((await fetch(base+path)).status,200); checks++; }
  console.log(`PASS: ${checks} browser checks: both themes, three viewports, copy and focus, fixed geometry, reverse scrolling, no pins, no-JS first frames and hero playback states`);
} finally {
  ws?.close(); chrome.kill(); server.stop(true);
  await chrome.exited;
  rmSync(profile, { recursive: true, force: true });
}
