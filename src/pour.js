// Waterfalls and steam: things that run along their own streaks (fire: below). A falling
// sheet of water is drawn as white streaks down the rock, and steam or smoke
// as soft strands curling up, so the photo itself says which line they move
// along (the structure tensor: the way the texture runs, and how clearly).
// The line has two ends, and the scene picks the end: water falls, steam
// rises. Only what reads as streaks along that way, lighter than what is
// around it and nearly colourless (white water, grey steam) moves; the rock,
// the trees and the cup stay still. Painted marks (marks.js) override that.
// The motion is the water's drift (water.js): three copies of the photo ride
// the static field a third of a cycle apart and cross-fade, many short cycles
// per loop. Drifting along the streaks, their spacing smears only along the
// streaks, where it reads as the water's own speed blur, not as ghosting.
// Below a waterfall, the water it lands in (a pool, the river it feeds) moves
// too: found by flooding out from the fall's foot through what is coloured
// like water and not like rock, it drifts away from the foot, rings of
// ripples spread out from it, and its surface churns a little.
// Fire is found by its colour (bright, flame-coloured, lighter than around
// it) rather than its streaks, and moves its own way (FIRE): the photo's
// flame at its base, drawn new higher up. The room it lights brightens and
// dims with it.
// Same interface as buildWater.
import * as THREE from 'three';
import { QUAD_VS } from './field.js';
import { blur, hsv, smooth, maskTexture } from './masks.js';
import { marksOnGrid } from './marks.js';

const LONG = 320;   // field resolution along the long side

// How each scene reads and moves: which way along the streaks (y up); how
// far a streak may lean from that and still count; how strong its texture
// is, as a share of the photo's strongest (edge: from that much on it fades
// out again: steam is faint, and the strong edges near it are the cup's,
// even where a highlight on it runs up like a wisp); how much lighter than
// around it, and how light at least; how colourless (the saturation where it
// stops counting: thin steam takes the colour of what is behind it, so it
// may be quite tinted); speed (frame heights per second); drift cycles per
// loop at the default 12 s; how much the strands billow sideways;
// carry: how much of the moving water each row passes on along its way
// into what is light and colourless enough to be the same stuff (a fall's
// streaks blur into mist near its foot, and that falls too)
const KINDS = {
  waterfall: { way: -1, lean: [0.55, 0.8], energy: [0.02, 0.12], edge: null, lift: 0.08, floor: [0.12, 0.3], grey: [0.25, 0.5], carry: 0.93, speed: 0.16, cycles: 36, billow: 0.0012, pool: true },
  steam: { way: 1, lean: [0.2, 0.5], energy: [0.002, 0.015], edge: [0.06, 0.12], lift: 0.04, floor: [0.05, 0.12], grey: [0.4, 0.6], carry: 0.9, speed: 0.035, cycles: 12, billow: 0.006, pool: false },
  // fire is found by its colour, not its streaks (fireFound), and moves its
  // own way (FIRE), not by the drift
  fire: { way: 1, lean: [0.2, 0.5], lift: 0.06, carry: 0.9, pool: false, fire: true, minBody: 0.0004 },
};
// Fire, as real flames move: the base holds still at the fuel and the
// flame moves more the higher up it is; tongues lick up, stretch and break
// off at the tips; the whole fire swells and shrinks ("puffs") about once a
// second, and its brightness wavers more slowly than that. (Measured, a
// fire half a metre across puffs nearer 1.6 times a second, f ≈ 1.68/√D,
// but at that pace a looping still read as too fast.) A narrow, tall
// flame (a candle) is calm: it only sways and rises gently; a wide one
// (a campfire, a hearth) is turbulent. Per value: [calm, turbulent].
//   rise: how fast the tongues rise (flame heights per second)
//   warp: how far the tips sway sideways and stretch up (flame heights)
//   lick: how much the tips come and go; flicker: brightness ±
//   carve: how deep the rising tongues cut the flame's heat; synth: how
//   much of the upper flame is drawn new (in its own colours) rather than
//   read from the photo
//   tongue: tongue size (flame heights)
// glow: how much the room around it brightens and dims with it, as far as
// its light reaches (reach, frame heights); puffs, wavers: per second
const FIRE = {
  rise: [0.25, 0.5], carve: [0.35, 0.9], synth: [0.35, 0.85], warpX: [0.025, 0.075], warpY: [0.03, 0.11], lick: [0.15, 0.7], flicker: [0.1, 0.18], tongue: [0.4, 0.25],
  glow: 0.3, reach: 0.25, puffs: 1, wavers: 0.5,
};
// the water below a fall: how fast it drifts away from the foot near it
// (frame heights per second; it slows to 40% far off), how far the ripples'
// rings sit apart (frame heights) and how fast they spread
const POOL = { speed: 0.035, ring: 0.045, spread: 0.022 };
const MIN_BODY = 0.004;   // a moving patch smaller than this share of the frame is a speck

