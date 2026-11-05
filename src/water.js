// Water: the photo is not rebuilt from strands but moved the way a sea moves.
// Three motions, from large to small:
//  - swell: a sum of Gerstner waves pushes the surface back and forth along
//    each wave's heading, so the picture bunches up under crests and spreads
//    in troughs, while the crests roll across as bands of light and shadow;
//  - churn: a divergence-free (curl) warp of loop-periodic noise makes the
//    foam boil and creep in place instead of sliding as one rigid sheet;
//  - drift: three copies of the image ride a static flow field a third
//    of a cycle apart and cross-fade (contrast lifted, so foam stays crisp).
// How much of each, and at what size, is read from the photo (waterstats.js):
// the swell is scaled to the photo's own dominant wave, foam is judged by its
// brightness percentiles, streaky photos drift more and chaotic ones churn
// more, and sun glints already in the photo are dimmed so they don't drift
// along with it (the shader makes its own).
// The waves' normals then refract the picture, shade it and throw sun glints.
// Dry land in the frame (shore.js) is left still: the moving water is
// cross-faded into the untouched photo where the shore mask says land.
// (Scaling the motion by the mask instead would fold the picture over along
// the shoreline, where the mask changes faster than the swell's push.)
// Every moving term is integer-periodic in the loop phase t, so the last
// frame flows straight into the first.
//
// Same interface as buildField: { scene, camera, count, update(t), renderDirection(target) },
// so the ASCII layer works unchanged. Its direction pass writes, per pixel, the
// heading the glyphs should follow: the moving texture's own direction in
// foam, the wave crests in open water.
import * as THREE from 'three';
import { QUAD_VS } from './field.js';
import { shoreMask, stillMask } from './shore.js';
import { maskTexture } from './masks.js';

