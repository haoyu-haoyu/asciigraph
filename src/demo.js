// The drop-a-photo page (demo.html): everything runs here in the browser,
// the photo is never uploaded, and the MP4 is encoded here too (encode.js),
// so the page works as plain static files.
import { createLiving, LivingError, asciiStyle } from './living.js';
import { encodeLoop, canEncode } from './encode.js';
import { sceneSound, playSound } from './sound.js';

const PREVIEW = 720;   // preview width; the download is full size
const SAMPLES = [
  { file: 'examples/beach.png', en: 'Beach', zh: '海滩' },
  { file: 'examples/grass.png', en: 'Grass', zh: '草地' },
];
const ZH = {
  tagline: '拖进一张照片，它就会动起来，变成无缝循环。照片不会离开你的浏览器。',
  drop: '把照片拖到这里，或点击选择', or: '或者试试：', scene: '场景', auto: '按照片自动判断',
  water: '水面、海、河', sky: '天空和云', grass: '草地、田野', waterfall: '瀑布', steam: '蒸汽、烟、雾', fire: '火焰、蜡烛', twinkle: '星空、夜景灯光',
  size: '尺寸', photo: '照片原比例', flowview: '照片',
  soundoff: '声音：关', soundon: '声音：开', export: '下载 MP4',
  footer: '每段循环 12 秒，首尾无缝衔接。下载的尺寸按你选的来；4K 要几分钟。',
  making: '正在生成', encoding: (d, n) => `正在编码 ${d}/${n}`, saved: '已生成：', noEncode: '这个浏览器不能直接导出视频，请用新版 Chrome、Edge 或 Safari。',
  asciistyle: 'ASCII 样式', ink: '颜色', inkphoto: '照片原色', inkgreen: '绿色荧光', inkamber: '琥珀色', inkwhite: '白色', inkpaper: '白底黑字',
  chars: '字符', charsstrokes: '顺着运动方向的笔画', charsclassic: '经典 ASCII  .:-=+*#@', charsblocks: '明暗方块 ░▒▓█', charsbraille: '盲文点阵 ⣿', charscustom: '自定义字符…',
  charset: '用哪些字符（顺序随意）', cell: '字符大小', bg: '背景', bgglow: '底光', bgplain: '纯黑',
  loadFail: '这张图片打不开。', pickScene: '如果它是其中一种，请在"场景"里选上。', soundNote: '（含声音）',
};
const zh = /^zh/i.test(navigator.language);
const t = (k, ...a) => { const v = zh ? ZH[k] : null; return typeof v === 'function' ? v(...a) : v; };
if (zh) {
  document.documentElement.lang = 'zh-CN';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t) ?? el.textContent;
}
const say = (k, en, ...a) => t(k, ...a) ?? (typeof en === 'function' ? en(...a) : en);

const $ = (id) => document.getElementById(id);
const stage = $('stage'), msg = $('msg'), status = $('status'), bar = $('progress');
// the ASCII look (ascii.js); only what differs from the default goes in the options
const DEFAULT_STYLE = { ink: 'photo', bg: 'glow', cell: '1', chars: 'strokes', charset: '' };
const style = { ...DEFAULT_STYLE };
let applied = { ...DEFAULT_STYLE };   // the last style the canvas took: what the preview and the download use
let photo = null, name = 'photo', living = null, mode = 'ascii', stopSound = null, start = performance.now(), busy = false;
const phase = () => (living ? (((performance.now() - start) / 1000) % living.loop) / living.loop : 0);

function options(full) {
  const p = new URLSearchParams();
  if ($('scene').value) p.set('scene', $('scene').value);
  const size = $('size').value;
  if (size) p.set('size', size);
  // the preview keeps the shape at a smaller width; the download is full size
  for (const [k, v] of Object.entries(applied)) if (v !== DEFAULT_STYLE[k] && !(k === 'bg' && applied.ink === 'paper')) p.set(k, v);
  if (!full) p.set('width', PREVIEW);
  else if (!size) p.set('width', photo.width >= photo.height ? 1440 : 1080);
  return p;
}

function rebuild() {
  if (!photo) return;
  stopSound?.(); stopSound = null; setSoundLabel();
  living?.dispose();
  stage.querySelector('canvas')?.remove();
  const canvas = document.createElement('canvas');
  stage.prepend(canvas);
  msg.innerHTML = '';
  try {
    living = createLiving({ canvas, image: photo, params: options(false), name });
    start = performance.now();
    $('export').disabled = busy || !canEncode();
    status.textContent = canEncode() ? living.info : say('noEncode', "This browser can't make video files: try a recent Chrome, Edge or Safari.");
  } catch (e) {
    living = null; canvas.remove();
    $('export').disabled = true;
    // the page's advice names URL options; here the answer is the Scene list
    if (e instanceof LivingError) msg.innerHTML = e.html.replace(/ If it is one of them.*$/, ` ${say('pickScene', 'If it is one of them, pick it under Scene.')}`);
    else { msg.textContent = String(e.message || e); console.error(e); }
  }
}

function tick() {
  if (living) living.draw(phase(), mode, Math.floor(performance.now() / 33));
  requestAnimationFrame(tick);
}

