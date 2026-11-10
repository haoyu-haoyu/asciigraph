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
  footer: '照片循环首尾无缝衔接，4K 要几分钟。视频最长下载 60 秒。',
  rescene: '不对？手动选场景', more: '更多设置', amp: '运动强度', amplow: '轻', ampmid: '正常', amphigh: '强',
  looplen: '循环时长', s6: '6 秒', s12: '12 秒', s20: '20 秒', focus: '保留哪一部分', middle: '中间', left: '左边', right: '右边', top: '上面', bottom: '下面',
  err_noscene: (g, w) => `认不出这张照片是哪种场景（绿色占 ${g}，水面占 ${w}）。它是哪一种？`,
  err_nosky: '照片顶部没有找到天空，不能用“天空和云”。它是哪一种？',
  err_nocharset: '请至少输入一个字符。',
  err_novideo: '这个浏览器读不出这段视频的画面。',
  err_noduration: '这段视频没有标明时长，处理不了。可以先另存为 MP4 再试。',
  err_videostopped: '视频读到一半停了，请再试一次。',
  making: '正在生成', encoding: (d, n) => `正在编码 ${d}/${n}`, saved: '已生成：', noEncode: '这个浏览器不能直接导出视频，请用新版 Chrome、Edge 或 Safari。',
  galtitle: '能做出什么', galsub: '这些循环都是用 asciigraph 做的。标着 ASCII 的是字符画，其余是照片本身在动。把你自己的照片放进上面的工具，就能做一段。',
  seegallery: '看看能做出什么 ↓', moving: '动态照片', galpause: '暂停动画', galplay: '播放动画',
  faqtitle: '常见问题',
  q1: '照片会上传到哪里吗？', a1: '不会。整个过程都在你的浏览器里完成，照片、视频、动画和下载的 MP4 都不会离开你的设备。',
  q2: '什么样的照片效果最好？', a2: '水面、天空、草地、瀑布、蒸汽、火焰、星空或夜景灯光占画面大部分的照片。如果认不出画面里是什么，可以自己选场景。',
  q3: '支持哪些文件？', a3: '浏览器能打开的照片都可以，比如 JPG、PNG、WebP。MP4、MOV、WebM 等视频也能写成 ASCII，最长可下载 60 秒。',
  q4: '下载要多久？', a4: '照片原比例的循环（横图宽 1440，竖图宽 1080）一般几秒到一分钟以内；4K 可能要几分钟，期间请保持页面打开。',
  q5: '手机能用吗？', a5: '能，手机上可以预览。下载 MP4 需要能编码视频的新版浏览器，比如 Chrome、Edge 或 Safari。',
  q6: '为什么循环接头处看不出跳动？', a6: '循环里的每一种运动（浪涌、漂流、闪烁）都正好转整数圈，所以最后一帧能直接接回第一帧。',
  sitefoot: 'asciigraph · 全部在你的浏览器里运行',
  look: '样式', pphoto: '原色', pterminal: '终端', pink: '墨迹', pdots: '点阵', finetune: '细调字符', ink: '颜色', inkphoto: '照片原色', inkgreen: '绿色荧光', inkamber: '琥珀色', inkwhite: '白色', inkpaper: '白底黑字',
  chars: '字符', charsstrokes: '顺着运动方向的笔画', charsclassic: '经典 ASCII  .:-=+*#@', charsblocks: '明暗方块 ░▒▓█', charsbraille: '盲文点阵 ⣿', charscustom: '自定义字符…',
  charset: '用哪些字符（顺序随意）', cell: '字符大小', bg: '背景', bgglow: '底光', bgplain: '纯黑',
  loadFail: '这张图片打不开。', videoFail: '这个视频打不开，换成 MP4 试试。', clipsoundoff: '原声：关', soundTooBig: '（没有声音：文件太大或太长，读不了它的声音）', clipsoundon: '原声：开', soundNote: '（含声音）',
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
// a photo's motion, loop length and, with a size, which part of it to keep (the defaults go unsaid)
const DEFAULT_MORE = { amp: '1', loop: '12', focus: '0.5' };
const more = { ...DEFAULT_MORE };
let lastSides = null;
let photo = null, clip = null, name = 'photo', living = null, mode = 'ascii', stopSound = null, start = performance.now(), busy = false;
const phase = () => (living ? (((performance.now() - start) / 1000) % living.loop) / living.loop : 0);