// Swell relative to the wind: [heading offset (rad), wavenumber (waves per
// frame height), steepness]. Long waves carry most of the slope. The whole set
// is rescaled so its slope-weighted wavenumber K_REF lands on the photo's own.
const WAVE_SET = [
  [0.0, 1.7, 0.16], [0.3, 2.3, 0.13], [-0.35, 3.1, 0.11], [0.6, 4.2, 0.09],
  [-0.7, 5.6, 0.07], [0.15, 7.6, 0.05], [1.0, 10.5, 0.04], [-0.9, 14.0, 0.03],
];
const WAVES = WAVE_SET.length;
const K_REF = WAVE_SET.reduce((s, w) => s + w[1] * w[2], 0) / WAVE_SET.reduce((s, w) => s + w[2], 0);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const WATER_COMMON = /* glsl */`
  uniform sampler2D tImg, tMap, tShore;   // tShore r: 1 where the water moves, 0 on dry land; g: grass that sways
  uniform float uSway;             // how far grass leans in a gust (frame heights)
  // tSky r: sky, where the clouds drift instead; g: how much of the water's
  // motion is left (it calms just below the horizon)
  uniform sampler2D tSky;
  uniform vec2 uCloud;             // which way the clouds drift (unit, y up)
  uniform float uCloudDrift, uCloudCycles, uHorizon, uSkyShow;
  // a sea seen from the shore (uPersp 1): the water is a plane running off to
  // the horizon at uSeaLine (photo uv, y up), not a picture taken from above
  uniform float uPersp, uSeaLine;
  // ...where the photo's own waves roll in along uHeading (on that plane),
  // uWaveRun plane units per drift cycle, and the made-up swell only heaves
  // underneath them (uSwellK of its height), so its crests don't fight theirs
  uniform vec2 uHeading;
  uniform float uWaveRun, uSwellK;
  // ...and by the rocks (tShore b) the water surges up and drains back,
  // uSurge whole times per loop
  uniform float uSurge;
  uniform float uHaze;             // haze over the far sea, at the horizon itself (0–1)
  uniform vec2 uShoreTexel;        // one cell of tShore, in uv
  uniform vec2 uRes, uWind;
  uniform float uT, uLight, uAmp, uChurn, uDrift, uCycles, uHmax, uScale, uLod, uInset, uShow;
  uniform vec2 uFoam;              // linear-luma range that counts as foam
  uniform vec4 uWave[${WAVES}];   // xy: heading, z: wavenumber (per frame height), w: whole cycles per loop
  uniform float uSteep[${WAVES}];
  varying vec2 vUv;
  const float TAU = 6.28318530718;
  // past this the summed steepness folds the surface over (and shading goes negative)
  const float MAX_AMP = 1.4;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    // quintic fade: its slope is smooth across cells, so glints off it don't facet
    vec3 i = floor(x), f = fract(x), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), u.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y), u.z);
  }
  // Loop-periodic fbm: each octave walks a closed circle through the noise
  // volume (whole turns per loop, faster for finer octaves), so the pattern
  // evolves rather than just translating, and returns to where it started.
  float tfbm(vec2 p, float cyc) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), th = TAU * uT * cyc * (fi + 1.0);
      vec2 dir = vec2(cos(fi * 2.1), sin(fi * 2.1));
      s += a * noise3(vec3(p + dir * 0.7 * cos(th), 0.7 * sin(th) + fi * 17.0));
      p = p * 2.07 + 3.1; a *= 0.5;
    }
    return s / 0.875;
  }
  // divergence-free flow from a noise potential: foam swirls without bunching
  vec2 curl(vec2 p, float cyc) {
    const float e = 0.05;
    float c = tfbm(p, cyc);
    return vec2(tfbm(p + vec2(0.0, e), cyc) - c, -(tfbm(p + vec2(e, 0.0), cyc) - c)) / e;
  }
  vec2 isoOf(vec2 uv) { return vec2(uv.x * uRes.x / uRes.y, uv.y); }
  vec2 uvOfIso(vec2 d) { return vec2(d.x * uRes.y / uRes.x, d.y); }
  vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // One read of the photo, in linear light. A small bright speck on darker
  // water is a sun glint the camera caught: it would drift with the picture,
  // so it is filled in from its surroundings (uLod: the mip that is ~4 output
  // pixels across).
  vec3 photoAt(vec2 uv) {
    vec3 c = toLin(texture(tImg, uv).rgb), loc = toLin(textureLod(tImg, uv, uLod).rgb);
    float lc = luma(loc);
    float spot = smoothstep(0.15, 0.4, luma(c) - lc) * (1.0 - smoothstep(0.5 * uFoam.x, uFoam.x, lc));
    return mix(c, loc, spot);
  }
  // foam is bright for this photo and nearly colourless; bright but strongly
  // tinted water (a shallow lagoon) isn't foam
  float foamOf(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
    return smoothstep(uFoam.x, uFoam.y, luma(c)) * (1.0 - smoothstep(0.45, 0.8, sat));
  }

  // Where on the sea plane the photo position at lies, and how much a unit
  // there shrinks on screen (ps: 1 at the bottom of the frame, 0 at the
  // horizon). Plane units match frame heights at the bottom edge.
  vec2 seaPlane(vec2 at, out float ps) {
    ps = clamp((uSeaLine - at.y) / uSeaLine, 0.003, 1.0);
    return vec2((at.x - 0.5) * uRes.x / uRes.y, 1.0) / ps;
  }

  // A wave breaking on the rocks, in three beats: the water runs in at the
  // rock (short), strikes it, where the white water bursts and is thrown back
  // out, and then falls back, the foam spreading seaward and fading (long).
  // Each rock is struck at its own moment. Returns the push toward the rock
  // (negative: thrown back out) and, in white, how much burst foam shows;
  // dir: which way is toward the rock on screen (where the near-land band
  // grows, so the water is pushed at the land beside it, never pulled off it).
  float surgeAt(vec2 at, vec2 q, float ps, out vec2 dir, out float white) {
    dir = vec2(0.0); white = 0.0;
    vec4 sh = texture(tShore, at);
    float near = sh.r * sh.b;   // only on the water
    if (uPersp < 0.5 || uSurge < 0.5 || near < 0.01) return 0.0;
    vec2 e = uShoreTexel * 1.5;
    // (the gradient per uv, turned into one per frame height: d/dx_iso = d/du ÷ aspect)
    vec2 g = uvOfIso(vec2(texture(tShore, at + vec2(e.x, 0.0)).b - texture(tShore, at - vec2(e.x, 0.0)).b,
                          texture(tShore, at + vec2(0.0, e.y)).b - texture(tShore, at - vec2(0.0, e.y)).b) / e);
    // (eased out where the slope fades, rather than cut: no step at the edge of that)
    float gl = length(g);
    if (gl < 1e-3) return 0.0;
    dir = g / gl;
    near *= smoothstep(0.0, 1.0, gl);
    // where in this rock's wave we are, 0–1 (the water nearest the rock first)
    float s = fract(uSurge * uT - (1.0 - near) * 0.12 - fbm(q * 0.6) * 0.5);
    // push: runs in to 1 by s = 0.22, is thrown back to −0.6 by 0.38, then
    // eases back to rest over the rest of the wave (0 at s = 0 and 1: seamless)
    float push = s < 0.22 ? smoothstep(0.0, 0.22, s)
               : s < 0.38 ? mix(1.0, -0.6, smoothstep(0.22, 0.38, s))
               : -0.6 * (1.0 - smoothstep(0.38, 1.0, s));
    // the burst: flares as it strikes, spreads out from the rock as it falls
    // back (it reaches farther from the rock as it fades), patchy like foam
    float flare = smoothstep(0.18, 0.26, s) * (1.0 - smoothstep(0.26, 1.0, s));
    float reach = mix(0.6, 0.1, smoothstep(0.26, 0.9, s));
    float lace = smoothstep(0.25, 0.6, fbm(q * 9.0 + vec2(0.0, 3.0 * s)));
    // (far off a burst is small and its lace too fine to see: it would smear
    // into a flat white band along the coast, so it fades with distance)
    white = flare * smoothstep(reach, reach + 0.2, near) * lace * smoothstep(0.2, 0.55, ps);
    return near * push;
  }

  // Gerstner swell at q (frame-height units). Returns the horizontal
  // displacement in xy and the height in z; slope gets the height's gradient.
  // ps: how much a unit of q shrinks on screen here (1 seen from above). A wave
  // that would crowd finer than a few pixels fades out instead of shimmering.
  vec3 swell(vec2 q, float ps, out vec2 slope) {
    vec2 disp = vec2(0.0); float h = 0.0; slope = vec2(0.0);
    for (int i = 0; i < ${WAVES}; i++) {
      vec4 w = uWave[i];
      float px = uRes.y * ps * (uPersp > 0.5 ? uSeaLine * ps : 1.0) / w.z;   // its wavelength on screen, along the view
      float K = TAU * w.z, A = uSteep[i] * min(uAmp, MAX_AMP) / K * smoothstep(3.0, 8.0, px) * uSwellK;
      float ph = K * dot(q, w.xy) - TAU * w.w * uT + float(i) * 1.7;
      disp += w.xy * A * cos(ph);
      h += A * sin(ph);
      slope += w.xy * K * A * cos(ph);
    }
    return vec3(disp, h);
  }

  // Where to read the photo for this pixel after swell and churn, plus the
  // surface's normalised height and slope. at: where the still photo shows
  // this pixel; m: how much of it is water (1) rather than land (0).
  vec2 surface(vec2 uv, out float hn, out vec2 slope, out vec2 at, out float m) {
    // read from a frame inset by the largest total displacement, so the samples stay on the photo
    at = 0.5 + (uv - 0.5) * (1.0 - 2.0 * uvOfIso(vec2(uInset)));
    m = texture(tShore, at).r;
    float ps = 1.0;
    vec2 q = uPersp > 0.5 ? seaPlane(at, ps) : isoOf(uv);
    vec3 s = swell(q, ps, slope);
    hn = s.z / (uHmax * max(min(uAmp, MAX_AMP), 1e-3));
    // eddies scale with the swell: bigger waves, bigger and gentler eddies
    vec2 churn = (curl(q * 3.0 * uScale, 1.0) * 0.0035 + curl(q * 9.0 * uScale + 5.0, 2.0) * 0.0012) * uChurn / uScale;
    vec2 N = normalize(vec3(-slope, 1.0)).xy;
    vec2 d = s.xy + churn + N * 0.004;   // last term: refraction
    if (uPersp > 0.5) {
      // back from the plane to the screen: across, a unit shrinks with
      // distance (ps); along the line of sight, twice over (y = seaLine·(1 −
      // ps), so seaLine·ps²); and the crests rise as they pass. Far off the
      // surface reads as smooth.
      d = vec2(d.x * ps, d.y * uSeaLine * ps * ps + s.z * ps * 0.6);
      vec2 dir; float white; float push = surgeAt(at, q, ps, dir, white);
      d += dir * 0.007 * ps * push;
      float near = smoothstep(0.0, 0.25, ps);
      slope *= near; hn *= near;
    }
    return at - uvOfIso(d);
  }

  // Static flow field for the drift: mostly the wind, combed by the
  // texture's own direction where it is clear, and bent by slow eddies.
  vec2 flowAt(vec2 uv) {
    vec2 sv = texture(tMap, uv).ba * 2.0 - 1.0;
    float coh = length(sv);
    float th = 0.5 * atan(sv.y, sv.x + 1e-6);
    vec2 d = vec2(cos(th), sin(th));
    if (dot(d, uWind) < 0.0) d = -d;
    // d flips sign where the texture runs across the wind; fade the combing
    // out there so the displacement stays continuous instead of tearing
    float comb = 0.55 * smoothstep(0.05, 0.4, coh) * smoothstep(0.0, 0.5, dot(d, uWind));
    vec2 f = normalize(mix(uWind, d, comb));
    float eddy = (fbm(isoOf(uv) * 2.5 + 3.7) - 0.5) * 1.6;
    return rot(f, eddy) * (0.7 + 0.6 * fbm(isoOf(uv) * 1.7 + 11.0));
  }

  // The three drift phases, a third of a cycle apart: their offsets (uv) and
  // weights. Three rather than two so no copy ever carries the picture alone
  // and the copies sit closer together: a two-copy fade pumps where the
  // copies differ. Each weight, (1 − cos)/3, is 0 as its copy wraps and the
  // three sum to 1. Each pixel's cycle is shifted by a smooth static noise,
  // so the resets ripple across the frame instead of pulsing everywhere at once.
  void driftPhases(vec2 uv, out vec2 o0, out vec2 o1, out vec2 o2, out vec3 w) {
    vec2 f = uvOfIso(flowAt(uv)) * uDrift;
    if (uPersp > 0.5) {
      // a sea seen from the shore: the photo's waves themselves roll in,
      // along the heading on the sea plane, projected to the screen (across
      // shrinks by ps, along the view by seaLine·ps²), with a little of the
      // slow eddying on top so the run isn't rigid
      float ps = clamp((uSeaLine - uv.y) / uSeaLine, 0.0, 1.0);
      vec2 run = vec2(uHeading.x * ps, uHeading.y * uSeaLine * ps * ps) * uWaveRun;
      f = uvOfIso(run) + f * ps * 0.3;
    }
    float jit = fbm(isoOf(uv) * 1.3 + 27.0) * 1.5;
    vec3 p = fract(uT * uCycles + jit + vec3(0.0, 1.0, 2.0) / 3.0);
    o0 = f * (p.x - 0.5); o1 = f * (p.y - 0.5); o2 = f * (p.z - 0.5);
    w = (1.0 - cos(TAU * p)) / 3.0;
  }
  // the drifting copies cross-faded, with their contrast around the local
  // mean lifted a little so the foam stays crisp instead of ghosting (linear
  // light). With three copies the weights' energy is always the same (their
  // squares sum to ½), so the lift is a constant: no pumping, which a
  // two-copy fade's variance correction (it swings with the weights) had
  vec3 drifted(vec2 uv, vec2 o0, vec2 o1, vec2 o2, vec3 w) {
    vec3 mean = toLin(textureLod(tImg, uv, 5.0).rgb);
    vec3 c = mean + (photoAt(uv - o0) * w.x + photoAt(uv - o1) * w.y + photoAt(uv - o2) * w.z - mean) * 1.19;
    return max(c, 0.0);
  }

  // Clouds: two copies of the sky drift along uCloud half a cycle apart and
  // cross-fade, as the water's drift does, while a slow curl warp makes their
  // edges billow. Far clouds (near the horizon) creep, near ones (high up)
  // travel. A copy that would read from below the skyline would carry the
  // land up into the sky, so the still photo covers for it there (not the
  // other copy: its weight would jump when the first one wraps).
  // at: the photo position this pixel shows; returns the two reads and their
  // weights (what is left over goes to the still photo).
  void cloudReads(vec2 at, out vec2 a0, out vec2 a1, out float k0, out float k1) {
    float depth = 0.3 + 0.7 * smoothstep(uHorizon, 1.0, at.y);
    vec2 f = uvOfIso(uCloud) * uCloudDrift * depth;
    float jit = fbm(isoOf(at) * 1.1 + 41.0) * 1.5;
    float p0 = fract(uT * uCloudCycles + jit), p1 = fract(p0 + 0.5);
    vec2 billow = uvOfIso(curl(isoOf(at) * 2.0, 1.0)) * 0.003 * depth;
    a0 = at - f * (p0 - 0.5) + billow; a1 = at - f * (p1 - 0.5) + billow;
    float w0 = sin(3.14159265 * p0); w0 *= w0;   // smooth, as in driftPhases
    k0 = w0 * smoothstep(0.3, 0.8, texture(tSky, a0).r);
    k1 = (1.0 - w0) * smoothstep(0.3, 0.8, texture(tSky, a1).r);
  }
  vec3 cloudsAt(vec2 at) {
    vec2 a0, a1; float k0, k1;
    cloudReads(at, a0, a1, k0, k1);
    return toLin(texture(tImg, a0).rgb) * k0 + toLin(texture(tImg, a1).rgb) * k1 + toLin(texture(tImg, at).rgb) * (1.0 - k0 - k1);
  }

  // Grass on still land sways: gusts roll across it along the clouds' wind,
  // each leaning it downwind and letting it back, with a quicker flutter on
  // top. Only a pixel or two, so the hill stays put. Whole cycles per loop.
  vec2 swayAt(vec2 at) {
    float g = texture(tShore, at).g;
    if (g < 0.01) return vec2(0.0);
    vec2 q = isoOf(at);
    float gust = 0.5 + 0.5 * sin(TAU * 2.0 * uT - dot(q, uCloud) * 9.0 + 2.5 * fbm(q * 3.0));
    float flutter = sin(TAU * 5.0 * uT + 40.0 * fbm(q * 20.0));
    return uvOfIso(uCloud) * uSway * g * (0.75 * gust + 0.25 * flutter);
  }`;

