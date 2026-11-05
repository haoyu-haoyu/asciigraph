// What the region masks (shore.js, sky.js) share: the photo read once at a
// coarse grid, its colours as HSV, and how busy (textured) each cell is.
import * as THREE from 'three';

export const LONG = 160;     // mask resolution along the long side
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, mx > 0 ? d / mx : 0, mx];
}

// separable box blur of radius r, edges clamped
export function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = s / n;
  }
  return out;
}

// luma at f× the mask's resolution: its local contrast, pooled back down,
// sees foam as lace where the mask's own pixels would average it smooth
function busyness(img, w, h, f) {
  const W = w * f, H = h * f;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, l = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) l[i] = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255;
  const m1 = blur(l, W, H, 2), m2 = blur(l.map((v) => v * v), W, H, 2), out = new Float32Array(w * h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    out[Math.floor(y / f) * w + Math.floor(x / f)] += Math.sqrt(Math.max(0, m2[i] - m1[i] * m1[i])) / (f * f);
  }
  return out;
}

// The photo on the mask grid (rows top-down): size, HSV per cell (h in
// degrees, s and v 0–1) and busyness.
export function readGrid(img) {
  const aspect = img.width / img.height;
  const w = Math.max(1, aspect >= 1 ? LONG : Math.round(LONG * aspect)), h = Math.max(1, aspect >= 1 ? Math.round(LONG / aspect) : LONG), n = w * h;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data, hsvs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) hsvs.set(hsv(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255), i * 3);
  return { w, h, n, hsvs, busy: busyness(img, w, h, 2) };
}

// 4-neighbour flood fill from every cell where seed(i), through cells where pass(i, from)
export function flood(seed, pass, w, h) {
  const n = w * h, seen = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (seed(i)) { seen[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || seen[j] || !pass(j, i)) continue;
      seen[j] = 1; queue[tail++] = j;
    }
  }
  return seen;
}

// a mask grid (rows top-down, 0–1 per channel) as a texture in photo uv;
// b is 0 unless given
export function maskTexture(w, h, r, g = r, b = null) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((h - 1 - y) * w + x) * 4;   // texture rows run bottom-up
    data[o] = Math.round(r[i] * 255); data[o + 1] = Math.round(g[i] * 255); data[o + 2] = b ? Math.round(b[i] * 255) : 0; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
