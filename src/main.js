// URL parameters (all optional):
//   img=input/my.jpg   the image to bring to life (path under the repo folder;
//                      default: the sample in examples/)
//   mode=ascii|flow    ASCII layer, or the scene alone without it (default ascii)
//   width=1080         output width in px; height follows the image
//   height=2160        output height in px; with both set, the image is
//                      cropped to that shape (e.g. your screen, for a wallpaper)
//   focus=0.5,0.5      which part of the image to keep when cropping
//                      (0–1 across, 0–1 down)
//   wind=auto|35       wind direction in degrees (0 = right, 90 = up); auto
//                      follows the texture's own dominant direction
//   light=130          where the light in the image comes from, in degrees
//   amp=1              sway amount (water: swell height, capped at 1.4 where
//                      the surface would fold over)
//   density=1          strand count multiplier (strands only)
//   loop=12            loop length in seconds
//   fps=30             export frame rate
//   t=0.25             freeze at a loop phase (for stills)
//   export=ascii,flow  render one loop of each listed mode and encode MP4s
//   scene=auto|grass|water|sky
//                      grass rebuilds the image from swaying strands; water
//                      carries it along a flow field under travelling swell
//                      (sea, rivers, anything that flows rather than sways);
//                      sky drifts the clouds and keeps all below them still.
//                      auto (default) picks one from the photo's colours and,
//                      if it looks like none of them, renders nothing and says so.
//                      A water scene with a sky above it drifts that sky too.
//                      In water, set wind= to the way the water moves when it
//                      matters: auto only knows the streaks' axis (or, for a
//                      clear swell, its axis), and points it rightward or up;
//                      beside a shore it found, the swell comes ashore instead
//   churn=auto|1       water: how much the foam boils in place
//   drift=auto|0.5     water: how far the surface drifts per flow cycle
//                      (auto: streaky photos drift more, chaotic ones churn more)
//   wavelength=auto    water: typical swell size in frame heights (the
//                      slope-weighted mean; the longest wave is ~2.5× that).
//                      auto: the photo's own dominant wave, from its spectrum
//   shore=auto|off|show
//                      water: keep dry land (a beach, rocks) still. auto finds
//                      sand and dark rock from the colours and only acts when
//                      the photo clearly has blue water beside solid land; off
//                      moves the whole frame; show tints what it keeps still
//   sky=auto|off|show  water and sky: find the sky (hanging from the top edge,
//                      down to a horizon or skyline) and drift its clouds; off
//                      treats it like the rest; show tints it blue
//   cloud=0            which way the clouds drift, in degrees (0 = right)
//   clouds=1           cloud speed multiplier (0 holds them still)
//   haze=0.35          sea seen from the shore (a straight sea horizon): how
//                      much of the air's colour lies over the sea at the
//                      horizon, fading toward the camera (0 = none)
//   cycles=6           water: flow cycles per loop (whole number)
//   speed=1            water: swell speed multiplier (each wave is rounded to
//                      whole cycles per loop, at least one, so very low
//                      speeds stop slowing down)
// Keys: M switches mode, Space pauses.
import * as THREE from 'three';
import { loadImage, deriveMaps } from './maps.js';
import { buildField } from './field.js';
import { buildWater } from './water.js';
import { analyseWater } from './waterstats.js';
import { classifyImage } from './classify.js';
import { readGrid } from './masks.js';
import { skyMask } from './sky.js';
import { makePost } from './post.js';

const q = new URLSearchParams(location.search);
// a number from the URL, or d when it is missing, 'auto' or not a number
const num = (k, d) => { const s = q.get(k)?.trim(), v = Number(s || NaN); return Number.isFinite(v) ? v : d; };
const hud = document.getElementById('hud');
const imgPath = q.get('img') || 'examples/beach.png';

let image;
try {
  image = await loadImage(`/${imgPath.replace(/^\/+/, '')}`);
} catch (e) {
  hud.innerHTML = `Couldn't load <code>${imgPath}</code>. Put your image in <code>input/</code> and open <code>?img=input/your-image.jpg</code>`;
  throw e;
}
const even = (v) => Math.max(2, Math.round(v / 2) * 2); // H.264 wants even sizes
const W = even(num('width', 1080));
const cropped = num('height', 0) > 0;
const H = cropped ? even(num('height', 0)) : even((W * image.height) / image.width);
if (cropped) image = cropTo(image, W / H, (q.get('focus') || '0.5,0.5').split(',').map(Number));
const maps = deriveMaps(image);

// Cut the largest W:H window out of the image, placed by focus (0–1 each way).
function cropTo(img, aspect, [fx = 0.5, fy = 0.5]) {
  let w = img.width, h = img.height;
  if (w / h > aspect) w = Math.round(h * aspect); else h = Math.round(w / aspect);
  const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(img, (img.width - w) * clamp(fx), (img.height - h) * clamp(fy), w, h, 0, 0, w, h);
  return cv;
}
const rad = (deg) => (deg * Math.PI) / 180;
const windGiven = Number.isFinite(num('wind', NaN));
const wind = windGiven ? rad(num('wind', 0)) : maps.dominant;