// The field, on a grid LONG cells on the long side (rows top-down): where
// things move (0–1) and which way (unit, y up), the moving share, and the
// grid itself (for the marks).
export function pourField(img, kind, marksImg = null) {
  const K = KINDS[kind];
  const aspect = img.width / img.height;
  const w = aspect >= 1 ? LONG : Math.max(2, Math.round(LONG * aspect)), h = aspect >= 1 ? Math.max(2, Math.round(LONG / aspect)) : LONG, n = w * h;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const L = new Float32Array(n), S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [, s, v] = hsv(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255);
    L[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    S[i] = v > 0.04 ? s : 0;
  }
  // structure tensor over a neighbourhood ~1.2% of the frame (two box passes)
  const jxx = new Float32Array(n), jxy = new Float32Array(n), jyy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = (L[i + 1] - L[i - 1]) * 0.5, gy = (L[i + w] - L[i - w]) * 0.5;
    jxx[i] = gx * gx; jxy[i] = gx * gy; jyy[i] = gy * gy;
  }
  const r = Math.max(1, Math.round(LONG * 0.008));
  const tens = (a) => blur(blur(a, w, h, r), w, h, r);
  const Jxx = tens(jxx), Jxy = tens(jxy), Jyy = tens(jyy);
  // brighter than the surroundings: white water on dark rock, steam on a dark room
  const around = blur(blur(L, w, h, Math.round(LONG * 0.05)), w, h, Math.round(LONG * 0.05));
  const tr = Jxx.map((v, i) => v + Jyy[i]);
  const trTop = Float32Array.from(tr).sort()[Math.floor(n * 0.99)] + 1e-9;
  const move = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n), lift = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = tr[i] + 1e-9, dxx = Jxx[i] - Jyy[i], coh = Math.hypot(dxx, 2 * Jxy[i]) / t;
    // streaks run square to the gradient: the doubled angle, negated, halved
    const a = 0.5 * Math.atan2(-2 * Jxy[i], -dxx);
    let ax = Math.cos(a), ay = -Math.sin(a);   // (grid rows run down; y up from here)
    if (ay * K.way < 0) { ax = -ax; ay = -ay; }
    const lean = smooth(K.lean[0], K.lean[1], Math.abs(ay));
    lift[i] = smooth(0.0, K.lift, L[i] - around[i]);
    if (K.fire) move[i] = fireFound(px, i, L[i] - around[i]);
    else {
      const e = t / trTop;
      const streaky = smooth(0.15, 0.45, coh) * smooth(K.energy[0], K.energy[1], e) * (K.edge ? 1 - smooth(K.edge[0], K.edge[1], e) : 1);
      const light = lift[i] * smooth(K.floor[0], K.floor[1], L[i]);
      move[i] = lean * streaky * light * (1 - smooth(K.grey[0], K.grey[1], S[i]));
    }
    // the way to go, weighted by how sure it is, to be smoothed below (only
    // streaks along the way vote: tilted rock strata beside a fall don't pull it)
    vx[i] = ax * coh * lean; vy[i] = ay * coh * lean;
  }
  // a waterfall is one body of water: fill the gaps between its streaks and
  // drop specks (a lit leaf that happens to be streaky)
  let m = blur(move, w, h, Math.max(1, Math.round(LONG * 0.012)));
  m = m.map((v) => smooth(0.12, 0.35, v));
  // (fire: its shape is measured before the tongues are carried up)
  let core = K.fire ? Float32Array.from(m) : null, raw = K.fire ? Float32Array.from(move) : null;
  // carried on, row by row (down a column: falls and plumes are near enough
  // upright), into what looks the same: as light, as colourless, and still
  // lighter than around it, so the pale rock or the pool below doesn't fall
  const down = K.way < 0;
  for (let k = 1; k < h; k++) {
    const y = down ? k : h - 1 - k, from = down ? y - 1 : y + 1;
    for (let x = 0; x < w; x++) {
      // (flames lick up past their top into whatever is there, fading fast)
      const i = y * w + x, gate = K.fire ? 1 : smooth(K.floor[0], K.floor[1] + 0.1, L[i]) * (1 - smooth(K.grey[0], K.grey[1], S[i])) * lift[i];
      m[i] = Math.max(m[i], m[from * w + x] * K.carry * gate);
    }
  }
  m = dropSpecks(m, w, h, K.minBody ?? MIN_BODY);
  const pool = K.pool ? poolBelow(m, L, px, w, h) : { at: new Float32Array(n), dist: new Float32Array(n), wx: new Float32Array(n), wy: new Float32Array(n), top: h };
  if (marksImg) {
    // green above the fall's foot is more of the fall; below it, more of the
    // pool (it drifts out at the pool's pace, its rings starting there)
    const mk = marksOnGrid(marksImg, { w, h, n });
    const below = (i) => K.pool && ((i / w) | 0) > pool.top;
    m = m.map((v, i) => Math.max(v, below(i) ? 0 : mk.move[i]) * (1 - mk.still[i]));
    if (core) core = core.map((v, i) => Math.max(v, mk.move[i]) * (1 - mk.still[i]));
    if (raw) raw = raw.map((v, i) => Math.max(v, mk.move[i]) * (1 - mk.still[i]));
    pool.at = pool.at.map((v, i) => Math.max(v, below(i) ? mk.move[i] * (1 - m[i]) : 0) * (1 - mk.still[i]));
  }
  // the way, smoothed widely so the copies drift as one sheet, and carried
  // past the edge of what moves so it doesn't turn where the mask ends; the
  // scene's own way fills in where the streaks don't say
  const R = Math.round(LONG * 0.03);
  const sx = blur(blur(vx.map((v, i) => v * (0.2 + m[i])), w, h, R), w, h, R);
  const sy = blur(blur(vy.map((v, i) => v * (0.2 + m[i])), w, h, R), w, h, R);
  const fx = new Float32Array(n), fy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // the fall's way, and in the pool the way out from the foot
    const p = pool.at[i] * (1 - m[i]);
    const bx = mixN(sx[i], pool.wx[i], p), by = mixN(sy[i] + 0.08 * K.way, pool.wy[i], p), l = Math.hypot(bx, by) || 1;
    fx[i] = bx / l; fy[i] = by / l;
  }
  const share = m.reduce((s, v) => s + v, 0) / n, poolShare = pool.at.reduce((s, v) => s + v, 0) / n;
  return { w, h, n, move: m, pool: pool.at, dist: pool.dist, fx, fy, share, poolShare, ...(K.fire ? { ...fireShape(core, raw, m, w, h), ...firePalette(move.filter((v) => v > 0.5).length >= 20 ? move : core, L, px) } : { glow: new Float32Array(n), up: new Float32Array(n), tall: 0, turb: 0 }) };
}