const WATER_FS = /* glsl */`
  ${WATER_COMMON}

  void main() {
    float hn, m; vec2 slope, at;
    vec2 uv = surface(vUv, hn, slope, at, m);
    vec4 sky = texture(tSky, at);

    vec2 o0, o1, o2; vec3 w;
    driftPhases(uv, o0, o1, o2, w);
    vec3 c = drifted(uv, o0, o1, o2, w);
    float foam = foamOf(c);

    // fine chop on top of the swell, for the glints only; the swell tilts it
    // just a little, so glints sparkle along a whole face instead of filling it
    // (a sea in perspective: the chop lies on the sea plane, so its glints are
    // coarse up close and fine far off, and die out toward the horizon where
    // they would crowd finer than a pixel)
    float chopK = 1.0;
    vec2 cq = isoOf(vUv) * 28.0;
    if (uPersp > 0.5) { float ps; cq = seaPlane(at, ps) * 16.0; chopK = smoothstep(0.35, 0.7, ps); }
    float ch = tfbm(cq, 3.0);
    vec2 cs = slope * 0.5 + vec2(dFdx(ch), dFdy(ch)) * uRes.y * 0.012 * min(uAmp, MAX_AMP) * chopK;
    vec3 N = normalize(vec3(-slope, 1.0)), Nc = normalize(vec3(-cs, 1.0));

    // the swell rolling under the light: faces toward the sun lighter, the far
    // side and the troughs darker; foam is lit too but shows it less
    vec3 L = normalize(vec3(cos(uLight), sin(uLight), 1.1));
    float shade = max(1.0 + 0.9 * (dot(N, L) - L.z) / L.z, 0.0);   // exactly 1 on a flat surface
    shade *= 1.0 + 0.22 * hn;
    c *= mix(shade, 1.0 + 0.6 * (shade - 1.0), foam);
    // crests whiten a little where there is already foam to catch the light
    c = mix(c, vec3(0.9, 0.95, 0.97), foam * smoothstep(0.3, 1.0, hn) * 0.25);
    // by the rocks, the white water each wave throws up
    if (uPersp > 0.5) {
      float ps; vec2 q = seaPlane(at, ps), sd; float white;
      surgeAt(at, q, ps, sd, white);
      c = mix(c, vec3(0.92, 0.95, 0.97), white * 0.9);
    }
    // sun glints: sparkle where a facet mirrors the sun into the camera. Seen
    // from the shore they are only a touch: looking out to sea the sun is
    // seldom in front of the camera, and the photo shows the glitter it has
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(Nc, H), 0.0), 1600.0) * (uPersp > 0.5 ? 0.2 * chopK : 1.0);
    c += vec3(1.0, 0.96, 0.85) * spec * 1.1 * (1.0 - 0.7 * foam);
    // dry land, and the far sea under the horizon: the photo as it is (grass swaying)
    // (a sea in perspective calms by itself toward the horizon: no fade)
    c = mix(toLin(texture(tImg, at - swayAt(at)).rgb), c, m * (uPersp > 0.5 ? 1.0 : sky.g));
    // the sky: drifting clouds
    c = mix(c, cloudsAt(at), sky.r);
    // haze: under a sea horizon, the farther off the more of the air's own
    // colour (the sky just above the horizon, averaged), thickest at the
    // horizon and gone well before the near water. On the sea only: land
    // that rises across the horizon (a headland) would show a step at the line
    if (uPersp > 0.5 && at.y < uSeaLine) {
      float far = 1.0 - clamp((uSeaLine - at.y) / uSeaLine, 0.0, 1.0);
      // (averaged wide across, so one bright cloud doesn't drop a pale streak)
      float ay = min(uSeaLine + 0.025, 1.0);
      vec3 air = (toLin(textureLod(tImg, vec2(at.x - 0.12, ay), 5.0).rgb) + toLin(textureLod(tImg, vec2(at.x, ay), 5.0).rgb)
                + toLin(textureLod(tImg, vec2(at.x + 0.12, ay), 5.0).rgb)) / 3.0;
      c = mix(c, air, uHaze * pow(far, 6.0) * (1.0 - sky.r) * m);
    }
    // shore=show: tint what the mask keeps still; sky=show: what drifts as sky
    c = mix(c, vec3(0.9, 0.08, 0.05), uShow * (1.0 - m) * (1.0 - sky.r) * 0.6);
    c = mix(c, vec3(0.1, 0.35, 0.95), uSkyShow * sky.r * 0.5);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Direction pass, as a doubled-angle vector weighted by confidence.
const WATER_DIR_FS = /* glsl */`
  ${WATER_COMMON}
  void main() {
    float hn, m; vec2 g, at;
    vec2 uv = surface(vUv, hn, g, at, m);
    vec4 sky = texture(tSky, at);
    vec2 o0, o1, o2; vec3 w;
    driftPhases(uv, o0, o1, o2, w);
    // the texture's direction travels with the texture
    vec2 tex = (texture(tMap, uv - o0).ba * 2.0 - 1.0) * w.x + (texture(tMap, uv - o1).ba * 2.0 - 1.0) * w.y + (texture(tMap, uv - o2).ba * 2.0 - 1.0) * w.z;
    // (a sea in perspective: the plane's slope as the screen sees it)
    if (uPersp > 0.5) { float ps = clamp((uSeaLine - at.y) / uSeaLine, 0.003, 1.0); g = vec2(g.x / ps, g.y / (uSeaLine * ps * ps)); }
    // crest lines run across the slope; doubled angle of the perpendicular
    vec2 c = vec2(-g.y, g.x);
    float gl = length(c);
    vec2 crest = gl > 1e-5 ? vec2(c.x * c.x - c.y * c.y, 2.0 * c.x * c.y) / (gl * gl) : vec2(0.0);
    // foam from the very colour the colour pass shows, so they always agree
    float foam = foamOf(drifted(uv, o0, o1, o2, w));
    // where the texture has no clear direction, don't pretend it has one
    float tc = clamp(length(tex) * 3.0, 0.0, 1.0);
    vec2 d = mix(crest * 0.6, tex / max(length(tex), 1e-4) * tc, clamp(foam * 0.7 + tc * 0.5, 0.0, 1.0));
    // dry land: the still photo's own direction, as the colour pass shows it
    vec2 ts = texture(tMap, at - swayAt(at)).ba * 2.0 - 1.0;
    d = mix(ts / max(length(ts), 1e-4) * clamp(length(ts) * 3.0, 0.0, 1.0), d, m * (uPersp > 0.5 ? 1.0 : sky.g));
    // the sky: the clouds' own direction travels with them
    vec2 a0, a1; float k0, k1;
    cloudReads(at, a0, a1, k0, k1);
    vec2 cd = (texture(tMap, a0).ba * 2.0 - 1.0) * k0 + (texture(tMap, a1).ba * 2.0 - 1.0) * k1 + ts * (1.0 - k0 - k1);
    d = mix(d, cd / max(length(cd), 1e-4) * clamp(length(cd) * 3.0, 0.0, 1.0), sky.r);
    float wt = 0.6 + 0.4 * length(d);   // (w is the drift copies' weights)
    gl_FragColor = vec4(d * wt, wt, 1.0);
  }`;

// opts: { image, maps, grid (masks.js readGrid), sky (sky.js skyMask, or null),
//         stats (analyseWater), width, height, wind (rad), windGiven, light (rad),
//         amp, churn, drift, cycles, speed, wavelength, shore: 'auto'|'off'|'show',
//         skyOnly (no water: all but the sky stays still), skyShow, cloud (rad), clouds (speed) }
// churn, drift and wavelength may be null: then they come from the photo.
export function buildWater(renderer, opts) {
  const { width: W, height: H, stats } = opts;
  // the photo's own wave size, unless one is asked for (in frame heights)
  // (stats.k is null when the photo shows no clear wave size: keep the preset)
  const k = opts.wavelength > 0 ? 1 / opts.wavelength : stats.k ?? K_REF;
  const scale = Math.min(2.5, Math.max(0.4, k / K_REF));
  // streaky photos (a river, wind lanes) mostly drift; chaotic ones (surf)
  // mostly churn in place
  const streak = smoothstep(0.05, 0.4, opts.maps.coherence);
  // ...unless the streaks are swell crests: parallel waves at one clear size
  // (a river's streaks have no such size). Then the water mostly heaves and
  // the swell runs across the crests, along the spectrum's own axis.
  const swelly = smoothstep(0.3, 0.7, stats.aniso) * smoothstep(1.6, 2.4, stats.peak);
  const drift = opts.drift ?? 0.5 * (0.6 + 1.4 * streak * (1 - swelly));
  const churn = opts.churn ?? 1.3 - 0.7 * streak;
  // dry land to keep still; off, or a photo without clear land: all water.
  // A sky photo with no water in it: everything under the sky keeps still.
  const sky = opts.sky;
  const shore = opts.shore === 'off' || opts.skyOnly ? null : shoreMask(opts.grid, sky?.sky ?? null, sky?.seaHorizon ?? false);
  const still = shore?.on ? shore.tex : opts.skyOnly ? stillMask(opts.grid, sky?.sky ?? null) : maskTexture(1, 1, [1], [0]);
  const photo = new THREE.Texture(opts.image);
  photo.minFilter = THREE.LinearMipmapLinearFilter;
  photo.generateMipmaps = true;
  // anything that still lands past the edge mirrors back instead of smearing
  photo.wrapS = photo.wrapT = THREE.MirroredRepeatWrapping;
  opts.maps.tex.wrapS = opts.maps.tex.wrapT = THREE.MirroredRepeatWrapping;
  opts.maps.tex.needsUpdate = true;
  photo.needsUpdate = true;
  // Deep-water dispersion: frequency grows as √k, so long swells outrun the
  // short chop; rounded to whole cycles per loop so the loop closes.
  // On a shore the swell comes in from the sea, whatever way the foam streaks
  // run (along a beach they run parallel to it, which the texture's own
  // direction would read as the wind): an explicit wind still wins. The drift
  // keeps following the streaks: a river beside its bank flows along the
  // bank, not into it, and foam lines drift along themselves.
  // A sea seen from the shore, under a sea horizon: its waves live on the
  // sea plane (see seaPlane in the shader), where they roll in from the
  // horizon toward the camera and lean toward the shore; directions here are
  // on that plane (x across, y away from the camera).
  const persp = !opts.skyOnly && sky?.seaLine != null;
  const onshore = opts.windGiven ? null : shore?.onshore ?? null;
  const swellRef = persp && !opts.windGiven
    ? Math.atan2((onshore != null ? Math.sin(onshore) : 0) - 0.6, onshore != null ? Math.cos(onshore) : 0)
    : onshore ?? opts.wind;
  let heading = swellRef;
  // (the spectrum's axis is the screen's: no use on the plane)
  if (swelly > 0.5 && !persp) {
    heading = stats.axis;
    // the spectrum knows the axis, not the way along it: follow an explicit
    // wind or the shore if there is one, else keep the auto wind's
    // rightward/upward habit
    const ref = opts.windGiven || onshore != null ? swellRef : Math.PI / 4;
    if (Math.cos(heading - ref) < 0) heading += Math.PI;
  }
  const spread = 1 - 0.6 * swelly;   // parallel swell: headings stay close together
  const waves = WAVE_SET.map(([da, k0]) => {
    const a = heading + da * spread, kw = k0 * scale;
    return new THREE.Vector4(Math.cos(a), Math.sin(a), kw, Math.max(1, Math.round(1.5 * Math.sqrt(kw) * opts.speed)));
  });
  // the tallest the summed swell can get at amp 1 (the shader scales it by
  // amp), to normalise its height to ±1; it also bounds the swell's sideways push
  const hmax = WAVE_SET.reduce((s, [, k0, q]) => s + q / (2 * Math.PI * k0 * scale), 0);
  const ampEff = Math.min(opts.amp, 1.4);                  // MAX_AMP in the shader
  // inset by 60% of the worst-case total displacement (frame heights: swell +
  // churn + drift + refraction). The worst case needs every wave to line up
  // and almost never happens; the full amount would crop ~10% of the photo
  // (no water: nothing is displaced but the clouds, which mirror at the edges)
  // (in perspective the crests also rise, by up to 0.6 of the swell's height)
  const inset = opts.skyOnly ? 0 : 0.6 * (hmax * ampEff * (persp ? 1.6 : 1) + (0.011 * churn) / scale + 0.65 * 0.03 * drift + 0.004) + (persp ? 0.007 : 0);
  // clouds: a short drift per cycle, so the two copies never show a double edge
  const cloud = opts.cloud ?? 0, cloudSpeed = Math.max(0, opts.clouds ?? 1);
  const uniforms = {
    tImg: { value: photo }, tMap: { value: opts.maps.tex }, tShore: { value: still },
    uShow: { value: opts.shore === 'show' ? 1 : 0 },
    uRes: { value: new THREE.Vector2(W, H) }, uT: { value: 0 },
    uWind: { value: new THREE.Vector2(Math.cos(opts.wind), Math.sin(opts.wind)) },
    uLight: { value: opts.light }, uAmp: { value: opts.amp }, uChurn: { value: churn },
    uHmax: { value: hmax }, uInset: { value: inset }, uScale: { value: scale }, uFoam: { value: new THREE.Vector2(...stats.foam) },
    // mip of the photo that is ~4 output pixels across, for spotting glints
    uLod: { value: Math.max(0, Math.log2(opts.image.width / W) + 2) },
    // short drift per cycle and many cycles: the copies stay close, so the
    // cross-fade never shows a double image
    uDrift: { value: 0.03 * drift }, uCycles: { value: Math.max(1, Math.round(opts.cycles)) },
    uWave: { value: waves }, uSteep: { value: WAVE_SET.map((w) => w[2]) },
    // no sky: none of it (r) and all of the water's motion (g)
    tSky: { value: sky ? sky.tex : maskTexture(1, 1, [0], [1]) },
    uSway: { value: 0.0015 * Math.min(opts.amp, 1.4) }, uSkyShow: { value: opts.skyShow ? 1 : 0 },
    uCloud: { value: new THREE.Vector2(Math.cos(cloud), Math.sin(cloud)) },
    uCloudDrift: { value: 0.02 * Math.min(cloudSpeed, 2) }, uCloudCycles: { value: Math.max(1, Math.round(3 * Math.max(cloudSpeed, 0.34))) },
    uHorizon: { value: sky ? sky.horizon : 0 },
    uPersp: { value: persp ? 1 : 0 }, uSeaLine: { value: persp ? sky.seaLine : 1 },
    uHeading: { value: new THREE.Vector2(Math.cos(heading), Math.sin(heading)) },
    // (a run per cycle short enough that the drifting copies don't show a double crest)
    uWaveRun: { value: persp ? 0.06 * Math.min(opts.amp, 1.4) : 0 }, uSwellK: { value: persp ? 0.35 : 1 },
    // (two surges a loop: one every six seconds at the default 12 s, about a real set's pace)
    uSurge: { value: persp ? 2 : 0 }, uHaze: { value: persp ? Math.min(1, Math.max(0, opts.haze ?? 0.35)) : 0 },
    uShoreTexel: { value: new THREE.Vector2(1 / still.image.width, 1 / still.image.height) },
  };
  const colorMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: WATER_FS, depthTest: false, depthWrite: false });
  const dirMat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: WATER_DIR_FS, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colorMat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function renderDirection(target) {
    quad.material = dirMat;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    quad.material = colorMat;
  }
  const deg = (a) => Math.round((((a * 180) / Math.PI) % 360 + 360) % 360);
  const skyInfo = sky ? ` · sky ${Math.round(sky.share * 100)}% · clouds ${deg(cloud)}°` : opts.skyShow ? ' · sky none' : '';
  if (opts.skyOnly) return { scene, camera, count: 0, info: `sky${skyInfo}`, update: (t) => { uniforms.uT.value = t; }, renderDirection };
  const info = `water · ${swelly > 0.5 ? `swell ${deg(heading)}°` : `chop · heading ${deg(heading)}°`}${persp ? ' (from the horizon)' : onshore != null ? ' (onshore)' : ''} · waves ${(1 / (K_REF * scale)).toFixed(2)}h${stats.k == null && !(opts.wavelength > 0) ? ' (preset)' : ''} · foam ${stats.foam.map((v) => v.toFixed(2)).join('–')} · drift ${drift.toFixed(2)} · churn ${churn.toFixed(2)}${shore?.on ? ` · shore ${Math.round(shore.still * 100)}%` : opts.shore === 'show' ? ' · shore off' : ''}${skyInfo}`;
  return { scene, camera, count: 0, info, update: (t) => { uniforms.uT.value = t; }, renderDirection };
}
