(() => {
  const section = document.querySelector('[data-live-strips]');
  if (!section) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = n => Math.max(0, Math.min(1, n));
  const lerp = (a, b, p) => a + (b - a) * p;
  const rows = [...section.querySelectorAll('.pin')].map(pin => {
    const bands = [...pin.querySelectorAll('.band')].map(band => ({
      band, track: band.querySelector('.track'),
      wins: [...band.querySelectorAll('.win')].map(el => ({el, focused:el.classList.contains('f'), x:parseFloat(el.style.getPropertyValue('--x')) || 0, w:parseFloat(el.style.getPropertyValue('--ww')) || .479})),
    }));
    const row = {pin, bands, kind:pin.dataset.row};
    if (row.kind === 'send') {
      row.arrival = bands[1].wins.find(w => w.el.dataset.id === 'a1');
      row.flyer = row.arrival.el.cloneNode(true); row.flyer.classList.add('lift');
      const layer = document.createElement('div'); layer.className = 'lift-layer';
      layer.append(row.flyer); pin.querySelector('.duo').append(layer);
    }
    return row;
  });
  function measure() {
    for (const row of rows) for (const b of row.bands) {
      b.width = b.band.clientWidth;
      b.iw = parseFloat(getComputedStyle(b.wins[0].el).width) / b.wins[0].w;
      b.center = b.width / 2;
      b.top = row.kind === 'send' ? 28 : row.kind === 'heights' ? 6 : 16;
      b.offset = b.band.offsetTop + b.band.clientTop;
      b.height = parseFloat(getComputedStyle(b.wins[0].el).height);
      b.map = row.pin.querySelector('.map');
      b.mapWidth = b.map?.clientWidth;
      b.restCenter = parseFloat(b.band.style.getPropertyValue('--center'));
      if (row.flyer && b === row.bands[0]) {
        // Size is established only on resize; the flight scales this fixed rectangle.
        Object.assign(row.flyer.style, {width:row.arrival.w * b.iw+'px',height:getComputedStyle(b.wins[0].el).height,fontSize:getComputedStyle(b.wins[0].el).fontSize});
      }
    }
  }
  function camera(b, center, ring = true) {
    b.track.style.transform = `translate3d(${b.center-center*b.iw}px,0,0)`;
    const focused = ring && b.wins.reduce((a,w) => Math.abs(w.x+w.w/2-center)<Math.abs(a.x+a.w/2-center)?w:a);
    for (const w of b.wins) w.el.classList.toggle('f',w===focused);
    if (b.map) {
      [...b.map.querySelectorAll('b')].forEach((bar,i)=>bar.classList.toggle('f',b.wins[i]===focused));
      const last=b.wins.at(-1);
      b.map.querySelector('u').style.transform=`translate3d(${(center-b.restCenter)/(last.x+last.w)*b.mapWidth}px,0,0)`;
    }
  }
  function render(row) {
    if (reduced.matches) {
      for (const b of row.bands) { b.track.style.transform=''; for (const w of b.wins) { w.el.style.transform=''; w.el.classList.toggle('f',w.focused); }
        if (b.map) { b.map.querySelector('u').style.transform=''; [...b.map.querySelectorAll('b')].forEach((bar,i)=>bar.classList.toggle('f',b.wins[i].focused)); } }
      if (row.flyer) { row.flyer.hidden=true; row.arrival.el.style.display=''; }
      return;
    }
    const rect = row.pin.getBoundingClientRect();
    if (rect.bottom < -innerHeight * .25 || rect.top > innerHeight * 1.25) return;
    const p = clamp((innerHeight * .9 - rect.top) / (innerHeight * .8 + rect.height * .5));
    if (row.kind === 'send') {
      const [a,b] = row.bands, gap=.493, x=.493;
      camera(a,x+gap*(1-p)/2,false); camera(b,x+gap*p/2,false);
      for (const w of a.wins) w.el.style.transform=`translate3d(${(w.x+(w.x>=.5?gap*(1-p):0))*a.iw}px,0,0)`;
      for (const w of b.wins) w.el.style.transform=`translate3d(${(w.x-(w.x>.9?gap*(1-p):0))*b.iw}px,0,0)`;
      row.arrival.el.style.display='none'; row.flyer.hidden=false;
      const fromX=a.band.offsetLeft+a.band.clientLeft+a.center-gap*(1-p)*a.iw/2;
      const toX=b.band.offsetLeft+b.band.clientLeft+b.center-gap*p*b.iw/2;
      const ah=a.height,bh=b.height;
      row.flyer.style.transform=`translate3d(${lerp(fromX,toX,p)}px,${lerp(a.offset+a.top,b.offset+b.top,p)}px,0) scale(${lerp(1,b.iw/a.iw,p)},${lerp(1,bh/ah,p)})`;
    } else for (const b of row.bands) {
      const first=b.wins[0],last=b.wins.at(-1);
      if (row.kind === 'resize') {
        const target=b.wins.find(w=>w.el.dataset.id==='r1'), grow=lerp(.479,.98,p)-target.w;
        camera(b,target.x+(target.w+grow)/2);
        for (const w of b.wins) w.el.style.transform=`translate3d(${(w.x+(w.x>target.x?grow:0))*b.iw}px,0,0) scaleX(${w===target?(target.w+grow)/target.w:1})`;
      } else {
        const start=row.kind==='switch'?b.wins[1]:first;
        let center=lerp(start.x+start.w/2,last.x+last.w/2,p);
        if (row.kind==='switch') center=Math.min(last.x+last.w-.5,center);
        if (row.kind==='heights') center=Math.max(.5,Math.min(last.x+last.w-.5,center));
        camera(b,center,row.kind!=='heights'||b===row.bands[0]);
      }
    }
  }
  let queued=false, dirty=true;
  function schedule(resize=false) {
    dirty ||= resize;
    if (queued) return;
    queued=true;
    requestAnimationFrame(() => {
      queued=false;
      if (dirty) { dirty=false; measure(); }
      for (const row of rows) render(row);
      section.dataset.ready='1';
    });
  }
  addEventListener('scroll',()=>schedule(),{passive:true});
  addEventListener('resize',()=>schedule(true));
  reduced.addEventListener('change',()=>schedule(true));
  new ResizeObserver(()=>schedule(true)).observe(section);
  document.fonts.ready.then(()=>schedule(true));
  schedule(true);
})();
