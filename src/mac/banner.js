(() => {
  const figure = document.querySelector('[data-strip-demo]');
  if (!figure) return;
  const stage = figure.querySelector('.stage'), tracks = [...figure.querySelectorAll('.track')];
  const map = figure.querySelector('.map'), view = map.querySelector('u');
  const button = figure.querySelector('.pause'), caption = figure.querySelector('.cap');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const beats = JSON.parse(figure.dataset.beats), order = ['a','b','c','n','d','e','f'];
  const wins = order.map(id => {
    const pair = tracks.map(t => t.querySelector(`[data-id="${id}"]`));
    return {id,pair,bar:map.querySelector(`[data-id="${id}"]`),w:parseFloat(pair[0].style.getPropertyValue('--ww'))};
  });
  // Strip positions and widths use inset-screen fractions; pixel sizes change only on resize.
  const baseTotal = 2.95386;
  let G, focus='b', opened=false, wide=false, zoom=false, beat=-1;
  let playing=!reduced.matches, visible=false, timer;
  function measure() {
    G = {width:stage.clientWidth,iw:parseFloat(getComputedStyle(wins[0].pair[0]).width)/wins[0].w,mapWidth:map.clientWidth};
  }
  function layout() {
    let x=0;
    const positions=wins.filter(w=>w.id!=='n'||opened).map(w=>{
      const width=w.id==='n' && wide ? .972 : w.w, position={...w,x,width};
      x+=width+.014; return position;
    });
    const total=x-.014, target=positions.find(w=>w.id===focus), scale=zoom?Math.min(1,.972/total):1;
    const tx=G.width/2-(zoom?scale*total/2:target.x+target.width/2)*G.iw;
    for (const track of tracks) track.style.transform=`translate3d(${tx}px,0,0) scale(${scale})`;
    for (const win of wins) {
      const position=positions.find(p=>p.id===win.id);
      for (const el of win.pair) {
        el.style.opacity=position?'1':'0'; el.classList.toggle('f',win.id===focus);
        if (position) el.style.transform=`translate3d(${position.x*G.iw}px,0,0) scaleX(${position.width/win.w})`;
      }
      win.bar.style.opacity=position?'1':'0'; win.bar.classList.toggle('f',win.id===focus);
      if (position) win.bar.style.transform=`translate3d(${position.x/total*G.mapWidth}px,0,0) scaleX(${position.width/win.w*baseTotal/total})`;
    }
    const v0=Math.max(0,(G.width/2-G.iw/2-tx)/scale/G.iw),v1=Math.min(total,(G.width/2+G.iw/2-tx)/scale/G.iw);
    view.style.transform=`translate3d(${v0/total*G.mapWidth}px,0,0) scaleX(${(v1-v0)*baseTotal/total})`;
  }
  function step() {
    beat=(beat+1)%beats.length;
    if (beat===0) focus='c';
    else if (beat===1) {opened=true;focus='n';}
    else if (beat===2) wide=true;
    else if (beat===3) zoom=true;
    else if (beat===4) {zoom=false;focus='e';}
    else {opened=false;wide=false;zoom=false;focus='b';}
    caption.textContent=beats[beat]; layout();
  }
  function schedule() {
    clearInterval(timer);
    if (playing&&visible&&!document.hidden) timer=setInterval(step,2700);
    button.dataset.paused=String(!playing);
    button.setAttribute('aria-label',playing?'Pause window animation':'Play window animation');
    button.querySelector('.lbl').textContent=playing?'Pause':'Play';
  }
  button.hidden=false;
  button.addEventListener('click',()=>{
    playing=!playing;
    if (!playing) {
      const elements=[...tracks,...wins.flatMap(w=>w.pair),...wins.map(w=>w.bar),view];
      const frames=elements.map(el=>({el,transform:getComputedStyle(el).transform,opacity:getComputedStyle(el).opacity}));
      figure.classList.add('still');
      for (const frame of frames) Object.assign(frame.el.style,{transform:frame.transform,opacity:frame.opacity});
    } else {figure.classList.remove('still');layout();}
    schedule();
  });
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();}).observe(figure);
  document.addEventListener('visibilitychange',schedule);
  reduced.addEventListener('change',()=>{
    playing=!reduced.matches;
    if (reduced.matches) {opened=false;wide=false;zoom=false;focus='b';beat=-1;caption.textContent=figure.dataset.rest;layout();}
    schedule();
  });
  function resize() {
    figure.classList.add('still');measure();layout();
    requestAnimationFrame(()=>requestAnimationFrame(()=>figure.classList.remove('still')));
  }
  addEventListener('resize',resize);
  document.fonts.ready.then(resize);
  resize(); schedule();
})();
