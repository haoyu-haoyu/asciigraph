// A video drawn in ASCII. Each frame of the video is the colour the ASCII
// layer reads, and the strokes turn with what really moves: the motion between
// one frame and the next (optical flow, Lucas–Kanade over a small window, on
// a quarter-size copy) sets their heading, and where nothing moves they follow
// the picture's own edges. The motion is eased over a few frames so strokes
// don't flicker. Same shape as createLiving (living.js), so the page, the
// styles and the encoder work on it unchanged; a video has no loop to close,
// so it is drawn frame by frame instead of at a phase.
import * as THREE from 'three';
import { QUAD_VS } from './field.js';
import { makePost } from './post.js';
import { asciiStyle, LivingError } from './living.js';

export const MAX_SECONDS = 60;   // what the download takes at most (longer videos are cut there)
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

// the video's frame as linear colour (what the scene passes give the ASCII layer)
const COLOR_FS = /* glsl */`
  uniform sampler2D tVideo;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(pow(texture2D(tVideo, vUv).rgb, vec3(2.2)), 1.0); }`;

// luma on the small grid: the mean of 4×4 taps over each of its pixels, so
// fine texture in a large video doesn't shimmer (and read as motion)
const LUMA_FS = /* glsl */`
  uniform sampler2D tVideo; uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float s = 0.0;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++)
      s += dot(texture2D(tVideo, vUv + (vec2(x, y) - 1.5) * 0.25 * uTexel).rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(s / 16.0, 0.0, 0.0, 1.0);
  }`;

// Per small-grid pixel: the flow over a 5×5 window, as a doubled-angle vector
// (strokes have no front or back) with its weight, eased into the last result.
// y runs up, as in the ASCII layer.
const FLOW_FS = /* glsl */`
  uniform sampler2D tCur, tPrev, tLast; uniform vec2 uTexel; uniform float uEase;
  varying vec2 vUv;
  float cur(vec2 o) { return texture2D(tCur, vUv + o * uTexel).r; }
  float prev(vec2 o) { return texture2D(tPrev, vUv + o * uTexel).r; }
  vec2 dbl(vec2 v) { float n = dot(v, v); return n > 1e-12 ? vec2(v.x * v.x - v.y * v.y, 2.0 * v.x * v.y) / n : vec2(0.0); }
  void main() {
    float a = 0.0, b = 0.0, c = 0.0, p = 0.0, q = 0.0, it2 = 0.0;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(x, y);
      // gradients of both frames together, so a moving edge counts in each
      float ix = 0.25 * (cur(o + vec2(1, 0)) - cur(o - vec2(1, 0)) + prev(o + vec2(1, 0)) - prev(o - vec2(1, 0)));
      float iy = 0.25 * (cur(o + vec2(0, 1)) - cur(o - vec2(0, 1)) + prev(o + vec2(0, 1)) - prev(o - vec2(0, 1)));
      float it = cur(o) - prev(o);
      a += ix * ix; b += ix * iy; c += iy * iy; p += ix * it; q += iy * it; it2 += it * it;
    }
    // solve [a b; b c] v = -[p q]; a flat or one-way window (aperture) can't say
    float det = a * c - b * b, tr = a + c;
    vec2 v = vec2(0.0);
    if (det > 1e-7 && det > 0.02 * tr * tr) v = vec2(-(c * p - b * q), -(a * q - b * p)) / det;
    float speed = length(v);
    // real motion only: a change in brightness alone (a flicker, a fade) has none
    float moving = smoothstep(0.15, 0.9, speed) * smoothstep(0.0004, 0.004, it2 / 25.0);
    // still parts: along the strongest edge (across the gradient), weaker
    vec2 g = vec2(cur(vec2(1, 0)) - cur(vec2(-1, 0)), cur(vec2(0, 1)) - cur(vec2(0, -1)));
    float edge = 0.55 * smoothstep(0.03, 0.15, length(g));
    vec2 d = dbl(v) * moving + dbl(vec2(-g.y, g.x)) * edge * (1.0 - moving);
    float w = moving + edge * (1.0 - moving);
    vec3 now = vec3(d, w);
    gl_FragColor = vec4(mix(texture2D(tLast, vUv).rgb, now, uEase), 1.0);
  }`;

const COPY_FS = /* glsl */`
  uniform sampler2D tSrc; varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSrc, vUv); }`;