// the download's width, and k: how many times the preview's
function widths() {
  const size = clip ? '' : $('size').value;
  const [w, h] = clip ? [clip.video.videoWidth, clip.video.videoHeight] : [photo.width, photo.height];
  const full = size ? SIZES[size][0] : w >= h ? 1440 : 1080;
  return { full, k: Math.max(1, Math.round(full / PREVIEW)) };
}

// with a size, whether the crop cuts the photo's sides (else its top and bottom); null when it cuts nothing
function cutsSides() {
  const size = clip || !photo ? '' : $('size').value;
  if (!size) return null;
  const [sw, sh] = SIZES[size], a = photo.width / photo.height;
  return Math.abs(a - sw / sh) < 0.01 ? null : a > sw / sh;
}

function options(full) {
  const p = new URLSearchParams();
  // (a video has no scene or size: it keeps its own shape)
  if ($('scene').value && !clip) p.set('scene', $('scene').value);
  const size = clip ? '' : $('size').value;
  if (size) p.set('size', size);
  if (!clip) {
    for (const k of ['amp', 'loop']) if (more[k] !== DEFAULT_MORE[k]) p.set(k, more[k]);
    const sides = cutsSides();
    if (sides !== null && more.focus !== DEFAULT_MORE.focus) p.set('focus', sides ? `${more.focus},0.5` : `0.5,${more.focus}`);
  }
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
  $('more').hidden = $('rescene').hidden = !!clip;
  const sides = cutsSides();
  // (a choice of side doesn't carry over to top and bottom, or back)
  if (sides !== null && lastSides !== null && sides !== lastSides && more.focus !== DEFAULT_MORE.focus) {
    more.focus = DEFAULT_MORE.focus;
    for (const o of $('focus').children) o.setAttribute('aria-pressed', String(o.dataset.v === more.focus));
    return rebuild();
  }
  if (sides !== null) lastSides = sides;
  $('focusrow').hidden = sides === null;
  if (sides !== null) [$('focus').children[0].textContent, $('focus').children[2].textContent] = sides ? [say('left', 'Left'), say('right', 'Right')] : [say('top', 'Top'), say('bottom', 'Bottom')];
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
    scheduleThumbs();
    if (!busy) status.textContent = canEncode() ? '' : say('noEncode', "This browser can't make video files: try a recent Chrome, Edge or Safari.");
  } catch (e) {
    living = null; canvas.remove(); stage.classList.add('empty'); clearThumbs();
    $('current').hidden = true;
    $('export').textContent = say('export', 'Download MP4');
    clip?.video.pause();
    $('export').disabled = true;
    showError(e);
  }
}