const mixN = (a, b, t) => a + (b - a) * t;

// A flame, by colour: bright, warm (red through yellow; its white-hot core
// counts when it is very bright), and lighter than around it, so the stone
// or wood the fire lights, warm but dimmer, stays out.
function fireFound(px, i, lift) {
  const [hue, s, v] = hsv(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255);
  const warm = Math.max(1 - smooth(55, 72, hue), smooth(340, 352, hue));
  const core = smooth(0.9, 0.97, v);
  const coloured = Math.max(smooth(0.2, 0.35, s) * warm, core * (s < 0.35 || warm > 0.5 ? 1 : 0));
  return coloured * smooth(0.78, 0.92, v) * smooth(0.08, 0.2, lift);
}

// The fire's shape (measured on the flame as found, not the tongues carried
// up past it): how tall it stands (frame heights: most columns with flame in
// them span less), how turbulent it is (0 a narrow candle flame, 1
// a wide fire), how far up the flame each cell is (0 at its base, 1 at its
// tip), and how much of its light falls on each cell around it (0–1,
// falling off out to FIRE.reach, none on the flame itself).
function fireShape(core, raw, m, w, h) {
  const n = w * h, bot = new Int32Array(w).fill(-1), span = [];
  for (let x = 0; x < w; x++) {
    let t = -1, b = -1;
    for (let y = 0; y < h; y++) {
      if (core[y * w + x] > 0.3) bot[x] = y;
      // (its size from the flame's own colour, unsmoothed: smoothing widens a
      // thin candle flame into a squat one; but only inside the smoothed mask,
      // so a stray warm glint far above doesn't stretch the column)
      if (raw[y * w + x] > 0.5 && core[y * w + x] > 0.3) { if (t < 0) t = y; b = y; }
    }
    if (t >= 0) span.push(b - t + 1);
  }
  span.sort((a, b) => a - b);
  const tall = span.length ? span[Math.floor(span.length * 0.9)] / h : 0;
  const turb = smooth(0.25, 0.8, span.length / h / Math.max(tall, 0.02));
  // a tongue beside the body stands on the body's base, not its own
  const k = Math.max(1, Math.round(w * 0.03)), base = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let d = -k; d <= k; d++) base[x] = Math.max(base[x], bot[Math.min(w - 1, Math.max(0, x + d))]);
  const height = new Float32Array(n), rows = Math.max(1, tall * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (base[x] >= 0) height[y * w + x] = Math.min(1, Math.max(0, (base[x] - y) / rows));
  const up = blur(height, w, h, 2);
  const r = Math.max(2, Math.round(h * FIRE.reach * 0.35));
  const wide = blur(blur(blur(m, w, h, r), w, h, r), w, h, r);
  const top = wide.reduce((a, v) => (v > a ? v : a), 0) || 1;
  return { glow: wide.map((v, i) => Math.sqrt(v / top) * (1 - m[i])), up, tall, turb };
}