// Which scene: asked for, or read off the photo. A photo that is none of
// them isn't forced into one. Grass is judged on the whole frame as before;
// otherwise, if the photo has a sky, what is under it decides: water (some
// water is enough, the sky's clouds drift too), or else a sky scene, when
// there is enough sky to be worth it. Blue that the sky runs straight into
// with no horizon between them is more likely glass or far hills than a sea
// (sky.js), but only counts against water when the photo as a whole doesn't
// read as water: a frozen sea is the worse mistake, so a sea behind a
// headland, under a hazy horizon or a tilted one keeps moving (and a city of
// blue glass moves with it).
const skyMode = q.get('sky')?.trim().toLowerCase();
const grid = readGrid(image);
const sky = skyMode === 'off' ? null : skyMask(grid);
const asked = ['grass', 'water', 'sky'].includes(q.get('scene')) ? q.get('scene') : null;
const guess = asked ? null : classifyImage(image);
let scene = asked ?? guess.kind;
if (!asked && scene !== 'grass' && sky) {
  const under = classifyImage(image, sky).shares;
  scene = under.water >= 0.3 && (sky.seaBelow || guess.kind === 'water') ? 'water' : sky.share >= 0.2 ? 'sky' : scene;
}
if (scene === 'sky' && !sky) scene = null;
if (!scene) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  hud.innerHTML = asked === 'sky'
    ? (skyMode === 'off' ? `scene=sky needs the sky: drop <code>sky=off</code>.`
      : `No sky found at the top of this image (it needs sky along most of the top edge), so nothing was generated.`)
    : `This doesn't look like grass, water or sky (green ${pct(guess.shares.grass)}, water ${pct(guess.shares.water)} of the frame), so nothing was generated. `
      + `If it is one of them, open it with <code>&scene=grass</code>, <code>&scene=water</code> or <code>&scene=sky</code>.`;
  document.title = 'failed';   // what an export waits for
  throw new Error(`unsupported image: ${imgPath}`);
}
const flowing = scene !== 'grass';   // water and sky both run on the water shader
const LOOP = num('loop', 12), FPS = num('fps', 30);
const NAME = imgPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-') + (cropped ? `-${W}x${H}` : '') + (flowing ? `-${scene}` : '');
const MODES = ['ascii', 'flow'];
let mode = MODES.includes(q.get('mode')) ? q.get('mode') : 'ascii';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const common = { image, maps, width: W, height: H, wind, light: rad(num('light', 130)), amp: num('amp', 1) };
const field = flowing
  ? buildWater(renderer, {
      ...common, windGiven, stats: analyseWater(image, sky), churn: num('churn', null), drift: num('drift', null),
      wavelength: num('wavelength', null), cycles: num('cycles', 6), speed: num('speed', 1), shore: q.get('shore')?.trim().toLowerCase(),
      grid, sky, skyOnly: scene === 'sky', skyShow: skyMode === 'show', cloud: rad(num('cloud', 0)), clouds: num('clouds', 1), haze: num('haze', null),
    })
  : buildField(renderer, { ...common, density: num('density', 1) });
const post = makePost(renderer, W, H, field);
window.asciigraph = { field, post, renderer }; // handle for debugging in the console

// water reports its own heading (the swell's, which may not be the wind's)
const info = `${W}×${H} · ${flowing ? field.info : `${field.count.toLocaleString()} strands · wind ${Math.round((wind * 180) / Math.PI)}°`}`;

function draw(t, frame) {
  field.update(t);
  post.renderScene(frame);
}

// A long export sends hundreds of large uploads; retry the odd dropped one
// instead of losing the whole loop.
async function upload(url, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', body });
      if (res.ok) return res;
      throw new Error(`${url}: HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= 5) throw e;
      console.warn(`retrying ${url} (${e.message})`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

async function exportLoop(modes) {
  const N = Math.round(LOOP * FPS);
  for (let i = 0; i < N; i++) {
    draw(i / N, i);
    for (const m of modes) {
      post.output(m);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await upload(`/frame?tag=${NAME}-${m}&i=${i}`, blob);
    }
    hud.textContent = `exporting ${modes.join(' + ')} · frame ${i + 1}/${N}`;
    document.title = `${i + 1}/${N}`;
  }
  const files = [];
  for (const m of modes) {
    hud.textContent = `encoding ${m}…`;
    const res = await (await fetch(`/encode?tag=${NAME}-${m}&fps=${FPS}`, { method: 'POST' })).json();
    if (res.code !== 0) throw new Error(`ffmpeg failed:\n${res.log}`);
    files.push(res.file);
  }
  hud.textContent = `done → ${files.join(', ')}`;
  document.title = 'done';
}

if (q.has('export')) {
  const modes = q.get('export').split(',').filter((m) => MODES.includes(m));
  exportLoop(modes.length ? modes : ['ascii']).catch((e) => { console.error(e); hud.textContent = String(e); document.title = 'failed'; });
} else {
  let paused = q.has('t');
  let frozen = num('t', 0);
  const start = performance.now();
  const phase = () => (((performance.now() - start) / 1000) % LOOP) / LOOP;
  addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (e.key === ' ') { frozen = phase(); paused = !paused; }
  });
  let frame = 0;
  const tick = () => {
    const t = paused ? frozen : phase();
    draw(t, frame++);
    post.output(mode);
    hud.textContent = `${info} · t=${t.toFixed(3)} · [M] ${mode} · [space] pause`;
    requestAnimationFrame(tick);
  };
  tick();
}
