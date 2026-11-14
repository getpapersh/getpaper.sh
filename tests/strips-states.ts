import assert from 'node:assert/strict';

export const displayChrome = `(() => {
  const [source,dest] = document.querySelectorAll('.ls [data-row=send] .band');
  const bezel = getComputedStyle(dest,'::before'), menu = getComputedStyle(dest,'::after');
  return parseFloat(bezel.borderTopWidth) >= 4 && parseFloat(bezel.borderTopWidth) > parseFloat(getComputedStyle(source,'::before').borderTopWidth)
    && parseFloat(menu.height) >= 12 && menu.content !== 'none'
    && dest.querySelector('.viewport').getBoundingClientRect().top - dest.getBoundingClientRect().top >= 26;
})()`;
export const switchEnd = `(() => {
  const band=document.querySelector('.ls [data-row=switch] .band'),v=band.querySelector('.viewport').getBoundingClientRect();
  const wins=[...band.querySelectorAll('.trk.in .win')].map(e=>e.getBoundingClientRect());
  return {emptyR:Math.max(0,v.right-Math.max(...wins.map(r=>r.right)))/v.width,neighbors:wins.filter(r=>r.left<v.right&&r.right>v.left).length};
})()`;
export const stillLayout = `(() => [...document.querySelectorAll('.ls .pin')].map(row => {
  const bands=[...row.querySelectorAll('.band')];
  const rect=(el,origin)=>{const r=el.getBoundingClientRect(),o=origin.getBoundingClientRect();return [r.left-o.left,r.top-o.top,r.width,r.height]};
  const visible=el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;
  const data=bands.map(b=>({size:[b.clientWidth,b.clientHeight],viewport:b.querySelector('.viewport')?rect(b.querySelector('.viewport'),b):[],windows:[...b.querySelectorAll('.trk.in .win')].filter(visible).map(e=>({id:e.dataset.id,rect:rect(e,b)}))}));
  const flyer=row.querySelector('.lift');if(flyer&&visible(flyer))data[1].windows.push({id:flyer.dataset.id,rect:rect(flyer,bands[1])});
  data.forEach(b=>b.windows.sort((a,b)=>a.id.localeCompare(b.id)));
  const map=row.querySelector('.map');
  return {kind:row.dataset.row,pin:getComputedStyle(row.querySelector('.stick')).position==='sticky',rings:[...row.querySelectorAll('.trk.in .win.f,.lift')].filter(visible).length,bands:data,map:map?[...map.children].map(e=>rect(e,map)):[]};
}))()`;
export function assertStill(actual,expected,label) {
  assert.equal(actual.length,5,label);
  actual.forEach((row,i)=>{
    assert(!row.pin,`${label}: ${row.kind} must not pin`);
    assert.equal(row.rings,1,`${label}: ${row.kind} needs one focus ring`);
    assert(row.bands.every(b=>b.windows.length>0),`${label}: ${row.kind} needs windows in every tray`);
    assert.deepEqual(row.bands.map(b=>b.windows.map(w=>w.id)),expected[i].bands.map(b=>b.windows.map(w=>w.id)),`${label}: ${row.kind} window identities`);
    const coords=r=>[...r.bands.flatMap(b=>[...b.size,...b.viewport,...b.windows.flatMap(w=>w.rect)]),...r.map.flat()];
    const a=coords(row),b=coords(expected[i]);assert.equal(a.length,b.length,label);
    assert(a.every((x,j)=>Math.abs(x-b[j])<=1),`${label}: ${row.kind} differs from reduced motion by over 1px: ${JSON.stringify({actual:a,expected:b})}`);
  });
}
