// Twinkle: stars, far-off city lights, the bulbs of a string of fairy
// lights. What twinkles is a small bright point on a dark surround, so it is
// found near the photo's own resolution (a star is a pixel or two): lighter
// than what is around it, around it dark, and small. A lit window, the moon,
// a lamp are too big to be a point and stay as they are, and so does all the
// rest of the photo. Each point dims and brightens on its own, at its own
// slow pace, and glows a little at its brightest. Painted marks (marks.js):
// red keeps points still; green makes what is painted twinkle, however big,
// dim or light around it.
// Same interface as buildWater.
import * as THREE from 'three';
import { QUAD_VS } from './field.js';
import { blur, smooth } from './masks.js';

const DETECT = 1536;   // detection resolution along the long side (at most the photo's)

// rate: how often a point dims and brightens (per second, [slowest,
// fastest]; each point its own, whole times per loop. Real stars scintillate
// many times a second, but a calm loop wants it slow); depth: how far it dims
// and brightens (±; the biggest, brightest points the most, as with stars,
// the faintest a third of that); glow: how bright its halo (a blur of the points
// themselves, so each glows with its own beat); lift: how much lighter than around it a point
// is at least; floor: how light; dark: how dark around it at most; size:
// the largest point (frame long sides, as a radius); ratio: how light the
// ring round a point may be at most, as a share of the point
const TW = { rate: [0.12, 0.45], depth: 0.85, glow: 2.5, lift: 0.05, floor: 0.16, dark: 0.42, size: 0.006, ratio: 0.45 };

// a hash in 0–1, the same for the same point on every run
const rand = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

// The points, at detection resolution (rows top-down): per pixel how much it
// is point (core) and whose point it is (owner, -1 for none); per point its
// peak lightness.
function findPoints(img, marks, grid) {
  const D = Math.min(DETECT, Math.max(img.width, img.height)), aspect = img.width / img.height;
  const w = aspect >= 1 ? D : Math.max(2, Math.round(D * aspect)), h = aspect >= 1 ? Math.max(2, Math.round(D / aspect)) : D, n = w * h;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  const r = Math.max(2, Math.round(D * 0.006)), around = blur(blur(L, w, h, r), w, h, r);
  // the marks, read off the mask grid
  const markAt = (x, y, ch) => (marks ? marks[ch][Math.min(grid.h - 1, Math.floor((y * grid.h) / h)) * grid.w + Math.min(grid.w - 1, Math.floor((x * grid.w) / w))] : 0);
  // a point is clearly lighter than all of a small ring round it, at one of
  // a few sizes: an edge or a streak fails it, being as light along itself
  // (and a highlight on cloth, being only a little lighter than the cloth)
  const rings = [2, 4, 7, 12].map((R) => { R = Math.max(1, Math.round((R * D) / 1536)); return Array.from({ length: 12 }, (_, k) => [Math.round(R * Math.cos((k * Math.PI) / 6)), Math.round(R * Math.sin((k * Math.PI) / 6))]); });
  const ringMax = (x, y, ring) => {
    let m = 0;
    for (const [dx, dy] of ring) m = Math.max(m, L[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))]);
    return m;
  };
  const cand = new Uint8Array(n), forced = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (markAt(x, y, 'still') > 0.5) continue;
    if (markAt(x, y, 'move') > 0.5) { forced[i] = cand[i] = 1; continue; }
    if (L[i] < TW.floor || L[i] - around[i] < TW.lift || around[i] >= TW.dark) continue;
    for (const ring of rings) {
      const m = ringMax(x, y, ring);
      if (L[i] - m >= TW.lift && m <= L[i] * TW.ratio) { cand[i] = 1; break; }
    }
  }
  // each patch of candidates (8-neighbour) small enough is a point
  const maxArea = Math.max(4, Math.PI * (D * TW.size) ** 2), label = new Int32Array(n).fill(-1), stack = [], pts = [];
  for (let s = 0; s < n; s++) {
    if (!cand[s] || label[s] >= 0) continue;
    const cells = [];
    label[s] = -2; stack.push(s);
    let peak = 0, sx = 0, sy = 0, sw = 0, force = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      cells.push(i);
      const v = Math.max(L[i] - around[i], 0.01);   // (a painted pixel may be no lighter than around it)
      peak = Math.max(peak, L[i]); sx += x * v; sy += y * v; sw += v; force |= forced[i];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if (X < 0 || Y < 0 || X >= w || Y >= h || !cand[j] || label[j] !== -1) continue;
        label[j] = -2; stack.push(j);
      }
    }
    // (and round enough: a glint along a wire or an edge is a line)
    const long = Math.max(x1 - x0, y1 - y0) + 1;
    const big = !force && (cells.length > maxArea || (long >= 4 && cells.length < 0.3 * long * long));
    const id = big ? -3 : pts.length;
    for (const i of cells) label[i] = id;
    if (big) continue;
    // and the rest of the light round it, as far as it is lighter than
    // around it (the glass of a bulb, a star's soft edge), so all of it
    // twinkles, not just its brightest middle
    const cx = sx / sw, cy = sy / sw, reach = D * TW.size;
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q], x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if (X < 0 || Y < 0 || X >= w || Y >= h || label[j] !== -1 || cand[j] || L[j] - around[j] < TW.lift || Math.hypot(X - cx, Y - cy) > reach || markAt(X, Y, 'still') > 0.5) continue;
        label[j] = id; cells.push(j);
      }
    }
    pts.push({ x: cx, y: cy, area: cells.length, peak });
  }
  // core: the point and its soft edge (2 px round it), by how much lighter
  // than around it each pixel is
  const core = new Float32Array(n), owner = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const id = label[i];
    if (id < 0) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy, j = Y * w + X;
      if (X < 0 || Y < 0 || X >= w || Y >= h || (label[j] >= 0 && label[j] !== id) || label[j] === -3 || markAt(X, Y, 'still') > 0.5) continue;
      const v = Math.max(smooth(0.0, TW.lift * 2, L[j] - around[j]), forced[j]) * (dx || dy ? smooth(0, 1, 1 - Math.hypot(dx, dy) / 3) : 1);
      if (v > core[j]) { core[j] = v; owner[j] = id; }
    }
  }
  return { w, h, D, core, owner, pts };
}

