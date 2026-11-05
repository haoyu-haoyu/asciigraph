// Where the photo is sky: the part whose clouds drift instead of being water
// or land. Read once from the still photo on the mask grid (masks.js).
//
// The two mistakes cost differently here too: sky read as water or land only
// keeps the motion it had before, but sea, sand or foam read as sky drifts
// sideways like a cloud, which looks broken. So:
//   - a sky hangs from the top edge: most of the top row must look like one
//     (a photo looking straight down at a beach has foam, sea or sand there);
//   - sky colours are smooth: clear sky is the smoothest thing in a photo
//     (lacy foam and a textured sea are many times busier); clouds may be a
//     little busier, but are white to grey. Blue starts at sky blue: the
//     cyan of shallow water isn't one;
//   - it is flooded down from the top through those colours, stopped where
//     it would get much darker in one step (a skyline, a ridge, the treeline
//     over a lake; a cloud is brighter than the sky, so it never stops it);
//   - and never below a horizon: a row where the brightness steps the same
//     way across most of the width (an overcast sea is as grey as the sky
//     above it, but the line between them is straight and runs edge to edge);
//   - what the sky then closes in, above the horizon (a dark cloud base, a
//     bird), joins it, if it is clear of the frame's edges or sky-coloured
//     (the bright rim of a cloud the frame cuts through; a branch hanging in
//     from an edge is neither);
//   - and when the sky runs on down to the bottom edge with no horizon (a
//     photo of nothing but clouds), the grey of their shaded undersides does too.
// Known misses: a sunset's orange band (warm and smooth, like sand: it stays
// with what is below it); a white or pale building, or snow, against a pale
// sky with no horizon line between them. sky=show tints what it reads as sky;
// sky=off undoes it.
import { LONG, smooth, blur, flood, maskTexture } from './masks.js';

const MIN_SKY = 0.04;    // less than this is a corner of sky, not worth a motion of its own
const MIN_TOP = 0.5;     // share of the top row that must look like sky
const EDGE = 0.25;       // darkening between neighbouring cells that the sky can't cross
const HORIZON = 0.6;     // share of the width whose brightness steps the same way on a horizon row

