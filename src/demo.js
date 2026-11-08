// The drop-a-photo page (demo.html): everything runs here in the browser,
// the photo (or video, drawn in ASCII: video.js) is never uploaded, and the MP4 is encoded here too (encode.js),
// so the page works as plain static files.
import { createLiving, LivingError, asciiStyle, SIZES } from './living.js';
import { encodeLoop, encodeFrames, canEncode } from './encode.js';
import { createVideoLiving, seekVideo, videoSound, soundTooBig } from './video.js';
import { sceneSound, playSound } from './sound.js';

// The download is full size; the preview is about PREVIEW wide, a whole
// fraction (1/k) of it, and the download draws its characters k times as big,
// so it looks just like the preview, only sharper.
const PREVIEW = 720;
const SAMPLES = [
  { file: 'examples/beach.png', en: 'Beach', zh: '海滩' },
  { file: 'examples/grass.png', en: 'Grass', zh: '草地' },
];
const ZH = {
  tagline: '拖进一张照片，它就会动起来，变成无缝循环；拖进一段视频，它会变成 ASCII 动画。文件不会离开你的浏览器。',
  drop: '把照片或视频拖到这里，或点击选择', or: '或者试试：', scene: '场景', auto: '按照片自动判断',
  water: '水面、海、河', sky: '天空和云', grass: '草地、田野', waterfall: '瀑布', steam: '蒸汽、烟、雾', fire: '火焰、蜡烛', twinkle: '星空、夜景灯光',
  step1: '选一张照片或一段视频', step2: '选效果', step3: '下载', details: '详细参数', view: '显示为',
  detected: (s) => `自动识别：${s}`, videosum: (s, d) => d ? `视频 · 下载前 ${s} 秒（共 ${d} 秒）` : `视频 · ${s} 秒`,
  wide: (w) => `宽 ${w}`, exportwith: (d, s) => `下载 MP4 · ${d} · ${s} 秒`, soundhint: '开着声音时，下载的视频也带声音。', cover: '松手即可打开',
  size: '尺寸', photo: '照片原比例', flowview: '原画面',
  soundoff: '声音：关', soundon: '声音：开', export: '下载 MP4',
  footer: '照片循环 12 秒，首尾无缝衔接，4K 要几分钟。视频最长下载 60 秒。',
  making: '正在生成', encoding: (d, n) => `正在编码 ${d}/${n}`, saved: '已生成：', noEncode: '这个浏览器不能直接导出视频，请用新版 Chrome、Edge 或 Safari。',
  asciistyle: 'ASCII 样式', ink: '颜色', inkphoto: '照片原色', inkgreen: '绿色荧光', inkamber: '琥珀色', inkwhite: '白色', inkpaper: '白底黑字',
  chars: '字符', charsstrokes: '顺着运动方向的笔画', charsclassic: '经典 ASCII  .:-=+*#@', charsblocks: '明暗方块 ░▒▓█', charsbraille: '盲文点阵 ⣿', charscustom: '自定义字符…',
  charset: '用哪些字符（顺序随意）', cell: '字符大小', bg: '背景', bgglow: '底光', bgplain: '纯黑',
  loadFail: '这张图片打不开。', videoFail: '这个视频打不开，换成 MP4 试试。', clipsoundoff: '原声：关', soundTooBig: '（没有声音：文件太大或太长，读不了它的声音）', clipsoundon: '原声：开', pickScene: '如果它是其中一种，请在"场景"里选上。', soundNote: '（含声音）',
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
let photo = null, clip = null, name = 'photo', living = null, mode = 'ascii', stopSound = null, start = performance.now(), busy = false;
const phase = () => (living ? (((performance.now() - start) / 1000) % living.loop) / living.loop : 0);

// the download's width, and k: how many times the preview's
function widths() {
  const size = clip ? '' : $('size').value;
  const [w, h] = clip ? [clip.video.videoWidth, clip.video.videoHeight] : [photo.width, photo.height];
  const full = size ? SIZES[size][0] : w >= h ? 1440 : 1080;
  return { full, k: Math.max(1, Math.round(full / PREVIEW)) };
}

function options(full) {
  const p = new URLSearchParams();
  // (a video has no scene or size: it keeps its own shape)
  if ($('scene').value && !clip) p.set('scene', $('scene').value);
  const size = clip ? '' : $('size').value;
  if (size) p.set('size', size);
  // the preview keeps the shape at a smaller width; the download is full size
  for (const [k, v] of Object.entries(applied)) if (v !== DEFAULT_STYLE[k] && !(k === 'bg' && applied.ink === 'paper')) p.set(k, v);
  // a video's download keeps its own frame rate, once the preview has measured it
  if (full && clip && living?.sourceFps) p.set('fps', living.sourceFps);
  const { full: fw, k } = widths();
  if (!full) p.set('width', Math.round(fw / k));
  else if (!size) p.set('width', fw);
  return p;
}

function rebuild() {
  if (!photo && !clip) return;
  stopSound?.(); stopSound = null; setSoundLabel();
  for (const id of ['scene', 'size']) $(id).closest('label').hidden = !!clip;
  living?.dispose();
  stage.querySelector('canvas')?.remove();
  const canvas = document.createElement('canvas');
  stage.prepend(canvas);
  msg.innerHTML = '';
  try {
    stage.classList.remove('empty');
    living = clip ? createVideoLiving({ canvas, video: clip.video, params: options(false), name }) : createLiving({ canvas, image: photo, params: options(false), name });
    start = performance.now();
    $('export').disabled = busy || !canEncode();
    showCurrent();
    if (!busy) status.textContent = canEncode() ? '' : say('noEncode', "This browser can't make video files: try a recent Chrome, Edge or Safari.");
  } catch (e) {
    living = null; canvas.remove(); stage.classList.add('empty');
    $('current').hidden = true;
    $('export').textContent = say('export', 'Download MP4');
    clip?.video.pause();
    $('export').disabled = true;
    // the page's advice names URL options; here the answer is the Scene list
    if (e instanceof LivingError) msg.innerHTML = e.html.replace(/ If it is one of them.*$/, ` ${say('pickScene', 'If it is one of them, pick it under Scene.')}`);
    else { msg.textContent = String(e.message || e); console.error(e); }
  }
}

// what is loaded, in words (the scene, or the video's length; the numbers
// under Details), and what the download will be
const sceneName = (s) => $('scene').querySelector(`option[value="${s}"]`)?.textContent ?? s;
function showCurrent() {
  $('current').hidden = false;
  $('curname').textContent = name;
  const secs = Math.max(1, Math.round(clip ? living.seconds : living.loop)), whole = clip ? Math.round(clip.video.duration) : 0;
  $('cursum').textContent = clip ? say('videosum', (s, d) => (d ? `Video · the first ${s} s of ${d} s` : `Video · ${s} s`), secs, whole > secs ? whole : 0)
    : $('scene').value ? sceneName(living.scene) : say('detected', (s) => `Looks like: ${s}`, sceneName(living.scene));
  $('info').textContent = living.info;
  const size = clip ? '' : $('size').value, dims = size ? SIZES[size].join('×') : say('wide', (w) => `${w} wide`, widths().full);
  $('export').textContent = say('exportwith', (d, s) => `Download MP4 · ${d} · ${s} s`, dims, secs);
}

function tick() {
  const frame = Math.floor(performance.now() / 33);
  if (living) { if (living.video) living.draw(mode, frame); else living.draw(phase(), mode, frame); }
  requestAnimationFrame(tick);
}

// the latest choice wins, even if an earlier, larger photo finishes decoding
// later; a dropped file's object URL is let go once the next one replaces it
let pick = 0, mediaURL = null;
function take(src, fileName) {
  if (mediaURL) URL.revokeObjectURL(mediaURL);
  mediaURL = src.startsWith('blob:') ? src : null;
  if (clip) { clip.video.pause(); clip.video.removeAttribute('src'); clip.video.load(); }
  photo = clip = null; name = fileName;
}
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
  take(src, fileName);
  photo = img;
  rebuild();
}
// a video plays muted on repeat in the preview; its sound is the Sound button's
// (one that never loads fails after a while, so the page isn't left waiting)
const loadVideo = (src) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto', src });
  const fail = () => { clearTimeout(timer); video.removeAttribute('src'); video.load(); reject(new LivingError(say('videoFail', "This video couldn't be opened: try it as an MP4."))); };
  const timer = setTimeout(fail, 20000);
  video.addEventListener('loadeddata', () => { clearTimeout(timer); video.removeEventListener('error', fail); resolve(video); }, { once: true });
  video.addEventListener('error', fail, { once: true });
});
async function useVideo(file) {
  const mine = ++pick, src = URL.createObjectURL(file);
  let video;
  try { video = await loadVideo(src); } catch {
    URL.revokeObjectURL(src);
    if (mine === pick) msg.textContent = say('videoFail', "This video couldn't be opened: try it as an MP4.");
    return;
  }
  if (mine !== pick) { URL.revokeObjectURL(src); return; }
  take(src, file.name);
  clip = { video, file, src };
  video.play().catch(() => {});
  rebuild();
}
// (some videos arrive with no type, so the name decides too)
const isVideo = (f) => f.type.startsWith('video/') || (!f.type && /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(f.name));
const useFile = (f) => { if (f && isVideo(f)) useVideo(f); else if (f) usePhoto(URL.createObjectURL(f), f.name); };