// an error in the page's language; when the scene couldn't be told (or there
// is no sky for the one asked), the scenes to pick from follow it
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const ERRORS = {
  noscene: (d) => say('err_noscene', (g, w) => `Couldn't tell what this photo shows (green ${g}, water ${w} of the frame). Which is it?`, pct(d.grass), pct(d.water)),
  nosky: () => say('err_nosky', "No sky found along the top of this photo, so it can't be a sky scene. Which is it?"),
  nocharset: () => say('err_nocharset', 'Type at least one character to use.'),
  novideo: () => say('err_novideo', "This browser can't read the picture in this video."),
  noduration: () => say('err_noduration', "This video doesn't say how long it is. Try saving it as MP4 first."),
  videostopped: () => say('err_videostopped', 'The video stopped reading partway: try again.'),
};
function errorText(e) {
  if (!(e instanceof LivingError)) console.error(e);
  return e instanceof LivingError && ERRORS[e.code] ? ERRORS[e.code](e.data) : String(e?.message || e);
}
function showError(e) {
  msg.textContent = errorText(e);
  if (!['noscene', 'nosky'].includes(e?.code) || !photo) return;
  const picks = document.createElement('div');
  picks.className = 'picks';
  for (const o of $('scene').options) {
    if (!o.value || (e.code === 'nosky' && o.value === 'sky')) continue;
    const b = document.createElement('button');
    b.textContent = o.textContent;
    b.onclick = () => { $('scene').value = o.value; rebuild(); $('scene').focus(); };
    picks.append(b);
  }
  msg.append(picks);
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
  $('scene').value = '';   // (a scene picked for the last photo is guessed afresh for this one)
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

// what it makes: loops that load and play only while they are on screen, and
// not at all under reduced motion or while the visitor has paused them
const GALLERY = [
  { id: 'coast', ascii: true, en: ['Coast', 'Waves roll in; the cliff stays still.'], zh: ['海岸', '浪往岸上涌，悬崖不动。'] },
  { id: 'clouds', ascii: true, en: ['Clouds', 'Nothing but sky, drifting.'], zh: ['云', '整片天空在缓缓飘。'] },
  { id: 'rice', ascii: true, en: ['Rice field', 'The whole field bends in the wind.'], zh: ['稻田', '整片稻子随风起伏。'] },
  { id: 'surf', en: ['Surf', 'Foam runs up the sand and slides back.'], zh: ['浪花', '白沫冲上沙滩，又退回去。'] },
  { id: 'waterfall', en: ['Waterfall', 'The water falls and the pool ripples; the rock stays.'], zh: ['瀑布', '水往下落，潭面起涟漪，岩石不动。'] },
  { id: 'campfire', en: ['Campfire', 'Flames rise and break off; the logs stay put.'], zh: ['篝火', '火苗往上窜、断开，木柴不动。'] },
  { id: 'stars', en: ['Starry sky', 'The brightest stars flare the most.'], zh: ['星空', '越亮的星闪得越明显。'] },
  { id: 'steam', en: ['Steam', 'It rises along its own curls.'], zh: ['蒸汽', '顺着自己的卷曲往上升。'] },
];
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');
const onScreen = new Set();
let galPaused = false;
const playIt = (v) => { if (!stillMotion.matches && !document.hidden && !galPaused) v.play().catch(() => {}); };
const shown = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting) {
      if (!v.src) { v.poster = v.dataset.poster; v.src = v.dataset.src; }
      onScreen.add(v); playIt(v);
    } else { onScreen.delete(v); v.pause(); }
  }
}, { rootMargin: '200px' });
// (a page opened in a background tab starts them when it is looked at, and a
// change to reduced motion stops or starts them)
const replay = () => { for (const v of onScreen) if (stillMotion.matches || galPaused) v.pause(); else playIt(v); };
const setPauseLabel = () => {
  $('galpause').setAttribute('aria-pressed', String(galPaused));
  $('galpause').textContent = galPaused ? say('galplay', 'Play the loops') : say('galpause', 'Pause the loops');
};
$('galpause').onclick = () => { galPaused = !galPaused; setPauseLabel(); replay(); };
document.addEventListener('visibilitychange', replay);
stillMotion.addEventListener('change', replay);
for (const g of GALLERY) {
  const [title, line] = zh ? g.zh : g.en, base = `examples/gallery/${g.id}`;
  const fig = document.createElement('figure');
  fig.className = 'card';
  const v = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'none' });
  Object.assign(v.dataset, { src: `${base}.mp4`, poster: `${base}.jpg` });
  v.setAttribute('aria-hidden', 'true');   // (the caption says what it shows)
  const cap = document.createElement('figcaption');
  const b = document.createElement('b'), tag = document.createElement('i'), sub = document.createElement('span');
  b.textContent = title; tag.className = 'tag'; tag.textContent = g.ascii ? 'ASCII' : say('moving', 'Moving photo'); b.append(tag);
  sub.textContent = line;
  cap.append(b, sub);
  fig.append(v, cap);
  $('galgrid').append(fig);
  shown.observe(v);
}
// the guess was wrong: straight to the Scene list
$('rescene').onclick = () => { $('scene').focus(); try { $('scene').showPicker(); } catch { /* (not every browser opens it from a click) */ } };
for (const id of ['amp', 'loop', 'focus']) {
  for (const b of $(id).children) {
    b.onclick = () => {
      more[id] = b.dataset.v;
      for (const o of $(id).children) o.setAttribute('aria-pressed', String(o === b));
      rebuild();
    };
  }
}

// view and sound
for (const m of ['ascii', 'flow']) {
  $(`m-${m}`).onclick = () => {
    mode = m;
    for (const n of ['ascii', 'flow']) $(`m-${n}`).setAttribute('aria-pressed', String(n === m));
    $('asciiopts').hidden = m !== 'ascii';
    if (m === 'ascii') scheduleThumbs();
  };
}

