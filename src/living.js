// One living photo: picks the scene, builds it and draws any moment of its
// loop onto a canvas. The page (main.js), the drop-a-photo demo (demo.js) and
// <living-photo> (element.js) all run on this; the options are the page's URL
// parameters, listed at the top of main.js.
import * as THREE from 'three';
import { deriveMaps } from './maps.js';
import { buildField } from './field.js';
import { buildWater } from './water.js';
import { buildPour } from './pour.js';
import { buildTwinkle } from './twinkle.js';
import { analyseWater } from './waterstats.js';
import { classifyImage } from './classify.js';
import { readGrid } from './masks.js';
import { skyMask } from './sky.js';
import { makePost } from './post.js';
import { INKS, BGS, CHARS, CELLS, DEFAULT_STYLE } from './ascii.js';
import { marksOnGrid } from './marks.js';

export const SCENES = ['grass', 'water', 'sky', 'waterfall', 'steam', 'fire', 'twinkle'];
export const MODES = ['ascii', 'flow'];
// Wallpaper sizes, in screen pixels, portrait for phones and tablets
export const SIZES = {
  iphone: [1180, 2556],        // iPhone 15, 15 Pro, 16 (1179 wide, made even)
  'iphone-max': [1290, 2796],  // iPhone 15 Plus, 15 Pro Max, 16 Plus
  android: [1080, 2400],       // most 6.1–6.7" Android phones
  ipad: [1640, 2360],          // iPad Air 11"
  mac: [2880, 1864],           // MacBook Air 15"
  '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160],
};

// Why nothing was made. html is the message to show, written for a person.
export class LivingError extends Error {
  constructor(html) { super(html.replace(/<[^>]+>/g, '')); this.html = html; }
}

const even = (v) => Math.max(2, Math.round(v / 2) * 2); // H.264 wants even sizes
const rad = (deg) => (deg * Math.PI) / 180;

