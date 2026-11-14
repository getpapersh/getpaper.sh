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