// the ASCII style: the colour and background change at once, the cells and
// characters rebuild only the ASCII layer, not the scene
// four looks, each a whole style (the fine controls below can still change any one part)
const PRESETS = {
  photo: { ink: 'photo', chars: 'strokes', bg: 'glow' },
  terminal: { ink: 'green', chars: 'classic', bg: 'plain' },
  ink: { ink: 'paper', chars: 'blocks', bg: 'glow' },     // (paper is its own background)
  dots: { ink: 'white', chars: 'braille', bg: 'plain' },
};
const presetOf = (s) => Object.keys(PRESETS).find((k) => {
  const p = PRESETS[k];
  return p.ink === s.ink && p.chars === s.chars && (s.ink === 'paper' || p.bg === s.bg);
}) ?? null;
// every control shows the style as it is, whichever control changed it
function syncControls() {
  for (const id of ['ink', 'cell', 'bg']) for (const o of $(id).children) o.setAttribute('aria-pressed', String(o.dataset.v === style[id]));
  $('chars').value = style.chars;
  const k = presetOf(style);
  for (const b of $('presets').children) b.setAttribute('aria-pressed', String(b.dataset.p === k));
}
// each look's thumbnail: this moment of this picture drawn in that look, copied
// off the preview (which keeps its drawing buffer), a small square from the
// middle at about its own size, so the characters themselves show.
// Each look rebuilds the ASCII layer (a new glyph atlas and shaders), so it is
// done only when what the thumbnails show has changed, and only in the ASCII view.
let thumbsTimer = 0, thumbsKey = null;
const thumbKey = () => [name, clip ? 'video' : $('scene').value, $('size').value, more.focus, applied.cell].join('|');
function drawThumbs() {
  const cv = stage.querySelector('canvas');
  if (!living || !cv?.width) return;
  if (mode !== 'ascii') { thumbsKey = null; return; }        // (drawn when the ASCII view comes back)
  const key = thumbKey();
  if (key === thumbsKey) return;
  const keep = { ...applied }, frame = Math.floor(performance.now() / 33), at = phase();
  const paint = (m) => (living.video ? living.draw(m, frame) : living.draw(at, m, frame));
  // (the look in use goes last, so putting it back costs no rebuild)
  const order = [...$('presets').children].sort((a, b) => (a.dataset.p === presetOf(keep)) - (b.dataset.p === presetOf(keep)));
  try {
    for (const b of order) {
      living.setAscii({ ...keep, ...PRESETS[b.dataset.p], charset: '' });
      paint('ascii');
      const t = b.querySelector('canvas'), g = t.getContext('2d');
      const s = Math.min(cv.width, cv.height, 96 * Number(keep.cell || 1));
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, Math.round((cv.width - s) / 2), Math.round((cv.height - s) / 2), s, s, 0, 0, t.width, t.height);
    }
    thumbsKey = key;
  } catch (e) {
    console.error(e);
  } finally {
    living.setAscii(keep);
    paint(mode);
  }
}
// (a video's first moments are often dark or fading in: its thumbnails wait a little longer)
const scheduleThumbs = () => { clearTimeout(thumbsTimer); thumbsTimer = setTimeout(drawThumbs, clip ? 1500 : 400); };
const clearThumbs = () => { thumbsKey = null; for (const t of $('presets').querySelectorAll('canvas')) t.getContext('2d').clearRect(0, 0, t.width, t.height); };

function restyle() {
  const cellWas = applied.cell;
  syncControls();
  $('charsetrow').hidden = style.chars !== 'custom';
  for (const b of $('bg').children) b.disabled = style.ink === 'paper';   // (paper is its own background)
  try {
    if (living) living.setAscii(style); else asciiStyle(new URLSearchParams(style));   // (checked even before there is a photo)
    applied = { ...style };
    if (living && cellWas !== style.cell) scheduleThumbs();   // (the looks are shown at this character size)
    // (a photo that made nothing tries again, which puts back its own error and scenes to pick)
    if (living || !photo) msg.textContent = ''; else rebuild();
  } catch (e) {
    // the controls go back to the style the picture still has; only a custom
    // character set being typed stays, so it can be finished
    Object.assign(style, applied, style.chars === 'custom' ? { chars: 'custom', charset: style.charset } : {});
    syncControls();
    showError(e);
  }
}
for (const id of ['ink', 'cell', 'bg']) for (const b of $(id).children) b.onclick = () => { style[id] = b.dataset.v; restyle(); };
for (const b of $('presets').children) b.onclick = () => { Object.assign(style, PRESETS[b.dataset.p], { charset: '' }); restyle(); };
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
    status.textContent = errorText(e);
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
    status.textContent = errorText(e);
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