export function skyMask(grid) {
  const { w, h, n, hsvs, busy } = grid;
  const v = (i) => hsvs[i * 3 + 2];
  // how much a cell looks like sky: clear (strict), cloud (white to grey,
  // looser texture), or like (either, or blue with a cloud's texture: a
  // cloud's edge against the blue. A calm blue sea under a sky with no
  // horizon line can pass for that too, and drift like cloud: sky=off)
  const clear = new Float32Array(n), cloud = new Float32Array(n), like = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hu = hsvs[i * 3], s = hsvs[i * 3 + 1], b = busy[i];
    const light = smooth(0.4, 0.5, v(i));
    const blue = smooth(185, 195, hu) * (1 - smooth(255, 265, hu)) * smooth(0.06, 0.12, s);
    const pale = 1 - smooth(0.2, 0.3, s);
    clear[i] = light * Math.max(blue, pale) * (1 - smooth(0.012, 0.025, b));
    const loose = light * (1 - smooth(0.04, 0.06, b));
    cloud[i] = loose * pale * smooth(0.45, 0.55, v(i));
    like[i] = Math.max(clear[i], cloud[i], loose * blue);
  }
  let top = 0;
  // (a textured blue there is more likely a sea filling the frame)
  for (let x = 0; x < w; x++) top += clear[x] > 0.5 || cloud[x] > 0.5 ? 1 : 0;
  if (top < MIN_TOP * w) return null;

  // the horizon: the first row, going down, where most columns step the same
  // way in brightness between the cells just above and below it
  let hzRow = h, found = false;   // none found: no row is off limits
  for (let y = 2; y < h - 2; y++) {
    let dn = 0, up = 0;
    for (let x = 0; x < w; x++) {
      const d = v((y - 1) * w + x) - v((y + 1) * w + x);
      if (d > 0.06) dn++; else if (d < -0.06) up++;
    }
    if (Math.max(dn, up) >= HORIZON * w) { hzRow = y; found = true; break; }
  }
  const row = (i) => Math.floor(i / w);
  const reached = flood((i) => i < w && like[i] > 0.5,
    (j, i) => like[j] > 0.5 && v(i) - v(j) < EDGE && row(j) < hzRow, w, h);
  // close the holes: not-sky the sky surrounds, above the horizon and off the frame's edges
  const sky = Float32Array.from(reached), seen = new Uint8Array(n), queue = new Int32Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (sky[s0] || seen[s0]) continue;
    let head = 0, tail = 0, open = false, edge = false, skyish = 0;
    seen[s0] = 1; queue[tail++] = s0;
    while (head < tail) {
      const i = queue[head++], x = i % w;
      if (i >= n - w || row(i) >= hzRow) open = true;
      if (x === 0 || x === w - 1 || i < w) edge = true;
      const hu = hsvs[i * 3];
      if ((hsvs[i * 3 + 1] < 0.3 || (hu >= 185 && hu < 265)) && v(i) >= 0.45) skyish++;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] || sky[j]) continue;
        seen[j] = 1; queue[tail++] = j;
      }
    }
    if (!open && (!edge || skyish >= 0.7 * tail)) for (let q = 0; q < tail; q++) sky[queue[q]] = 1;
  }
  // sky down to the bottom edge, with no horizon: all sky, shaded clouds too
  let bottom = 0;
  for (let x = 0; x < w; x++) bottom += sky[n - w + x];
  if (!found && bottom >= 0.5 * w) {
    const grey = (i) => hsvs[i * 3 + 1] < 0.3 || (hsvs[i * 3] >= 185 && hsvs[i * 3] < 265);
    const more = flood((i) => sky[i] > 0.5, (j) => v(j) >= 0.25 && grey(j), w, h);
    for (let i = 0; i < n; i++) sky[i] = Math.max(sky[i], more[i]);
  }
  // how much of the sky's lower edge runs into blue that isn't sky: with no
  // straight horizon, that is glass, or far blue hills, not a sea (main.js)
  let rim = 0, blueRim = 0;
  for (let i = 0; i < n - w; i++) {
    if (!sky[i] || sky[i + w]) continue;
    rim++;
    const hu = hsvs[(i + w) * 3], s = hsvs[(i + w) * 3 + 1];
    if (hu >= 160 && hu < 255 && s >= 0.15) blueRim++;
  }
  let share = 0;
  for (let i = 0; i < n; i++) share += sky[i];
  share /= n;
  if (share < MIN_SKY) return null;

  // a soft edge one cell wide: drifting clouds and the photo below cross-fade
  const soft = blur(blur(sky, w, h, 1), w, h, 1).map((x) => smooth(0.3, 0.7, x));
  // below the horizon the water calms: far-off waves are small and slow, and
  // the swell's push would smear the sea into the sky right above it
  const r = Math.max(1, Math.round(0.03 * LONG));
  const calm = blur(blur(sky, w, h, r), w, h, r).map((x) => 1 - smooth(0.05, 0.45, x));
  // the horizon (y up, 0–1): the median of the sky's lowest cell per column
  const lows = [];
  for (let x = 0; x < w; x++) {
    let low = -1;
    for (let y = 0; y < h; y++) if (sky[y * w + x] > 0.5) low = y;
    if (low >= 0) lows.push(low);
  }
  lows.sort((a, b) => a - b);
  const horizon = 1 - (lows[lows.length >> 1] + 1) / h;
  // sky at photo position (u, v), both 0–1, v down
  const at = (u, v) => soft[Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))];
  // a sea horizon: that straight line, with the sky itself coming down to it
  // and blue water right under it across most of the width (over a lake the
  // line is the far shore and the sky ends higher, at the hills behind it; a
  // flat treeline or field has green under it, not sea)
  let meets = 0, blueUnder = 0;
  if (found) for (let x = 0; x < w; x++) {
    for (let y = Math.max(0, hzRow - 3); y < hzRow; y++) if (sky[y * w + x] > 0.5) { meets++; break; }
    // (from two rows down: the row right under the line still blends in sky)
    for (let y = hzRow + 2; y < Math.min(h, hzRow + 5); y++) {
      const i = y * w + x, hu = hsvs[i * 3];
      if (sky[i] < 0.5 && hu >= 160 && hu < 260 && hsvs[i * 3 + 1] >= 0.15) { blueUnder++; break; }
    }
  }
  const seaHorizon = meets >= HORIZON * w && blueUnder >= HORIZON * w;
  // a sea under this sky: it has a sea horizon, or the sky doesn't run into blue
  const seaBelow = seaHorizon || blueRim < 0.3 * rim;
  // (the sea horizon's own height, y up, for the water's perspective)
  return { sky: soft, at, tex: maskTexture(w, h, soft, calm), share, horizon, seaBelow, seaHorizon, seaLine: seaHorizon ? 1 - (hzRow + 0.5) / h : null };
}