// The water a fall lands in. Its foot: falling cells with none below. From
// there, flood through cells coloured like the water just below the foot
// (light, colourless, not moss) and no darker than a step allows (rocks in
// it are darker and stop the flood), never above the foot. Returns, per
// cell: how much is pool (0–1), how far from the foot through the water
// (frame heights), and the way out from the foot (unit, y up).
function poolBelow(m, L, px, w, h) {
  const n = w * h, at = new Float32Array(n), dist = new Float32Array(n).fill(-1), wx = new Float32Array(n), wy = new Float32Array(n);
  const foot = new Float32Array(n);
  let top = h;
  for (let y = 0; y < h - 2; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i] > 0.5 && m[i + 2 * w] < 0.3) { foot[i] = 1; top = Math.min(top, y); }
  }
  if (top === h) return { at, dist: dist.fill(0), wx, wy, top };
  const sat = (i) => { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], mx = Math.max(r, g, b); return mx > 10 ? (mx - Math.min(r, g, b)) / mx : 0; };
  const mossy = (i) => { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; return sat(i) > 0.18 && g > r * 1.05 && g > b * 1.05; };
  // the water's own lightness: the colourless cells a little below the feet
  const ref = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!foot[i]) continue;
    for (let k = 4; k < 14 && y + k < h; k++) { const j = i + k * w; if (m[j] < 0.3 && sat(j) < 0.3 && !mossy(j)) ref.push(L[j]); }
  }
  if (ref.length < 4) return { at, dist: dist.fill(0), wx, wy, top };
  ref.sort((a, b) => a - b);
  const lw = ref[ref.length >> 1];
  const water = (i) => m[i] < 0.5 && sat(i) < 0.32 && !mossy(i) && L[i] > lw - 0.14;
  // breadth-first from the feet, so dist is the way through the water
  // (each cell remembers the row of the foot it was reached from, and the
  // flood never climbs above that: a short streak's foot high up doesn't
  // let the main pool creep up the pale rock beside the fall)
  const queue = new Int32Array(n), from = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (foot[i]) { dist[i] = 0; from[i] = (i / w) | 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || dist[j] >= 0 || ((j / w) | 0) < from[i] - 2 || !water(j) || L[j] < L[i] - 0.12 && !foot[i]) continue;
      dist[j] = dist[i] + 1; from[j] = from[i]; queue[tail++] = j;
    }
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) if (dist[i] > 0) raw[i] = 1;
  // soft edges, and specks of "water" cut off among the rocks left out
  const soft = blur(raw, w, h, 1);
  for (let i = 0; i < n; i++) { at[i] = raw[i] ? smooth(0.3, 0.7, soft[i]) : 0; dist[i] = Math.max(0, dist[i]) / h; }
  // the way out: down the slope of the feet, spread wide (y up)
  const big = Math.round(Math.max(w, h) * 0.08);
  const near = blur(blur(foot, w, h, big), w, h, big), nmax = near.reduce((a, v) => (v > a ? v : a), 0) || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const gx = near[y * w + Math.min(w - 1, x + 1)] - near[y * w + Math.max(0, x - 1)];
    const gy = near[Math.min(h - 1, y + 1) * w + x] - near[Math.max(0, y - 1) * w + x];
    const l = Math.hypot(gx, gy);
    // away from the feet; where the slope fades (far off), toward the camera
    const ox = l > 1e-7 ? -gx / l : 0, oy = l > 1e-7 ? gy / l : -1;
    const k = smooth(0, 0.3, (l * big) / nmax);
    const ux = ox * k, uy = oy * k - (1 - k), ul = Math.hypot(ux, uy) || 1;
    wx[i] = ux / ul; wy[i] = uy / ul;
  }
  return { at, dist, wx, wy, top };
}

// The fire's own colours, dim to bright: the cells that are clearly flame
// (as found, before any smoothing: a cell on its edge, half flame and half
// the night behind it, would bring in a muddy green; a flame found only
// because it was painted green takes its painted cells instead) binned by
// lightness (lo–hi: from its dimmest twentieth to nearly its brightest),
// as a 32-wide strip; empty bins take the nearest filled one.
function firePalette(flame, L, px) {
  const ls = [];
  for (let i = 0; i < flame.length; i++) if (flame[i] > 0.5) ls.push(L[i]);
  ls.sort((a, b) => a - b);
  // (no flame at all: any range will do, nothing is drawn)
  const lo = ls.length ? ls[Math.floor(ls.length * 0.05)] : 0.5, hi = ls.length ? Math.max(lo + 0.05, ls[Math.floor(ls.length * 0.995)]) : 1;
  const B = 32, sum = new Float32Array(B * 3), cnt = new Float32Array(B);
  for (let i = 0; i < flame.length; i++) {
    if (flame[i] <= 0.5) continue;
    const b = Math.min(B - 1, Math.max(0, Math.floor(((L[i] - lo) / (hi - lo)) * B)));
    for (let c = 0; c < 3; c++) sum[b * 3 + c] += px[i * 4 + c];
    cnt[b]++;
  }
  const pal = new Uint8Array(B * 4);
  for (let b = 0; b < B; b++) {
    let k = b;
    for (let d = 1; !cnt[k] && d < B; d++) k = cnt[b - d] ? b - d : cnt[b + d] ? b + d : k;
    for (let c = 0; c < 3; c++) pal[b * 4 + c] = cnt[k] ? Math.round(sum[k * 3 + c] / cnt[k]) : 255 * (c === 0 ? 1 : c === 1 ? 0.6 : 0.2);
    pal[b * 4 + 3] = 255;
  }
  return { pal, palLo: lo, palHi: hi };
}

