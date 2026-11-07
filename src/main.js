// URL parameters (all optional):
//   img=input/my.jpg   the image to bring to life (path under the repo folder;
//                      default: the sample in examples/)
//   mode=ascii|flow    ASCII layer, or the scene alone without it (default ascii)
//   width=1080         output width in px; height follows the image
//   height=2160        output height in px; with both set, the image is
//                      cropped to that shape (e.g. your screen, for a wallpaper)
//   size=iphone        a wallpaper size by name, in place of width and height
//                      (see SIZES below). width= alone then keeps its shape,
//                      for a smaller preview; height= too overrides it
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
//   tag=NAME           name the exports out/NAME-MODE.mp4 instead of after the photo
//   scene=auto|grass|water|sky|waterfall|steam|fire|twinkle
//                      grass rebuilds the image from swaying strands; water
//                      carries it along a flow field under travelling swell
//                      (sea, rivers, anything that flows rather than sways);
//                      sky drifts the clouds and keeps all below them still.
//                      auto (default) picks one from the photo's colours and,
//                      if it looks like none of them, renders nothing and says so.
//                      waterfall and steam (steam covers smoke and mist too) move only what
//                      runs in streaks down (or up) the frame, lighter than
//                      around it, along those streaks, and below a waterfall
//                      the pool or river it lands in; the rest stays still.
//                      fire moves what is bright and flame-coloured: it rises
//                      and flickers, and what it lights flickers with it.
//                      twinkle: small lights on a dark surround (stars, a
//                      city at night, fairy lights) dim and brighten each
//                      on its own; all else stays still.
//                      A water scene with a sky above it drifts that sky too.
//                      In water, set wind= to the way the water moves when it
//                      matters: auto only knows the streaks' axis (or, for a
//                      clear swell, its axis), and points it rightward or up;
//                      beside a shore it found, the swell comes ashore instead
//   churn=auto|1       water: how much the foam boils in place
//   drift=auto|0.5     water: how fast the surface drifts (per sixth of a loop)
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
//   marks=input/my-marks.png
//                      hand-painted overrides, the shape of the uncropped image:
//                      red keeps a part still (no swell, cloud or sway), green
//                      lets it move as water. Paint them in the page with E
//   cycles=auto|18     water: drift cycles per loop (whole number). More, shorter
//                      cycles keep the drifting copies closer and the foam sharper
//                      at the same speed; fewer show the restarts less. auto: 18,
//                      or 6 for a sea seen from the shore
//   sound=on           export with the scene's own sound, one loop long (sound.js);
//                      in the page, S plays it
//   speed=1            waterfall, steam, fire, twinkle: how fast it falls, rises or twinkles
//                      water: swell speed multiplier (each wave is rounded to
//                      whole cycles per loop, at least one, so very low
//                      speeds stop slowing down)
// Keys: M switches mode, Space pauses, E paints marks (editor.js), S plays the sound.
// The scene itself is built in living.js; this page reads the URL, shows it
// and exports through the local server (server.mjs).
import { loadImage } from './maps.js';
import { createLiving, LivingError, MODES } from './living.js';
import { openEditor } from './editor.js';
import { sceneSound, toWav, playSound } from './sound.js';

const q = new URLSearchParams(location.search);
const hud = document.getElementById('hud');
const canvas = document.getElementById('c');
const imgPath = q.get('img') || 'examples/beach.png';
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
// a repo path as a URL path: each part encoded, so #, ? and % in a name load
const urlOf = (p) => `/${p.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
const fail = (html, e) => { hud.innerHTML = html; document.title = 'failed'; throw e; };   // 'failed': what an export waits for

let image;
try {
  image = await loadImage(urlOf(imgPath));
} catch (e) {
  fail(`Couldn't load <code>${esc(imgPath)}</code>. Put your image in <code>input/</code> and open <code>?img=input/your-image.jpg</code>`, e);
}
const marksPath = q.get('marks')?.trim() || null;
let marksImg = null;
if (marksPath) {
  try {
    marksImg = await loadImage(urlOf(marksPath));
  } catch (e) {
    fail(`Couldn't load the marks <code>${esc(marksPath)}</code>. Paint them with <code>E</code>, or drop <code>marks=</code>.`, e);
  }
}

let living;
try {
  living = createLiving({ canvas, image, params: q, marksImg, name: imgPath.split('/').pop() });
} catch (e) {
  if (e instanceof LivingError) fail(e.html, e);
  throw e;
}
window.asciigraph = living; // handle for debugging in the console
const { loop: LOOP, fps: FPS, tag: NAME, info } = living;
let mode = MODES.includes(q.get('mode')) ? q.get('mode') : 'ascii';
let sound = null;
// exactly as long as the video's whole frames, or the two drift apart at the seam
const getSound = () => (sound ??= sceneSound(living.scene, { loop: Math.round(LOOP * FPS) / FPS }));

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
    living.step(i / N, i);
    for (const m of modes) {
      living.output(m);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await upload(`/frame?tag=${NAME}-${m}&i=${i}`, blob);
    }
    hud.textContent = `exporting ${modes.join(' + ')} · frame ${i + 1}/${N}`;
    document.title = `${i + 1}/${N}`;
  }
  if (q.get('sound') === 'on') {
    hud.textContent = 'making the sound…';
    const wav = toWav(getSound());
    for (const m of modes) await upload(`/sound?tag=${NAME}-${m}`, wav);
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
  let frozen = Number(q.get('t')) || 0;
  const start = performance.now();
  const phase = () => (((performance.now() - start) / 1000) % LOOP) / LOOP;
  // painting marks: the photo held still in the plain view under the brush
  let editing = null, stopSound = null;
  addEventListener('keydown', (e) => {
    if (editing) return;   // the editor has its own keys
    if (e.key === 'm' || e.key === 'M') mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (e.key === ' ') { frozen = phase(); paused = !paused; }
    if (e.key === 's' || e.key === 'S') {
      if (stopSound) { stopSound(); stopSound = null; } else stopSound = playSound(getSound(), phase);
    }
    if (e.key === 'e' || e.key === 'E') {
      const was = { mode, paused, frozen };
      frozen = paused ? frozen : phase(); paused = true; mode = 'flow';
      editing = openEditor({ canvas, hud, original: living.original, crop: living.crop, marksImg, imgPath, onClose: () => { editing = null; ({ mode, paused } = was); frozen = was.paused ? was.frozen : frozen; } });
    }
  });
  let frame = 0;
  const tick = () => {
    const t = paused ? frozen : phase();
    living.draw(t, mode, frame++);
    if (!editing) hud.textContent = `${info} · t=${t.toFixed(3)} · [M] ${mode} · [space] pause · [S] sound${stopSound ? ' on' : ''} · [E] mark still / moving`;
    requestAnimationFrame(tick);
  };
  tick();
}