// Two textures in photo uv: tPts (linear) r core; tWho (nearest,
// so a point's pace doesn't blend with its neighbour's) r phase, g and b the
// two paces (whole times per loop), a how deep it twinkles.
function pointTextures(f, loop, pace) {
  const { w, h } = f, a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
  const who = f.pts.map((p, k) => {
    const rate = TW.rate[0] + (TW.rate[1] - TW.rate[0]) * rand(k, 1);
    const k1 = pace > 0 ? Math.max(1, Math.round(loop * rate * pace)) : 0;
    // (a second, faster beat on top, so it doesn't pulse like a metronome)
    const k2 = pace > 0 ? Math.min(255, k1 + 1 + Math.floor(rand(k, 2) * 3)) : 0;
    const big = 0.5 * smooth(TW.floor, 0.9, p.peak) + 0.5 * smooth(1, Math.max(2, (6 * f.D) / 1536), Math.sqrt(p.area));
    return [rand(k, 3), Math.min(255, k1), k2, (0.33 + 0.67 * big) * (0.8 + 0.2 * rand(k, 4))];
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((h - 1 - y) * w + x) * 4;
    a[o] = Math.round(f.core[i] * 255); a[o + 3] = 255;
    const p = f.owner[i] >= 0 ? who[f.owner[i]] : null;
    if (p) { b[o] = Math.round(p[0] * 255); b[o + 1] = p[1]; b[o + 2] = p[2]; b[o + 3] = Math.round(p[3] * 255); }
  }
  const tex = (data, filter) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.magFilter = t.minFilter = filter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { tPts: { value: tex(a, THREE.LinearFilter) }, tWho: { value: tex(b, THREE.NearestFilter) } };
}

const TWINKLE_COMMON = /* glsl */`
  uniform sampler2D tImg, tPts, tWho, tSpark;
  uniform float uT, uDepth, uGlow, uShow;
  varying vec2 vUv;
  const float TAU = 6.28318530718;
  vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  // how far this point is through its twinkle, about -1..1, whole times per
  // loop: a slow beat and a faster one on top; and how deep it twinkles
  float twinkle(out float depth) {
    vec4 who = texture(tWho, vUv);
    float k1 = floor(who.g * 255.0 + 0.5), k2 = floor(who.b * 255.0 + 0.5);
    depth = who.a;
    return 0.7 * sin(TAU * (k1 * uT + who.r)) + 0.3 * sin(TAU * (k2 * uT + who.r * 2.7));
  }`;

// the points alone, as bright as they are at this moment past their mean:
// blurred (its mipmaps), the glow
const SPARK_FS = /* glsl */`
  ${TWINKLE_COMMON}
  void main() {
    float depth, tw = twinkle(depth);
    gl_FragColor = vec4(toLin(texture(tImg, vUv).rgb) * texture(tPts, vUv).r * depth * depth * smoothstep(0.0, 1.0, tw), 1.0);
  }`;

const TWINKLE_FS = /* glsl */`
  ${TWINKLE_COMMON}
  void main() {
    vec3 c = toLin(texture(tImg, vUv).rgb);
    float p = texture(tPts, vUv).r, depth, tw = twinkle(depth);
    c *= max(1.0 + uDepth * depth * tw * p, 0.0);
    // the glow, wide and faint over narrow and bright (a bright point
    // can't get brighter by multiplying: it is already near white)
    c += uGlow * (0.3 * textureLod(tSpark, vUv, 0.0).rgb + 0.45 * textureLod(tSpark, vUv, 1.0).rgb + 0.35 * textureLod(tSpark, vUv, 2.0).rgb + 0.2 * textureLod(tSpark, vUv, 3.0).rgb);
    // shore=show: the photo dimmed, what twinkles in green (points are too
    // small to see by tinting the rest)
    c = mix(c, mix(c * 0.15, vec3(0.1, 1.0, 0.2), p), uShow);
    gl_FragColor = vec4(c, 1.0);
  }`;

// the photo's own streaks, for the ASCII strokes
const TWINKLE_DIR_FS = /* glsl */`
  uniform sampler2D tMap;
  varying vec2 vUv;
  void main() {
    vec2 ts = texture(tMap, vUv).ba * 2.0 - 1.0;
    vec2 d = ts / max(length(ts), 1e-4) * clamp(length(ts) * 3.0, 0.0, 1.0);
    float wt = 0.6 + 0.4 * length(d);
    gl_FragColor = vec4(d * wt, wt, 1.0);
  }`;

// opts: { image, maps, width, height, speed, amp, loop (s), marks, grid, show }
export function buildTwinkle(renderer, opts) {
  const f = findPoints(opts.image, opts.marks, opts.grid);
  const loop = opts.loop > 0 ? opts.loop : 12, pace = Math.max(0, opts.speed ?? 1);
  const amp = Math.min(Math.max(opts.amp ?? 1, 0), 2);
  const photo = new THREE.Texture(opts.image);
  photo.minFilter = THREE.LinearMipmapLinearFilter;
  photo.generateMipmaps = true;
  photo.needsUpdate = true;
  // (at half the frame: its mipmaps blur it, and a blur needs no more)
  const sparkRT = new THREE.WebGLRenderTarget(Math.max(1, opts.width >> 1), Math.max(1, opts.height >> 1),
    { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const uniforms = {
    tImg: { value: photo }, tMap: { value: opts.maps.tex }, ...pointTextures(f, loop, pace), tSpark: { value: sparkRT.texture }, uT: { value: 0 },
    uDepth: { value: Math.min(TW.depth * amp, 0.95) }, uGlow: { value: TW.glow * amp }, uShow: { value: opts.show ? 1 : 0 },
  };
  const colorMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: TWINKLE_FS, depthTest: false, depthWrite: false });
  const dirMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: TWINKLE_DIR_FS, depthTest: false, depthWrite: false });
  const sparkMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: SPARK_FS, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colorMat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    quad.material = colorMat;
  }
  const info = `twinkle · ${f.pts.length.toLocaleString()} points`
    + (f.pts.length ? '' : ' · found no small lights on a dark surround: press E and paint them green');
  const update = (t) => { uniforms.uT.value = t; pass(sparkMat, sparkRT); };
  return { scene, camera, count: 0, share: 0, info, update, renderDirection: (target) => pass(dirMat, target) };
}