// choosing a photo
const fileInput = $('file'), drop = $('drop');
drop.onclick = () => fileInput.click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } };
fileInput.onchange = () => { useFile(fileInput.files[0]); fileInput.value = ''; };
// (a cover over the whole page while a file is dragged over it; enter and
// leave fire for every element crossed, so they are counted, and a leave that
// never arrives, from an element removed mid-drag, is caught by dragover going quiet)
let over = 0, quiet = 0;
const dragging = (n) => { over = n; drop.classList.toggle('over', n > 0); document.body.classList.toggle('dragging', n > 0); };
const files = (e) => e.dataTransfer?.types.includes('Files');
addEventListener('dragenter', (e) => { e.preventDefault(); if (files(e)) dragging(over + 1); });
addEventListener('dragover', (e) => { e.preventDefault(); if (!files(e)) return; dragging(Math.max(over, 1)); clearTimeout(quiet); quiet = setTimeout(() => dragging(0), 1200); });
addEventListener('dragleave', (e) => { e.preventDefault(); if (files(e)) dragging(Math.max(0, over - 1)); });
addEventListener('drop', (e) => { e.preventDefault(); dragging(0); });
addEventListener('drop', (e) => useFile([...e.dataTransfer.files].find((x) => x.type.startsWith('image/') || isVideo(x))));
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
// a photo's sound is made for its scene; a video's is its own
function setSoundLabel() {
  const on = clip ? !clip.video.muted : !!stopSound;
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound').textContent = clip ? (on ? say('clipsoundon', 'Its sound: on') : say('clipsoundoff', 'Its sound: off'))
    : on ? say('soundon', 'Sound: on') : say('soundoff', 'Sound: off');
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
  if (clip) clip.video.muted = !clip.video.muted;
  else if (stopSound) { stopSound(); stopSound = null; } else if (living) stopSound = playSound(soundFor(living), phase);
  setSoundLabel();
};