// canvas: where it draws; video: a <video> with its metadata loaded; params:
// the options (width, fps and the ASCII look: ink, bg, cell, chars, charset).
export function createVideoLiving({ canvas, video, params, name = 'video' }) {
  const q = params;
  const num = (k, d) => { const v = Number(q.get(k)?.trim() || NaN); return Number.isFinite(v) && v > 0 ? v : d; };
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) throw new LivingError('This video has no picture this browser can read.');
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new LivingError('This video doesn\'t say how long it is, so it can\'t be made into one. Try saving it as MP4 first.');
  const style = asciiStyle(q);
  const W = even(num('width', 1080)), H = even((W * vh) / vw);
  const fps = Math.min(60, num('fps', 30));
  const seconds = Math.min(video.duration, MAX_SECONDS);
  const frames = Math.max(1, Math.floor(seconds * fps));
  const tag = `${name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '-')}-video`;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  try {
    return build(renderer);
  } catch (e) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw e;
  }

  function build(renderer) {
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  // three sizes a texture of a <video> by its width attributes, 0 unless set
  // (a VideoTexture would size it, but starts a frame loop that dispose never stops)
  video.width = vw; video.height = vh;
  const tex = new THREE.Texture(video);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  // the flow runs on a quarter-size grid: steadier, and cheap at any size
  const sw = Math.max(16, Math.round(W / 4)), sh = Math.max(16, Math.round(H / 4));
  const small = () => new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  let lumaCur = small(), lumaPrev = small(), flowLast = small(), flowNext = small();
  const texel = new THREE.Vector2(1 / sw, 1 / sh);
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const colorMat = mat(COLOR_FS, { tVideo: { value: tex } });
  const lumaMat = mat(LUMA_FS, { tVideo: { value: tex }, uTexel: { value: texel } });
  const flowMat = mat(FLOW_FS, { tCur: { value: null }, tPrev: { value: null }, tLast: { value: null }, uTexel: { value: texel }, uEase: { value: 0.5 } });
  const copyMat = mat(COPY_FS, { tSrc: { value: null } });

  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colorMat);
  quad.frustumCulled = false;
  scene.add(quad);
  const pass = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    quad.material = colorMat;
  };

  let first = true;
  // a new frame from the video: upload it and move the flow on one step
  function advance() {
    tex.needsUpdate = true;
    [lumaCur, lumaPrev] = [lumaPrev, lumaCur];
    pass(lumaMat, lumaCur);
    if (first) { pass(lumaMat, lumaPrev); first = false; }   // (no motion into the first frame)
    const u = flowMat.uniforms;
    u.tCur.value = lumaCur.texture; u.tPrev.value = lumaPrev.texture; u.tLast.value = flowLast.texture;
    pass(flowMat, flowNext);
    [flowLast, flowNext] = [flowNext, flowLast];
  }
  const field = {
    scene, camera,
    renderDirection(target) { copyMat.uniforms.tSrc.value = flowLast.texture; pass(copyMat, target); },
  };
  const post = makePost(renderer, W, H, field, style);

  // Which frame is showing. A playing video's clock moves on every screen
  // refresh, not once a frame, so while it plays the frames it presents are
  // counted instead (requestVideoFrameCallback); a frame shown again is not
  // stillness. Their spacing also gives the video's own frame rate, which the
  // download uses so each of its frames is a new one. A paused video (the
  // download seeks one) is on whatever frame it was sought to.
  let shown = -1, presented = null, rate = null, handle = 0;
  const gaps = [];
  const watch = 'requestVideoFrameCallback' in video;
  const onFrame = (_, meta) => {
    if (presented != null) { const gap = meta.mediaTime - presented; if (gap > 0.005 && gap < 0.2) { gaps.push(gap); if (gaps.length > 30) gaps.shift(); } }
    presented = meta.mediaTime;
    if (gaps.length >= 10) rate = 1 / [...gaps].sort((x, y) => x - y)[gaps.length >> 1];
    handle = video.requestVideoFrameCallback(onFrame);
  };
  if (watch) handle = video.requestVideoFrameCallback(onFrame);
  const restart = () => { first = true; shown = -1; };
  return {
    width: W, height: H, fps, frames, seconds, tag, renderer, post, field, video,
    info: `${W}×${H} · ${Math.round(seconds)} s${video.duration > MAX_SECONDS ? ` (of ${Math.round(video.duration)} s)` : ''}`,
    // draw whatever frame the video is on now; frame only seeds the film grain
    draw(mode = 'ascii', frame = 0) {
      const now = !video.paused && presented != null ? presented : video.currentTime;
      if (video.readyState >= 2 && now !== shown) {
        if (now < shown) restart();   // (looped back to the start: a cut, not movement)
        shown = now; advance();
      }
      post.renderScene(frame);
      post.output(mode);
    },
    // start the motion over (after a jump in the video, so it isn't read as movement)
    restart,
    // the video's own frame rate as it plays, rounded, or null until it is known
    get sourceFps() { return rate ? Math.round(rate) : null; },
    setAscii(next) { const s = asciiStyle(new URLSearchParams({ ...this.ascii, ...next })); post.setAsciiStyle(s); this.ascii = s; },
    ascii: style,
    dispose() {
      if (watch) video.cancelVideoFrameCallback(handle);
      for (const t of [lumaCur, lumaPrev, flowLast, flowNext]) t.dispose();
      for (const m of [colorMat, lumaMat, flowMat, copyMat]) m.dispose();
      tex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  }
}

// Go to time t (seconds) and wait until that frame can be read; a seek that
// never lands (a damaged file) fails after a while instead of waiting forever.
export function seekVideo(video, t, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (video.currentTime === t && video.readyState >= 2) { resolve(); return; }
    const end = (ok) => () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done); video.removeEventListener('error', fail);
      if (ok) resolve(); else reject(new LivingError('The video stopped reading partway.'));
    };
    const done = end(true), fail = end(false), timer = setTimeout(fail, timeout);
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

// The video's own sound, the first `seconds` of it, in stereo (surround is
// mixed down: AAC encoders here take one or two channels), or null when it
// has none or is too much to decode whole: the browser can only decode a
// file's sound all at once, and a long one takes gigabytes as samples.
export const MAX_SOUND_BYTES = 400e6, MAX_SOUND_SECONDS = 20 * 60;
export const soundTooBig = (file, duration) => file.size > MAX_SOUND_BYTES || duration > MAX_SOUND_SECONDS;
export async function videoSound(file, seconds, duration) {
  if (soundTooBig(file, duration)) return null;
  // (rendering the source through a context of the right length both cuts
  // it and mixes it down, with the browser's own channel mixing)
  let buf;
  try { buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await file.arrayBuffer()); } catch { return null; }
  const channels = Math.min(2, buf.numberOfChannels);
  const ctx = new OfflineAudioContext(channels, Math.max(1, Math.min(buf.length, Math.round(seconds * buf.sampleRate))), buf.sampleRate);
  const src = new AudioBufferSourceNode(ctx, { buffer: buf });
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
