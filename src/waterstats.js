// What the water scene needs to know about a photo, so one set of shaders
// suits surf, open sea and rivers alike:
//   k     the photo's own dominant wave size, in waves per frame height: the
//         scale that stands out most above a power law fitted to its spectrum
//         (natural images fall off as a power of k, so a real wave size is a
//         bump above that trend, not simply the strongest band)
//   axis  the heading the waves at that scale travel along (rad, y up, mod π)
//   aniso 0–1: how much they all travel that one way (1 = parallel swell)
//   peak  how far that bump stands above the trend (1 = no bump at all)
//   foam  linear-luma thresholds for what counts as foam: this photo's
//         brightness percentiles rather than fixed numbers, so a dim shot of
//         surf still has foam and a bright lagoon isn't all foam
// All of it from the water alone: the sky (sky.js), if any, is left out, so
// clouds count neither as foam nor as waves.
const N = 256;

// in-place iterative radix-2 FFT of n complex values at re/im[off + i*stride]
function fft(re, im, off, stride, n) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = off + i * stride, b = off + j * stride;
      [re[a], re[b]] = [re[b], re[a]];
      [im[a], im[b]] = [im[b], im[a]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = off + (i + j) * stride, b = off + (i + j + len / 2) * stride;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

export function analyseWater(img, sky = null) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';   // a cheap downscale aliases fine ripples into false waves
  g.drawImage(img, 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;
  const L = new Float32Array(N * N), water = [];
  const isSky = (i) => sky != null && sky.at((i % N + 0.5) / N, (((i / N) | 0) + 0.5) / N) > 0.5;
  let mean = 0;
  for (let i = 0; i < N * N; i++) {
    const lin = (v) => (v / 255) ** 2.2;
    L[i] = 0.2126 * lin(px[i * 4]) + 0.7152 * lin(px[i * 4 + 1]) + 0.0722 * lin(px[i * 4 + 2]);
    if (!isSky(i)) { water.push(L[i]); mean += L[i]; }
  }
  if (!water.length) return { k: null, axis: 0, aniso: 0, peak: 1, foam: [0.6, 0.92] };   // all sky
  mean /= water.length;
  // the sky becomes flat water-grey: no texture for the spectrum to see
  for (let i = 0; i < N * N; i++) if (isSky(i)) L[i] = mean;
  const sorted = Float32Array.from(water).sort();
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const lo = Math.min(0.6, Math.max(0.12, pct(0.6)));
  const hi = Math.min(0.92, Math.max(lo + 0.1, pct(0.95)));

  // spectrum of the mean-free, Hann-windowed luma (the window stops the
  // frame's edges from reading as a wave)
  const re = new Float32Array(N * N), im = new Float32Array(N * N);
  const hann = (i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) re[y * N + x] = (L[y * N + x] - mean) * hann(x) * hann(y);
  for (let y = 0; y < N; y++) fft(re, im, y * N, 1, N);
  for (let x = 0; x < N; x++) fft(re, im, x, N, N);

  // radial bins of power in waves per frame height (the image is aspect frame
  // heights wide, so horizontal frequencies divide by it; rows run down, so
  // the vertical one flips to y up). Swell lives in KMIN–KMAX: finer than
  // that the shader's own chop takes over.
  // Bins are log-spaced: at low k a linear bin holds only a handful of
  // lattice points, too few to see a long swell.
  const aspect = img.width / img.height, KMIN = 1.2, KMAX = 16, NB = 24;
  const binOf = (k) => Math.floor((Math.log(k / KMIN) / Math.log(KMAX / KMIN)) * NB);
  const kOf = (b) => KMIN * (KMAX / KMIN) ** ((b + 0.5) / NB);
  const acc = new Float64Array(NB), cnt = new Uint32Array(NB);
  const freq = (u, v) => [(u < N / 2 ? u : u - N) / aspect, -(v < N / 2 ? v : v - N)];
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const [kx, ky] = freq(u, v), k = Math.hypot(kx, ky);
    if (k < KMIN || k >= KMAX) continue;
    const i = v * N + u, b = binOf(k);
    acc[b] += re[i] * re[i] + im[i] * im[i];
    cnt[b]++;
  }
  // least-squares power law through the profile, in log–log
  const pts = [];
  for (let b = 0; b < NB; b++) if (cnt[b] && acc[b] > 0) pts.push([Math.log(kOf(b)), Math.log(acc[b] / cnt[b])]);
  const none = { k: null, axis: 0, aniso: 0, peak: 1, foam: [lo, hi] };   // no clear wave size: the shader keeps its preset
  if (pts.length < 5) return none;   // a flat image
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / Math.max(pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), 1e-9);
  const resid = pts.map((p) => p[1] - (my + slope * (p[0] - mx)));
  let best = -Infinity, k = null, at = 0;
  for (let j = 1; j < pts.length - 1; j++) {
    const r = (resid[j - 1] + 2 * resid[j] + resid[j + 1]) / 4;   // light smoothing against noise
    if (r > best) { best = r; k = Math.exp(pts[j][0]); at = j; }
  }
  // a bump on the range's edge is a trend the line missed, and a faint one is
  // noise: neither is a wave size
  if (at <= 1 || at >= pts.length - 2 || Math.exp(best) < 1.15) return none;
  // which way the waves at that scale travel: power-weighted doubled angle
  let sx = 0, sy = 0, sp = 0, np = 0;
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const [kx, ky] = freq(u, v), kk = Math.hypot(kx, ky);
    if (kk < k * 0.7 || kk > k * 1.4) continue;
    const i = v * N + u, P = re[i] * re[i] + im[i] * im[i], th = 2 * Math.atan2(ky, kx);
    sx += P * Math.cos(th); sy += P * Math.sin(th); sp += P; np++;
  }
  // with only a few lattice points even random texture looks directional
  // (about 1/√n); past 20 that bias stays well under the 0.3 where swell begins
  const aniso = sp > 0 && np >= 20 ? Math.hypot(sx, sy) / sp : 0;
  return { k, axis: 0.5 * Math.atan2(sy, sx), aniso, peak: Math.exp(best), foam: [lo, hi] };
}