// canvas: where it draws; image: the photo (an <img>, canvas or bitmap);
// params: the options (URLSearchParams or anything with get()); marksImg:
// painted marks, the shape of the uncropped photo, or null; name: the
// photo's file name, for naming exports; asciiScale: characters that many
// times their size (makePost).
export function createLiving({ canvas, image, params, marksImg = null, name = 'photo', asciiScale = 1 }) {
  const q = params;
  // a number from the options, or d when it is missing, 'auto' or not a number
  const num = (k, d) => { const s = q.get(k)?.trim(), v = Number(s || NaN); return Number.isFinite(v) ? v : d; };

  const style = asciiStyle(q);
  const sizeName = q.get('size')?.trim().toLowerCase();
  if (sizeName && !Object.hasOwn(SIZES, sizeName)) {
    throw new LivingError(`No size called <code>${sizeName.replace(/[<&]/g, '')}</code>. Use one of ${Object.keys(SIZES).map((k) => `<code>${k}</code>`).join(', ')}, or give <code>width</code> and <code>height</code>.`);
  }
  const [sizeW, sizeH] = SIZES[sizeName] ?? [1080, 0];
  const W = even(num('width', sizeW));
  // with a size, a width alone keeps that size's shape (a smaller preview of it)
  const cropped = num('height', 0) > 0 || sizeH > 0;
  const H = even(num('height', 0) > 0 ? num('height', 0) : sizeH > 0 ? (W * sizeH) / sizeW : (W * image.height) / image.width);
  // the part of the image in frame, as fractions of it (all of it unless cropped)
  const crop = cropped ? cropRect(image, W / H, (q.get('focus') || '0.5,0.5').split(',').map(Number)) : { x: 0, y: 0, w: 1, h: 1 };
  const original = image;
  if (cropped) image = cropTo(image, crop);
  const maps = deriveMaps(image);
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
  const marks = marksImg ? marksOnGrid(cropTo(marksImg, crop), grid) : null;
  // the scene is judged on the sky as found; the marks only change what moves
  const foundSky = skyMode === 'off' ? null : skyMask(grid);
  const sky = marks && foundSky ? skyMask(grid, marks) : foundSky;
  const wanted = q.get('scene')?.trim().toLowerCase() || 'auto';
  // (an unknown name is refused rather than guessed: an old snow or rain link would otherwise come out as water)
  if (wanted !== 'auto' && !SCENES.includes(wanted)) throw new LivingError(`There is no such scene. Use one of ${SCENES.map((s) => `<code>${s}</code>`).join(', ')}, or <code>auto</code>.`);
  const asked = wanted === 'auto' ? null : wanted;
  const pours = ['waterfall', 'steam', 'fire'].includes(asked);   // they read their own field (pour.js)
  const guess = asked ? null : classifyImage(image);
  let scene = asked ?? guess.kind;
  if (!asked && scene !== 'grass' && foundSky) {
    const under = classifyImage(image, foundSky).shares;
    scene = under.water >= 0.3 && (foundSky.seaBelow || guess.kind === 'water') ? 'water' : foundSky.share >= 0.2 ? 'sky' : scene;
  }
  if (scene === 'sky' && !foundSky) scene = null;
  if (!scene) {
    const pct = (v) => `${Math.round(v * 100)}%`;
    throw new LivingError(asked === 'sky'
      ? (skyMode === 'off' ? `scene=sky needs the sky: drop <code>sky=off</code>.`
        : `No sky found at the top of this image (it needs sky along most of the top edge), so nothing was generated.`)
      : `This doesn't look like grass, water or sky (green ${pct(guess.shares.grass)}, water ${pct(guess.shares.water)} of the frame), so nothing was generated. `
        + `If it is one of them, open it with <code>&scene=grass</code>, <code>&scene=water</code> or <code>&scene=sky</code>`
        + ` (a waterfall: <code>&scene=waterfall</code>; steam or smoke: <code>&scene=steam</code>; flames: <code>&scene=fire</code>; stars or lights at night: <code>&scene=twinkle</code>).`);
  }
  const flowing = scene !== 'grass';   // water and sky run on the water shader, waterfalls, steam, fire and twinkle on their own
  const loop = num('loop', 12), fps = num('fps', 30);
  // (letters of any script: 海滩 and 沙滩 export apart; run= keeps parallel renders of one photo apart)
  const clean = (s) => s.replace(/[^\p{L}\p{N}_-]/gu, '-');
  const run = q.get('run') ? `-${clean(q.get('run'))}` : '';
  const tag = (q.get('tag') && clean(q.get('tag'))) || clean(name.replace(/\.[^.]+$/, '')) + (cropped ? `-${W}x${H}` : '') + (flowing ? `-${scene}` : '') + run;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  // a build that fails past here must give the context back (the demo and
  // <living-photo> build again and again on one page)
  const build = () => {
    const common = { image, maps, width: W, height: H, wind, light: rad(num('light', 130)), amp: num('amp', 1) };
    const show = q.get('shore')?.trim().toLowerCase() === 'show';
    const field = scene === 'twinkle'
      ? buildTwinkle(renderer, { ...common, speed: num('speed', 1), loop, marks, grid, show })
      : pours
      ? buildPour(renderer, { ...common, kind: scene, speed: num('speed', 1), cycles: num('cycles', null), loop,
          marksImg: marksImg ? cropTo(marksImg, crop) : null, show })
      : flowing
      ? buildWater(renderer, {
          ...common, windGiven, stats: analyseWater(image, sky), churn: num('churn', null), drift: num('drift', null),
          wavelength: num('wavelength', null), cycles: num('cycles', null), speed: num('speed', 1), shore: q.get('shore')?.trim().toLowerCase(),
          grid, sky, skyOnly: scene === 'sky', skyShow: skyMode === 'show', cloud: rad(num('cloud', 0)), clouds: num('clouds', 1), haze: num('haze', null), marks, foundSky,
        })
      : buildField(renderer, { ...common, density: num('density', 1), marks, grid });
    return { field, post: makePost(renderer, W, H, field, style, asciiScale) };
  };
  let parts;
  try {
    parts = build();
  } catch (e) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw e;
  }
  const { field, post } = parts;

  // water reports its own heading (the swell's, which may not be the wind's)
  const info = `${W}×${H} · ${flowing ? field.info : `${field.count.toLocaleString()} strands · wind ${Math.round((wind * 180) / Math.PI)}°`}`;

  return {
    width: W, height: H, scene, loop, fps, tag, info, crop, original, field, post, renderer,
    // render the loop at phase t (0–1); frame only seeds the film grain
    step(t, frame = 0) {
      field.update(t);
      post.renderScene(frame);
    },
    // put that render on the canvas as 'ascii' or 'flow' (either, or both in turn)
    output(mode) { post.output(mode); },
    // change the ASCII look (ink, bg, cell, chars, charset) without building the scene again
    setAscii(next) { const s = asciiStyle(new URLSearchParams({ ...this.ascii, ...next })); post.setAsciiStyle(s); this.ascii = s; },
    ascii: style,
    draw(t, mode = 'ascii', frame = 0) { this.step(t, frame); post.output(mode); },
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// The ASCII look from the options (see ascii.js), refused when a value is not one it knows.
export function asciiStyle(q) {
  const pick = (k, list) => {
    const v = q.get(k)?.trim().toLowerCase();
    if (!v) return DEFAULT_STYLE[k];
    const ok = list.map(String);
    if (!ok.includes(v)) throw new LivingError(`<code>${k}</code> can be ${ok.map((o) => `<code>${o}</code>`).join(', ')}.`);
    return typeof DEFAULT_STYLE[k] === 'number' ? Number(v) : v;
  };
  const style = { ink: pick('ink', Object.keys(INKS)), bg: pick('bg', BGS), cell: pick('cell', CELLS), chars: pick('chars', CHARS), charset: q.get('charset') ?? '' };
  // characters of your own: charset alone is enough to ask for them
  if (style.charset.trim() && !q.get('chars')) style.chars = 'custom';
  if (style.chars === 'custom' && !style.charset.trim()) throw new LivingError('<code>chars=custom</code> needs the characters: <code>charset= .:-=+*#%@</code>, lightest first or in any order.');
  return style;
}

// The largest W:H window of the image, placed by focus (0–1 each way).
function cropRect(img, aspect, [fx = 0.5, fy = 0.5]) {
  let w = img.width, h = img.height;
  if (w / h > aspect) w = Math.round(h * aspect); else h = Math.round(w / aspect);
  const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  return { x: ((img.width - w) * clamp(fx)) / img.width, y: ((img.height - h) * clamp(fy)) / img.height, w: w / img.width, h: h / img.height };
}
// that window cut out of an image, at the image's own resolution (the marks
// are a different size from the photo, but the same shape)
export function cropTo(img, r) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(r.w * img.width)); cv.height = Math.max(1, Math.round(r.h * img.height));
  cv.getContext('2d').drawImage(img, r.x * img.width, r.y * img.height, r.w * img.width, r.h * img.height, 0, 0, cv.width, cv.height);
  return cv;
}