// the bar follows every frame; the words (read out by screen readers) every tenth of the way
function progress(d, n) {
  const pct = Math.round((100 * d) / n);
  bar.firstElementChild.style.width = `${pct}%`;
  if (Math.floor(pct / 10) !== Math.floor(+bar.getAttribute('aria-valuenow') / 10) || d === n) status.textContent = say('encoding', (a, b) => `Encoding ${a}/${b}`, d, n);
  bar.setAttribute('aria-valuenow', pct);
}

// download: built again at full size on a canvas of its own
$('export').onclick = async () => {
  if ((!photo && !clip) || busy) return;
  if (clip) { exportVideo(); return; }
  busy = true; $('export').disabled = true;
  bar.style.display = 'block'; bar.firstElementChild.style.width = '0'; bar.setAttribute('aria-valuenow', 0);
  status.textContent = say('making', 'Making');
  const canvas = document.createElement('canvas');
  let full = null;
  try {
    full = createLiving({ canvas, image: photo, params: options(true), name, asciiScale: widths().k });
    const sound = stopSound ? soundFor(full) : null;
    const blob = await encodeLoop(full, {
      mode, sound,
      onProgress: progress,
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

// a video's download: its frames read one by one from a copy of it, so the
// preview keeps playing, at a steady frame rate, with its own sound if it is on
async function exportVideo() {
  // (its own URL of the file: picking another file meanwhile lets go of the preview's)
  // (everything read now: the view, or even the file, may change while it runs)
  const { file } = clip, withSound = !clip.video.muted, src = URL.createObjectURL(file), params = options(true), look = mode, { k } = widths();
  busy = true; $('export').disabled = true;
  bar.style.display = 'block'; bar.firstElementChild.style.width = '0'; bar.setAttribute('aria-valuenow', 0);
  status.textContent = say('making', 'Making');
  let full = null, video = null;
  try {
    video = await loadVideo(src);
    full = createVideoLiving({ canvas: document.createElement('canvas'), video, params, name: file.name, asciiScale: k });
    const sound = withSound ? await videoSound(file, full.frames / full.fps, video.duration) : null;
    const tooBig = withSound && !sound && soundTooBig(file, video.duration);
    const last = video.duration - 1e-3;
    const blob = await encodeFrames(full, {
      frames: full.frames, mode: look, sound,
      // (mid-frame, so rounding never lands on the frame before)
      draw: async (i) => { await seekVideo(video, Math.min((i + 0.5) / full.fps, last)); full.draw(look, i); },
      onProgress: progress,
    });
    const name2 = `${full.tag}-${look}.mp4`;
    const a = document.createElement('a');
    if (lastVideo) URL.revokeObjectURL(lastVideo);
    a.href = lastVideo = URL.createObjectURL(blob); a.download = name2; a.textContent = name2;
    status.textContent = say('saved', 'Saved: ');
    status.append(a, sound ? say('soundNote', ' (with sound)') : tooBig ? say('soundTooBig', ' (no sound: the file is too big or too long to read its sound)') : '');
    a.click();
  } catch (e) {
    console.error(e);
    status.textContent = String(e.message || e);
  } finally {
    full?.dispose();
    video?.removeAttribute('src'); video?.load();
    URL.revokeObjectURL(src);
    busy = false; $('export').disabled = !living;
    bar.style.display = 'none';
  }
}

usePhoto(SAMPLES[0].file, 'beach.png');
tick();
