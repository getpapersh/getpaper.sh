(() => {
  const $ = (s, r) => r.querySelector(s);
  const $$ = (s, r) => [...r.querySelectorAll(s)];
  const clamp = n => Math.max(0, Math.min(1, n));
  const lerp = (a, b, p) => a + (b - a) * p;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const PHONE = matchMedia('(max-width: 700px)');
  const mode = () => RM.matches ? 'still' : PHONE.matches ? 'swipe' : 'pin';
  const wins = (prefix, kinds, widths) => kinds.map((k, i) => ({ id: prefix + i, k, w: widths[i] }));
  const specs = {
    switch: { wins: wins('s', ['dc','ed','te','dc','ed','te'], [.5,.5,.34,.67,.5,.5]), from: 1 },
    resize: { wins: wins('r', ['ed','dc','te','dc'], [.5,.5,.5,.5]), focus: 'r1' },
    heights: { top: wins('h', ['te','ed','dc','ed'], [.5,.5,.67,.5]), bot: wins('j', ['dc','te','ed','dc'], [.67,.5,.34,.5]) },
    send: { top: wins('a', ['ed','dc','te','ed'], [.5,.5,.5,.5]), bot: wins('b', ['ed','dc','te'], [.5,.5,.5]), moving: 'a1', at: 1 },
    overview: { wins: wins('o', ['ph','ed','te','dc','mu','ed'], [.5,.5,.34,.67,.5,.5]), focus: 'o1' },
  };
  const still = { switch: .45, resize: .7, heights: .4, send: 1, overview: 1 };
  // Strip units are fractions of the viewport's usable width; every other coordinate is local CSS px.
  const px = (w, G) => w * (G.U + G.g) - G.g;
  function measure(wins, G) {
    let x = 0;
    const pos = wins.map(w => { const v = { ...w, x, wpx: px(w.w, G) }; x += v.wpx + G.g; return v; });
    return { pos, T: x - G.g };
  }
  const center = w => w.x + w.wpx / 2;
  const nearest = (pos, x) => pos.reduce((a, b) => Math.abs(center(a) - x) <= Math.abs(center(b) - x) ? a : b);
  function travel(pos, p, from = 0) {
    const raw = p * (pos.length - 1 - from), i = Math.min(pos.length - 2 - from, Math.floor(raw));
    const a = pos[from + i], b = pos[from + i + 1], t = raw - i;
    return { x: lerp(center(a), center(b), t), focus: (t < .5 ? a : b).id };
  }
  function makeWin(w) {
    const el = document.createElement('div');
    el.className = 'win ' + w.k; el.dataset.id = w.id; el.innerHTML = window.PaperKind[w.k];
    return el;
  }
  function makeBand(band, list, map) {
    const tracks = $$('.track', band), els = new Map();
    for (const w of list) {
      els.set(w.id, tracks.map(t => $('[data-id="' + w.id + '"]', t)));
    }
    return { band, tracks, els, wins: list, map, bars: map && $$('b', map), frame: map && $('u', map), swipe: $('.swipe', band), inner: $('.swipe-inner', band) };
  }
  function place(b, pos, focus) {
    for (const [id, pair] of b.els) {
      const w = pos.find(w => w.id === id);
      for (const el of pair) {
        el.style.display = w ? '' : 'none';
        el.classList.toggle('f', id === focus);
        if (w) Object.assign(el.style, { width: w.wpx + 'px', height: b.G.h + 'px', top: b.G.top + 'px', transform: `translateX(${w.x}px)`, fontSize: (b.G.h / 30).toFixed(2) + 'px' });
      }
    }
  }
  function camera(b, tx, scale = 1) {
    for (const t of b.tracks) { t.style.transformOrigin = `0 ${b.G.top + b.G.h / 2}px`; t.style.transform = `translateX(${tx}px) scale(${scale})`; }
  }
  function layoutStrip(b, list, p, opts = {}) {
    const G = b.G, {pos, T} = measure(list, G);
    let scale = 1, focus = opts.focus || pos[0].id, x = center(pos.find(w => w.id === focus));
    if (opts.from != null) { const tr = travel(pos, p, opts.from); x = tr.x; focus = tr.focus; }
    if (b.row === 'switch') x = Math.min(x, T - G.iw / 2);
    let tx = G.vpCenter - x;
    if (opts.overview) {
      scale = lerp(1, Math.min(1, (G.iw - 2 * G.g) / T), p);
      tx = lerp(tx, G.vpCenter - scale * T / 2, p);
    }
    if (mode() === 'swipe') {
      const min = center(pos[0]), range = center(pos[pos.length - 1]) - min;
      b.inner.style.width = b.swipe.clientWidth + range * scale + 'px';
      if (b.initSwipe) {
        b.swipe.scrollLeft = (opts.focus ? x - min : range * still[b.row]) * scale;
        b.initSwipe = false;
      }
      // Overview remains fitted; native scroll moves its camera without changing its fixed scale.
      tx = opts.overview ? G.vpCenter - scale * T / 2 - b.swipe.scrollLeft : G.vpCenter - min - b.swipe.scrollLeft;
      focus = nearest(pos, (G.vpCenter - tx) / scale).id;
    }
    camera(b, tx, scale); place(b, pos, opts.ring === false ? null : focus);
    if (b.map) {
      const k = b.mapWidth / T;
      pos.forEach((w, i) => { Object.assign(b.bars[i].style, { left: w.x * k + 'px', width: Math.max(3, w.wpx * k - 2) + 'px' }); b.bars[i].classList.toggle('f', w.id === focus); });
      const v0 = Math.max(0, (G.ix - tx) / scale), v1 = Math.min(T, (G.ix + G.iw - tx) / scale);
      Object.assign(b.frame.style, { left: v0 * k - 3 + 'px', width: (v1 - v0) * k + 6 + 'px' });
    }
  }
  function withGap(list, at, gap, G) {
    const {pos} = measure(list, G);
    let x = 0, gapX = 0;
    pos.forEach((w, i) => { if (i === at) { gapX = x; x += gap + G.g; } w.x = x; x += w.wpx + G.g; });
    return { pos, gapX };
  }
  function layoutSend(s, p) {
    const spec = s.spec, [top, bot] = s.bands, mover = spec.top.find(w => w.id === spec.moving);
    const stay = spec.top.filter(w => w !== mover), dest = [...spec.bot.slice(0, spec.at), mover, ...spec.bot.slice(spec.at)];
    if (mode() === 'swipe') {
      layoutStrip(top, stay, 1, { from: 0, ring: false }); layoutStrip(bot, dest, 1, { focus: mover.id });
      s.flyer.style.display = 'none'; return;
    }
    s.flyer.style.display = '';
    const a = withGap(stay, spec.at, px(mover.w, top.G) * (1 - p), top.G);
    const b = withGap(spec.bot, spec.at, px(mover.w, bot.G) * p, bot.G);
    const topTx = top.G.vpCenter - a.gapX - px(mover.w, top.G) * (1 - p) / 2;
    const botTx = bot.G.vpCenter - b.gapX - px(mover.w, bot.G) * p / 2;
    camera(top, topTx); camera(bot, botTx); place(top, a.pos, null); place(bot, b.pos, null);
    Object.assign(s.flyer.style, {
      width: lerp(px(mover.w, top.G), px(mover.w, bot.G), p) + 'px', height: lerp(top.G.h, bot.G.h, p) + 'px',
      transform: `translate(${lerp(topTx + a.gapX, botTx + b.gapX, p)}px, ${lerp(top.G.top, bot.offset + bot.G.top, p)}px)`,
      fontSize: (lerp(top.G.h, bot.G.h, p) / 30).toFixed(2) + 'px',
    });
  }
  function LiveStrips(el) {
    const active = new Set();
    const states = $$('.pin', el).map(pin => {
      const kind = pin.dataset.row, spec = specs[kind], stick = $('.stick', pin), bands = $$('.band', pin);
      const s = { pin, stick, kind, spec, bands: [], p: 0 };
      if (spec.wins) s.bands = [makeBand(bands[0], spec.wins, $('.map', pin))];
      else {
        s.bands = [makeBand(bands[0], spec.top), makeBand(bands[1], kind === 'send' ? [...spec.bot, spec.top.find(w => w.id === spec.moving)] : spec.bot)];
        if (kind === 'send') { const layer = document.createElement('div'); layer.className = 'lift-layer'; s.flyer = makeWin(spec.top.find(w => w.id === spec.moving)); s.flyer.classList.add('lift'); s.flyer.style.display = 'none'; layer.append(s.flyer); $('.duo', pin).append(layer); }
      }
      for (const b of s.bands) b.row = kind;
      return s;
    });
    function measureAll() {
      for (const s of states) {
        s.pinTop = Math.max(16, Math.round((innerHeight - s.stick.offsetHeight) / 2));
        s.stick.style.setProperty('--pin-top', s.pinTop + 'px');
        s.travel = s.pin.offsetHeight - s.stick.offsetHeight;
        for (const b of s.bands) {
          const br = b.band.getBoundingClientRect(), vr = $('.viewport', b.band).getBoundingClientRect();
          const iw = vr.width, ih = vr.height, g = iw * .014, pad = Math.max(8, ih * .05);
          b.G = { iw, g, U: iw - 2 * g, top: vr.top - br.top + pad, h: Math.max(40, ih - 2 * pad), ix: vr.left - br.left, vpCenter: vr.left - br.left + iw / 2 };
          b.offset = b.band.offsetTop; b.mapWidth = b.map?.clientWidth;
          $('.trk.in', b.band).style.clipPath = `inset(${vr.top - br.top}px ${br.right - vr.right}px ${br.bottom - vr.bottom}px ${vr.left - br.left}px round 12px)`;
          const peek = $('.trk.peek', b.band);
          for (const [key, value] of Object.entries({ '--a': vr.left - br.left, '--b': vr.right - br.left, '--bw': br.width })) peek.style.setProperty(key, value + 'px');
          b.band.style.setProperty('--fade', Math.min(32, Math.max(20, br.width * .04)) + 'px');
          b.initSwipe = true;
          if (mode() !== 'swipe') { b.inner.style.width = '1px'; b.swipe.scrollLeft = 0; }
        }
      }
    }
    function layout(s) {
      const p = mode() === 'pin' ? clamp((s.pinTop - s.pin.getBoundingClientRect().top) / s.travel) : still[s.kind];
      s.p = p;
      if (s.kind === 'send') layoutSend(s, p);
      else if (s.kind === 'heights') s.bands.forEach((b, i) => layoutStrip(b, b.wins, p, { from: 0, ring: i === 0 }));
      else {
        const b = s.bands[0], list = s.kind === 'resize' ? b.wins.map(w => w.id === s.spec.focus ? { ...w, w: lerp(.5, .98, p) } : w) : b.wins;
        layoutStrip(b, list, p, { from: s.spec.from, focus: s.spec.focus, overview: s.kind === 'overview' });
      }
    }
    let ticking = false, dirty = true;
    function requestTick(resize = false) {
      dirty ||= resize;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const all = dirty;
        if (dirty) { dirty = false; measureAll(); }
        for (const s of states) if (all || active.has(s)) layout(s);
        el.dataset.ready = '1';
      });
    }
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) { const s = states.find(s => s.pin === e.target); if (e.isIntersecting) active.add(s); else active.delete(s); }
      requestTick();
    }, { rootMargin: '50% 0px' });
    for (const s of states) {
      observer.observe(s.pin);
      for (const b of s.bands) b.swipe.addEventListener('scroll', () => requestTick(), { passive: true });
    }
    addEventListener('scroll', () => requestTick(), { passive: true });
    addEventListener('resize', () => requestTick(true));
    new ResizeObserver(() => requestTick(true)).observe(el);
    RM.addEventListener('change', () => requestTick(true)); PHONE.addEventListener('change', () => requestTick(true));
    document.fonts.ready.then(() => requestAnimationFrame(() => requestTick(true)));
  }
  for (const el of $$('[data-live-strips]', document)) LiveStrips(el);
})();
