// A bed of sound for each scene (sound=on), made from noise, not recorded,
// and exactly one loop long so it repeats with the picture: surf for the sea,
// wind for skies and grass, the roar of a waterfall, the hiss of steam, a
// fire's crackle, crickets at night.
// Seamless the same way the picture is: every swell and gust repeats a whole
// number of times per loop, filters run twice round the loop so they start in
// the state they end in, and clicks near the end wrap round to the start.
const RATE = 48000;

// a small seeded random, so the same scene sounds the same each time
function random(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const white = (n, rnd) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rnd() * 2 - 1; return a; };
// one-pole low-pass at hz, run twice round the loop (a periodic result)
function lowpass(x, hz) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE), y = new Float32Array(x.length);
  let v = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < x.length; i++) { v += a * (x[i] - v); y[i] = v; }
  return y;
}
const highpass = (x, hz) => { const l = lowpass(x, hz); return x.map((v, i) => v - l[i]); };
const band = (x, lo, hi) => highpass(lowpass(x, hi), lo);
const norm = (x) => { let s = 0; for (const v of x) s += v * v; const r = Math.sqrt(s / x.length) || 1; return x.map((v) => v / r); };
// a slow swell: cycles whole times per loop, between floor and 1, peaking sharply when sharp > 1
const swell = (n, cycles, phase, floor = 0, sharp = 1) => {
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = floor + (1 - floor) * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (cycles * i / n + phase)), sharp);
  return e;
};
// short bursts at random places (count of them), each a decaying noise click
function clicks(n, count, rnd, { len = 0.006, lenSpread = 3, hz = 3000 } = {}) {
  const out = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(rnd() * n), l = Math.floor(len * RATE * (1 + rnd() * lenSpread)), amp = Math.pow(rnd(), 2.5);
    for (let j = 0; j < l; j++) out[(at + j) % n] += amp * (rnd() * 2 - 1) * Math.exp((-5 * j) / l);
  }
  return lowpass(out, hz);
}

// One channel of a scene's sound, about unit loudness.
function channel(scene, n, loop, rnd) {
  const cyc = (sec) => Math.max(1, Math.round(loop / sec));   // whole cycles near that period
  const mix = (...parts) => { const o = new Float32Array(n); for (const [x, g] of parts) for (let i = 0; i < n; i++) o[i] += x[i] * g; return o; };
  const times = (x, e) => x.map((v, i) => v * e[i]);
  let out;
  if (scene === 'water') {
    // surf: a wash of low noise that rises as each wave breaks, hissing at the top
    const wave = swell(n, cyc(6), rnd(), 0.25, 3);
    out = mix([times(norm(lowpass(white(n, rnd), 500)), wave), 1], [times(norm(band(white(n, rnd), 2000, 7000)), wave.map((v) => v * v)), 0.35]);
  } else if (scene === 'waterfall') {
    out = mix([norm(lowpass(white(n, rnd), 900)), 1], [norm(band(white(n, rnd), 1500, 6000)), 0.3]);
    out = times(out, swell(n, cyc(3), rnd(), 0.85));
  } else if (scene === 'steam') {
    out = times(norm(band(white(n, rnd), 3000, 9000)), swell(n, cyc(4), rnd(), 0.5));
    out = out.map((v) => v * 0.4);
  } else if (scene === 'fire') {
    // a low roar, crackles (many small, a few loud) and the odd pop
    const roar = times(norm(lowpass(white(n, rnd), 180)), swell(n, cyc(1), rnd(), 0.6));
    out = mix([roar, 0.5], [norm(clicks(n, Math.round(loop * 14), rnd)), 0.9], [norm(clicks(n, Math.round(loop * 1.5), rnd, { len: 0.02, hz: 1200 })), 0.5]);
  } else if (scene === 'twinkle') {
    // a quiet night: crickets chirping in short trains
    const air = norm(lowpass(white(n, rnd), 300)).map((v) => v * 0.15);
    const chirp = new Float32Array(n), hz = 4300 + rnd() * 600, every = n / cyc(0.9);
    for (let i = 0; i < n; i++) {
      const p = (i % every) / RATE;   // seconds into this train
      const on = p < 0.12 ? Math.max(0, Math.sin(2 * Math.PI * 30 * p)) : 0;
      chirp[i] = on * Math.sin((2 * Math.PI * hz * i) / RATE);
    }
    out = mix([air, 1], [chirp, 0.25]);
  } else {
    // wind (sky, grass): noise whose pitch and strength rise and fall in gusts,
    // and for grass the rustle of blades in it
    const gust = swell(n, cyc(5), rnd(), 0.2, 2);
    const low = norm(band(white(n, rnd), 150, 600)), high = norm(band(white(n, rnd), 500, 1600));
    out = low.map((v, i) => (v * (1 - gust[i]) + high[i] * gust[i]) * (0.4 + 0.6 * gust[i]));
    if (scene === 'grass') out = mix([out, 1], [times(norm(band(white(n, rnd), 3000, 8000)), gust.map((v) => v * v)), 0.3]);
  }
  return out;
}

// An AudioBuffer of the scene's sound, loop seconds long, stereo.
export function sceneSound(scene, { loop = 12 } = {}) {
  const n = Math.round(loop * RATE);
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: RATE });
  const level = { water: 0.16, waterfall: 0.16, steam: 0.12, fire: 0.14, twinkle: 0.12 }[scene] ?? 0.13;
  for (let c = 0; c < 2; c++) {
    const x = channel(scene, n, loop, random(1234 + c * 77));
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    const g = Math.min(level, 0.9 / (peak || 1));
    buf.getChannelData(c).set(x.map((v) => v * g));
  }
  return buf;
}

// The buffer as a 16-bit WAV file (for the local export, which muxes with ffmpeg).
export function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true);
  return new Blob([data], { type: 'audio/wav' });
}

// Plays the buffer on repeat in step with the picture: phase() is where the
// loop is now (0–1). Returns stop().
export function playSound(buf, phase) {
  const ctx = new AudioContext();
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
  src.connect(ctx.destination);
  src.start(0, phase() * buf.duration);
  return () => { src.stop(); ctx.close(); };
}