// the latest choice wins, even if an earlier, larger photo finishes decoding
// later; a dropped photo's object URL is let go once the next one replaces it
let pick = 0, photoURL = null;
async function usePhoto(src, fileName) {
  const mine = ++pick;
  const img = new Image();
  img.src = src;
  try { await img.decode(); } catch {
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    if (mine === pick) msg.textContent = say('loadFail', "This image couldn't be opened.");
    return;
  }
  if (mine !== pick) { if (src.startsWith('blob:')) URL.revokeObjectURL(src); return; }
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoURL = src.startsWith('blob:') ? src : null;
  photo = img; name = fileName;
  rebuild();
}

// choosing a photo
const fileInput = $('file'), drop = $('drop');
drop.onclick = () => fileInput.click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } };
fileInput.onchange = () => { const f = fileInput.files[0]; if (f) usePhoto(URL.createObjectURL(f), f.name); };
for (const ev of ['dragenter', 'dragover']) addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
addEventListener('drop', (e) => { const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) usePhoto(URL.createObjectURL(f), f.name); });
const samples = document.querySelector('.samples');
for (const s of SAMPLES) {
  const b = document.createElement('button');
  b.textContent = zh ? s.zh : s.en;
  b.onclick = () => usePhoto(s.file, s.file.split('/').pop());
  samples.append(b);
}
for (const id of ['scene', 'size']) $(id).onchange = rebuild;

// view and sound
for (const m of ['ascii', 'flow']) {
  $(`m-${m}`).onclick = () => {
    mode = m;
    for (const n of ['ascii', 'flow']) $(`m-${n}`).setAttribute('aria-pressed', String(n === m));
    $('asciiopts').hidden = m !== 'ascii';
  };
}

// the ASCII style: the colour and background change at once, the cells and
// characters rebuild only the ASCII layer, not the scene
function restyle() {
  $('charsetrow').hidden = style.chars !== 'custom';
  for (const b of $('bg').children) b.disabled = style.ink === 'paper';   // (paper is its own background)
  try {
    if (living) living.setAscii(style); else asciiStyle(new URLSearchParams(style));   // (checked even before there is a photo)
    applied = { ...style };
    msg.textContent = '';
  } catch (e) {
    if (e instanceof LivingError) msg.innerHTML = e.html; else { msg.textContent = String(e.message || e); console.error(e); }
  }
}
for (const id of ['ink', 'cell', 'bg']) {
  for (const b of $(id).children) {
    b.onclick = () => {
      style[id] = b.dataset.v;
      for (const o of $(id).children) o.setAttribute('aria-pressed', String(o === b));
      restyle();
    };
  }
}
$('chars').onchange = () => {
  style.chars = $('chars').value;
  style.charset = style.chars === 'custom' ? $('charset').value : '';
  restyle();
};
let typing = 0;
$('charset').oninput = () => {
  clearTimeout(typing);
  typing = setTimeout(() => { if (style.chars === 'custom') { style.charset = $('charset').value; restyle(); } }, 250);
};
function setSoundLabel() {
  const on = !!stopSound;
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound').textContent = on ? say('soundon', 'Sound: on') : say('soundoff', 'Sound: off');
}
let lastVideo = null;
const soundCache = new Map();
const soundFor = (l) => {
  // exactly as long as the video's whole frames
  const loop = Math.round(l.loop * l.fps) / l.fps, key = `${l.scene}/${loop}`;
  if (!soundCache.has(key)) soundCache.set(key, sceneSound(l.scene, { loop }));
  return soundCache.get(key);
};
$('sound').onclick = () => {
  if (stopSound) { stopSound(); stopSound = null; } else if (living) stopSound = playSound(soundFor(living), phase);
  setSoundLabel();
};

// download: built again at full size on a canvas of its own
$('export').onclick = async () => {
  if (!photo || busy) return;
  busy = true; $('export').disabled = true;
  bar.style.display = 'block'; bar.firstElementChild.style.width = '0';
  status.textContent = say('making', 'Making');
  const canvas = document.createElement('canvas');
  let full = null;
  try {
    full = createLiving({ canvas, image: photo, params: options(true), name });
    const sound = stopSound ? soundFor(full) : null;
    const blob = await encodeLoop(full, {
      mode, sound,
      onProgress: (d, n) => { bar.firstElementChild.style.width = `${(100 * d) / n}%`; status.textContent = say('encoding', (a, b) => `Encoding ${a}/${b}`, d, n); },
    });
    const file = `${full.tag}-${mode}.mp4`;
    const a = document.createElement('a');
    if (lastVideo) URL.revokeObjectURL(lastVideo);   // a 4K loop can be hundreds of MB
    a.href = lastVideo = URL.createObjectURL(blob); a.download = file; a.textContent = file;
    status.textContent = say('saved', 'Saved: ');
    status.append(a, sound ? say('soundNote', ' (with sound)') : '');
    a.click();
  } catch (e) {
    console.error(e);
    status.textContent = String(e.message || e);
  } finally {
    full?.dispose();
    busy = false; $('export').disabled = !living;
    bar.style.display = 'none';
  }
};

usePhoto(SAMPLES[0].file, 'beach.png');
tick();
