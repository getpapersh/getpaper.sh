import assert from 'node:assert/strict';

// Read the rendered screenshot through a canvas so both browser harnesses test actual composited pixels.
export async function checkLightPeeks(evaluate, capture, kind, label) {
  const geometry = await evaluate(`(() => {
    const row = document.querySelector('.ls [data-row="${kind}"]');
    for (const band of row.querySelectorAll('.band')) {
      const b = band.getBoundingClientRect(), v = band.querySelector('.viewport').getBoundingClientRect();
      for (const win of band.querySelectorAll('.peek .win.te')) {
        const w = win.getBoundingClientRect(), y = Math.round(w.top + w.height * .85);
        if (y < 0 || y >= innerHeight) continue;
        for (const [frame, edge, dir] of [[v.left, b.left, -1], [v.right, b.right, 1]]) {
          if (w.left >= Math.min(frame, edge) - 5 || w.right <= Math.max(frame, edge) + 5) continue;
          const inside = [Math.round(frame - dir * 4), y], outside = [];
          for (let d = 4; d < Math.abs(frame - edge) - 3; d++) outside.push([Math.round(frame + dir * d), y]);
          return { inside, outside, frame, edge };
        }
      }
    }
    return null;
  })()`);
  assert(geometry, `${label}: terminal must cross the frame and outer edge`);
  const png = await capture();
  const pixels = await evaluate(`(async () => {
    const image = new Image(); image.src = 'data:image/png;base64,' + ${JSON.stringify(png)}; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return ${JSON.stringify([geometry.inside, ...geometry.outside])}.map(([x,y]) => [...ctx.getImageData(x,y,1,1).data].slice(0,3));
  })()`);
  const [inside, ...outside] = pixels;
  const step = Math.max(...inside.map((c, i) => Math.abs(c - outside[0][i])));
  const hex = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
  const result = { label, inside: hex(inside), frameOutside: hex(outside[0]), edge: hex(outside.at(-1)), step, geometry, pixels };
  console.log(`PIXELS: ${JSON.stringify(result)}`);
  assert(step <= 4, `${label}: frame step ${step} exceeds 4 RGB levels`);
  assert(outside.every(rgb => rgb.every((c, i) => c <= inside[i] + 4)), `${label}: terminal must not wash toward tray grey`);
  assert(outside.every((rgb, n) => n === 0 || rgb.every((c, i) => c <= outside[n - 1][i] + 1)), `${label}: outward dim must be monotonic (1 RGB level rounding tolerance)`);
  assert(Math.max(...outside[0]) - Math.max(...outside.at(-1)) >= 3, `${label}: outward dim must be visible`);
  console.log(`PASS: ${label}: terminal material, frame step <=4 and monotonic outward dim`);
  return result;
}
export async function readBezel(evaluate,capture) {
  const sample=await evaluate(`(()=>{const [s,d]=document.querySelectorAll('.ls [data-row=send] .band'),a=s.getBoundingClientRect(),b=d.getBoundingClientRect();return {points:[[a.left-6,a.top+a.height/2],[a.left-1,a.top+a.height/2],[b.left+3,b.top+b.height/2],[b.left,b.top+b.height/2]].map(p=>p.map(Math.round)),rim:parseFloat(getComputedStyle(d,'::before').outlineWidth)}})()`);
  const png=await capture();
  const pixels=await evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,'+${JSON.stringify(png)};await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ${JSON.stringify(sample.points)}.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data].slice(0,3))})()`);
  const lum=rgb=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  return {page:pixels[0],outline:pixels[1],bezel:pixels[2],rim:pixels[3],outlineRatio:ratio(pixels[1],pixels[0]),bezelRatio:ratio(pixels[2],pixels[0]),rimRatio:ratio(pixels[3],pixels[0]),rimWidth:sample.rim};
}
export async function sendBandHash(evaluate,capture) {
  const r=await evaluate("(()=>{const r=document.querySelector('.ls .display').getBoundingClientRect();return [Math.round(r.left)-2,Math.round(r.top)-2,Math.round(r.width)+4,Math.round(r.height)+4]})()");
  const png=await capture();
  return evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,'+${JSON.stringify(png)};await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const bytes=ctx.getImageData(...${JSON.stringify(r)}).data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
}
export async function checkLightBezel(evaluate,capture) {
  const actual=await sendBandHash(evaluate,capture);
  await evaluate(`(()=>{const s=document.createElement('style');s.id='old-light-bezel';s.textContent=':root .ls .display::before{border-color:var(--term);outline:none}';document.head.append(s);return true})()`);
  const original=await sendBandHash(evaluate,capture);
  await evaluate("(document.getElementById('old-light-bezel').remove(),true)");
  assert.equal(actual,original,'Light send pixels must match the original bezel policy');
  return actual;
}