// keeps only the moving patches of at least that share of the frame, with
// their soft edges
function dropSpecks(m, w, h, min) {
  const n = w * h, seen = new Int32Array(n).fill(-1), keep = new Float32Array(n), stack = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] >= 0 || m[s] < 0.3) continue;
    const cells = [];
    seen[s] = s; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w;
      cells.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] >= 0 || m[j] < 0.3) continue;
        seen[j] = s; stack.push(j);
      }
    }
    if (cells.length >= min * n) for (const i of cells) keep[i] = 1;
  }
  const near = blur(keep, w, h, 3);
  return m.map((v, i) => v * smooth(0.0, 0.15, near[i]));
}

// the field as a texture in photo uv: r what falls (or rises), g the pool
// below it, ba the way (0.5 + 0.5·v)
function fieldTexture(f) {
  const { w, h } = f, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((h - 1 - y) * w + x) * 4;
    data[o] = Math.round(f.move[i] * 255); data[o + 1] = Math.round(f.pool[i] * 255);
    data[o + 2] = Math.round((0.5 + 0.5 * f.fx[i]) * 255); data[o + 3] = Math.round((0.5 + 0.5 * f.fy[i]) * 255);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const POUR_COMMON = /* glsl */`
  uniform sampler2D tImg, tMap, tFlow;   // tFlow r: what falls, g: the pool below, ba: which way
  uniform sampler2D tDist;               // r: how far from the fall's foot through the pool (÷ uDistMax); g: fire's light on what's around it; b: how far up the flame
  uniform vec2 uRes;
  uniform float uT, uDrift, uCycles, uBillow, uSways, uShow;
  // the pool: drift per cycle near the foot, ripple rings (spacing in frame
  // heights, whole rings per loop), churn
  uniform float uPoolDrift, uRing, uRings, uChurn, uChurnCycles, uDistMax;
  // fire (FIRE): on, how turbulent, flicker and glow strength, sway and
  // stretch, how much the tips come and go, tongue size and rise per cycle
  // (frame heights), and per loop: rise cycles, puffs, wavers
  uniform float uFire, uTurb, uFlicker, uGlow, uLick, uTongue, uRise, uRiseCycles, uPuffs, uFlickers;
  uniform vec2 uWarp;
  // fire's own colours dim to bright (tPal) over the lightness uPalLo–uPalHi;
  // how far its heat is carved by the flame noise, and how much of the flame
  // is drawn new rather than read from the photo
  uniform sampler2D tPal;
  uniform float uPalLo, uPalHi, uCarve, uSynth;
  varying vec2 vUv;
  const float TAU = 6.28318530718;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
  vec2 isoOf(vec2 uv) { return vec2(uv.x * uRes.x / uRes.y, uv.y); }
  vec2 uvOfIso(vec2 d) { return vec2(d.x * uRes.y / uRes.x, d.y); }
  vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  vec2 wayAt(vec2 uv) { vec2 v = texture(tFlow, uv).ba * 2.0 - 1.0; return v / max(length(v), 1e-3); }
  float movesAt(vec2 uv) { vec4 f = texture(tFlow, uv); return max(f.r, f.g); }
  // how much of what moves here is pool rather than fall
  float poolPart(vec2 uv) { vec4 f = texture(tFlow, uv); return f.g * (1.0 - f.r) / max(max(f.r, f.g), 1e-3); }
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), u.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y), u.z);
  }
  // loop-periodic noise and the swirl it makes, as in water.js (tfbm, curl)
  float tfbm(vec2 p, float cyc) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), th = TAU * uT * cyc * (fi + 1.0);
      vec2 dir = vec2(cos(fi * 2.1), sin(fi * 2.1));
      s += a * noise3(vec3(p + dir * 0.7 * cos(th), 0.7 * sin(th) + fi * 17.0));
      p = p * 2.07 + 3.1; a *= 0.5;
    }
    return s / 0.875;
  }
  vec2 curl(vec2 p, float cyc) {
    const float e = 0.05;
    float c = tfbm(p, cyc);
    return vec2(tfbm(p + vec2(0.0, e), cyc) - c, -(tfbm(p + vec2(e, 0.0), cyc) - c)) / e;
  }
  // the pool's ripples: rings spreading out from the foot (phase), fading
  // with distance (fade)
  float ringPhase(vec2 uv, out float fade) {
    float d = texture(tDist, uv).r * uDistMax;
    fade = exp(-d / 0.3) * smoothstep(0.0, 0.02, d);
    return TAU * (d / uRing - uRings * uT);
  }

  // The three drift copies (offsets in uv, weights summing to 1), as in
  // water.js. Each streak runs at its own pace (noise across the way), and
  // the strands billow sideways a little, whole cycles per loop. In the pool
  // the copies drift slower, slowing farther from the foot, the ripples push
  // the surface back and forth along the way, and it churns. Returns how far
  // apart the copies sit (frame heights), for the contrast lift.
  float phases(vec2 uv, out vec2 o0, out vec2 o1, out vec2 o2, out vec3 w) {
    vec2 f = wayAt(uv), q = isoOf(uv), side = vec2(-f.y, f.x);
    float pace = 0.65 + 0.7 * fbm(vec2(dot(q, side) * 14.0, dot(q, f) * 1.5) + 7.0);
    float pp = poolPart(uv), fade = 0.0, ph = 0.0;
    if (pp > 0.0) ph = ringPhase(uv, fade);
    float run = mix(uDrift * pace, uPoolDrift * (0.4 + 0.6 * fade) * (0.8 + 0.4 * fbm(q * 3.0 + 2.0)), pp);
    float jit = fbm(q * 1.3 + 27.0) * 1.5;
    vec3 p = fract(uT * uCycles + jit + vec3(0.0, 1.0, 2.0) / 3.0);
    vec2 sway = side * uBillow * sin(TAU * (uSways * uT + dot(q, f) * 3.0 + fbm(q * 4.0) * 2.0)) * (1.0 - pp);
    vec2 ring = vec2(0.0), churn = vec2(0.0);
    if (pp > 0.0) {
      ring = f * 0.0016 * fade * sin(ph) * pp;
      churn = (curl(q * 9.0, uChurnCycles) * 0.0012 + curl(q * 22.0 + 5.0, 2.0 * uChurnCycles) * 0.0005) * uChurn * pp;
    }
    vec2 still = uvOfIso(sway + ring + churn);
    vec2 r = uvOfIso(f) * run;
    o0 = r * (p.x - 0.5) + still; o1 = r * (p.y - 0.5) + still; o2 = r * (p.z - 0.5) + still;
    w = (1.0 - cos(TAU * p)) / 3.0;
    return run / 3.0;
  }
  // a copy read from somewhere that doesn't move (the lip of the rock above
  // the fall) would carry the rock down with it: the still photo stands in
  vec3 readAt(vec2 uv, vec2 o, vec3 here) {
    return mix(here, toLin(texture(tImg, uv - o).rgb), smoothstep(0.2, 0.7, movesAt(uv - o)));
  }
  // fire's brightness, about -1.3..1.3, whole times per loop: the whole fire
  // wavers (the same everywhere, so the room's light follows it), and each
  // tongue a little on its own on top
  float breath() { return (tfbm(vec2(3.7, 1.3), uFlickers) - 0.5) * 2.6; }
  float flare(vec2 q) { return (tfbm(q / uTongue * vec2(1.0, 0.5), uFlickers) - 0.5) * 2.6; }
  // noise rising through the flame, about -1..1: three copies a third of a
  // cycle apart, cross-faded as in the drift (their squared weights sum to
  // a half, so ×√2 keeps its strength even), tongues taller than wide
  float rising(vec2 q, float seed) {
    vec3 p = fract(uT * uRiseCycles + vec3(0.0, 1.0, 2.0) / 3.0), w = (1.0 - cos(TAU * p)) / 3.0;
    vec2 s = q / uTongue * vec2(1.0, 0.5);
    float r = uRise / uTongue * 0.5;
    float v = w.x * fbm(s - vec2(0.0, r * (p.x - 0.5)) + seed)
            + w.y * fbm(s - vec2(0.0, r * (p.y - 0.5)) + seed + 13.1)
            + w.z * fbm(s - vec2(0.0, r * (p.z - 0.5)) + seed + 27.7);
    return (v - 0.5) * 1.41 * 3.0;
  }
  // flame noise, about -1..1: thin tongues rising and curling (the noise
  // read through a sideways swirl of its own), born and gone as they rise;
  // cross-faded as rising()
  float tongue(vec2 s, float seed) { return fbm(s + vec2(0.9 * (fbm(s * 0.6 + seed + 5.0) - 0.5), 0.0) + seed); }
  float flames(vec2 q) {
    vec3 p = fract(uT * uRiseCycles + vec3(0.0, 1.0, 2.0) / 3.0), w = (1.0 - cos(TAU * p)) / 3.0;
    vec2 s = q / (uTongue * 0.6) * vec2(1.0, 0.35);
    float r = uRise / (uTongue * 0.6) * 0.35;
    float v = w.x * tongue(s - vec2(0.0, r * (p.x - 0.5)), 3.0)
            + w.y * tongue(s - vec2(0.0, r * (p.y - 0.5)), 19.0)
            + w.z * tongue(s - vec2(0.0, r * (p.z - 0.5)), 37.0);
    return (v - 0.5) * 1.41 * 3.0;
  }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float heatOf(vec3 c) { return clamp((lum(c) - uPalLo) / max(uPalHi - uPalLo, 0.02), 0.0, 1.0); }`;

const POUR_FS = /* glsl */`
  ${POUR_COMMON}
  void main() {
    vec3 still = toLin(texture(tImg, vUv).rgb);
    float m = movesAt(vUv);
    vec3 c = still;
    if (uFire > 0.0 && m > 0.004) {
      // the flame read from a little below and aside, more so higher up:
      // the base holds, the tips sway, stretch and shrink; a puff runs up
      // the flame; the tips come and go
      float up = texture(tDist, vUv).b;
      vec2 q = isoOf(vUv);
      float puff = sin(TAU * (uPuffs * uT - up * 1.3)) * uTurb;
      vec2 d = vec2(rising(q, 0.0) * uWarp.x * pow(up, 1.3), -(rising(q, 41.0) + 0.4 * puff) * uWarp.y * up);
      vec2 at = vUv + uvOfIso(d);
      vec3 f = toLin(texture(tImg, at).rgb);
      f *= mix(1.0, smoothstep(-0.3, 0.4, rising(q * 1.6, 77.0) + 0.3 * puff), uLick * up * up);
      // higher up, the flame is drawn new each moment: the photo's heat
      // there (its shape), carved by tongues rising through it, some
      // breaking off above the tips, in the photo's own flame colours; where
      // the heat drops out, what is behind it: the photo, or where it was
      // flame, the dark of the fire's dimmest red (dimming the bright flame
      // itself turns it olive)
      float hb = heatOf(textureLod(tImg, at, 2.0).rgb) * m;
      float heat = hb + uCarve * up * (0.6 * flames(q) - 0.25 + 0.2 * puff);
      // (blended as heat, the photo's and the drawn, then coloured: blending
      // the colours, a bright yellow half covered by the dark turns olive;
      // the colour runs down to the dimmest red well before the flame fades
      // out, so its edges go yellow, orange, red, dark, as a flame's do)
      float k = uSynth * smoothstep(0.1, 0.55, up);
      float hk = mix(heatOf(texture(tImg, at).rgb), heat, k);
      vec3 col = toLin(texture(tPal, vec2(smoothstep(0.3, 1.0, hk) * 31.0 / 32.0 + 0.5 / 32.0, 0.5)).rgb);
      vec3 behind = mix(still, toLin(texture(tPal, vec2(0.5 / 32.0, 0.5)).rgb) * 0.08, smoothstep(0.15, 0.5, heatOf(textureLod(tImg, vUv, 2.0).rgb) * m));
      f = mix(f, mix(behind, col, smoothstep(0.05, 0.3, hk)), k);
      f *= max(1.0 + uFlicker * (0.6 * breath() + 0.4 * flare(q)), 0.0);
      c = mix(still, f, m);
    } else if (m > 0.004) {
      vec2 o0, o1, o2; vec3 w;
      float apart = phases(vUv, o0, o1, o2, w);
      vec3 mean = toLin(textureLod(tImg, vUv, 5.0).rgb);
      vec3 mixd = readAt(vUv, o0, still) * w.x + readAt(vUv, o1, still) * w.y + readAt(vUv, o2, still) * w.z;
      // (contrast lifted by the water drift's constant, as far as the copies
      // are apart enough to soften it: none when they don't drift)
      float lift = 1.0 + 0.19 * smoothstep(0.0, 0.004, apart);
      c = max(mean + (mixd - mean) * lift, 0.0);
      // the ripples catch the light a little as they pass
      float pp = poolPart(vUv);
      if (pp > 0.0) { float fade, ph = ringPhase(vUv, fade); c *= 1.0 + 0.05 * cos(ph) * fade * pp; }
      c = mix(still, c, m);
    }
    // the room in the fire's light brightens and dims with it
    if (uGlow > 0.0) c *= max(1.0 + uGlow * texture(tDist, vUv).g * breath(), 0.0);
    // shore=show: tint what stays still
    c = mix(c, vec3(0.9, 0.08, 0.05), uShow * (1.0 - m) * 0.6);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Direction pass (doubled angle, weighted): the way it moves where it moves,
// the photo's own streaks elsewhere.
const POUR_DIR_FS = /* glsl */`
  ${POUR_COMMON}
  void main() {
    float m = movesAt(vUv);
    vec2 ts = texture(tMap, vUv).ba * 2.0 - 1.0;
    vec2 d = ts / max(length(ts), 1e-4) * clamp(length(ts) * 3.0, 0.0, 1.0);
    vec2 f = wayAt(vUv);
    d = mix(d, vec2(f.x * f.x - f.y * f.y, 2.0 * f.x * f.y), m);
    float wt = 0.6 + 0.4 * length(d);
    gl_FragColor = vec4(d * wt, wt, 1.0);
  }`;

// fire's uniforms from its shape (null: not fire). Whole puffs, wavers and
// rise cycles per loop; speed=0 holds it all, the room's light included.
function fireUniforms(f, pace, amp, loop) {
  const by = (v) => v[0] + (v[1] - v[0]) * (f ? f.turb : 0), tall = f ? Math.max(f.tall, 0.05) : 0, on = f && pace > 0;
  const times = (per) => (on ? Math.max(1, Math.round(loop * per * pace)) : 0);
  // (each tongue lives about a second)
  const riseCycles = times(1);
  return {
    uFire: { value: f ? 1 : 0 }, uTurb: { value: f ? f.turb : 0 },
    uFlicker: { value: on ? by(FIRE.flicker) * amp : 0 }, uGlow: { value: on ? FIRE.glow * amp : 0 },
    uWarp: { value: new THREE.Vector2(by(FIRE.warpX), by(FIRE.warpY)).multiplyScalar(tall * amp) },
    uLick: { value: f ? Math.min(1, by(FIRE.lick) * amp) : 0 }, uTongue: { value: f ? tall * by(FIRE.tongue) : 1 },
    uRise: { value: riseCycles ? (by(FIRE.rise) * tall * pace * loop) / riseCycles : 0 }, uRiseCycles: { value: riseCycles },
    uPuffs: { value: times(FIRE.puffs) }, uFlickers: { value: times(FIRE.wavers) },
    tPal: { value: paletteTexture(f ? f.pal : null) }, uPalLo: { value: f ? f.palLo : 0 }, uPalHi: { value: f ? f.palHi : 1 },
    uCarve: { value: f ? by(FIRE.carve) * Math.min(amp, 1.5) : 0 }, uSynth: { value: f ? by(FIRE.synth) : 0 },
  };
}

function paletteTexture(pal) {
  const tex = new THREE.DataTexture(pal ?? new Uint8Array(4), pal ? pal.length / 4 : 1, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// opts: { image, maps, width, height, kind: 'waterfall'|'steam'|'fire', speed,
//         cycles, amp, loop (s), marksImg (uncropped marks cut to the frame, or null),
//         show (tint what stays still) }
export function buildPour(renderer, opts) {
  const K = KINDS[opts.kind];
  const f = pourField(opts.image, opts.kind, opts.marksImg);
  const photo = new THREE.Texture(opts.image);
  photo.minFilter = THREE.LinearMipmapLinearFilter;
  photo.generateMipmaps = true;
  photo.wrapS = photo.wrapT = THREE.MirroredRepeatWrapping;
  photo.needsUpdate = true;
  // whole cycles per loop (the loop closes), as many at any loop length as
  // the 12 s default has per second; the drift per cycle is the speed
  const loop = opts.loop > 0 ? opts.loop : 12;
  const cycles = K.fire ? 1 : Math.max(1, Math.round(opts.cycles ?? (K.cycles * loop) / 12));
  const pace = Math.max(0, opts.speed ?? 1), speed = K.fire ? 0 : K.speed * pace;
  const DIST_MAX = 1.5;   // frame heights the distance texture spans
  const amp = Math.min(Math.max(opts.amp ?? 1, 0), 2);
  const uniforms = {
    tImg: { value: photo }, tMap: { value: opts.maps.tex }, tFlow: { value: fieldTexture(f) },
    tDist: { value: maskTexture(f.w, f.h, f.dist.map((d) => Math.min(1, d / DIST_MAX)), f.glow, f.up) }, uDistMax: { value: DIST_MAX },
    uRes: { value: new THREE.Vector2(opts.width, opts.height) }, uT: { value: 0 },
    uDrift: { value: (speed * loop) / cycles }, uCycles: { value: cycles },
    // sideways sway about every 6 s, whole times per loop
    uBillow: { value: K.fire ? 0 : K.billow * amp }, uSways: { value: Math.max(1, Math.round(loop / 6)) }, uShow: { value: opts.show ? 1 : 0 },
    uPoolDrift: { value: (POOL.speed * pace * loop) / cycles }, uRing: { value: POOL.ring },
    // (still rings when the water is held: speed=0)
    uRings: { value: pace > 0 ? Math.max(1, Math.round((POOL.spread * pace * loop) / POOL.ring)) : 0 }, uChurn: { value: pace > 0 ? amp : 0 }, uChurnCycles: { value: Math.max(1, Math.round(loop / 12)) },
    ...fireUniforms(K.fire ? f : null, pace, amp, loop),
  };
  const colorMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: POUR_FS, depthTest: false, depthWrite: false });
  const dirMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: POUR_DIR_FS, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colorMat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function renderDirection(target) {
    quad.material = dirMat;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    quad.material = colorMat;
  }
  const info = K.fire ? `fire · flame ${Math.round(f.share * 100)}% · ${f.turb < 0.5 ? 'calm' : 'lively'}`
    + (f.share < K.minBody / 2 ? ' · found no flame: open shore=show, or press E and paint it green' : '')
    : `${opts.kind} · moving ${Math.round(f.share * 100)}%${K.pool ? ` · pool ${Math.round(f.poolShare * 100)}%` : ''} · ${cycles} cycles`
    // (nothing found: say so, instead of a quietly still loop)
    + (f.share + f.poolShare < (K.minBody ? K.minBody / 2 : 0.005) ? ` · found nothing that ${K.way > 0 ? 'rises' : 'falls'}: open shore=show, or press E and paint it green` : '');
  return { scene, camera, count: 0, share: f.share, info, update: (t) => { uniforms.uT.value = t; }, renderDirection };
}
