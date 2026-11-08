// ASCII layer. Every 5×7 cell reads the graded colour of the
// strands under it and their mean direction (from a separate direction pass),
// then draws a stroke glyph turned to that direction: 8 angles × 4 weights,
// rasterised here so the strokes rotate in small steps as the strands sway.
// Each weight lights about the same number of pixels at every angle. Colour
// is solved per cell: strokes take the cell's own colour a step brighter, and
// the glow behind them is set so the cell averages to the flow render's
// colour — so at viewing size the ASCII keeps the original's exposure and hues.
// Cells with no clear direction (gaps, undergrowth) use a density ramp.
// The style (asciiStyle) picks the ink, the background, how big the cells
// are and which characters they are drawn with; the ink and background change
// on the fly, the rest rebuilds the layer (setStyle).
import * as THREE from 'three';
import { G, RAMP, CELL_W, CELL_H } from './font5x7.js';

const BINS = 8;
// [half length, lit pixels out of the 4×6 box], light → heavy
const WEIGHTS = [[1.6, 3], [3.6, 6], [3.6, 10], [3.6, 14]];

// Strokes stay inside a 4×6 box (last column and bottom row left blank, as
// in the bitmap font), so neighbouring glyphs never join into long lines.
function strokeGlyph(theta, halfLen, halfThick) {
  const rows = [];
  const dx = Math.cos(theta), dy = Math.sin(theta);
  // centred on a pixel (col 1, row 3), so a one-pixel line stays one pixel wide
  const cx = 1.5, cy = 3.5;
  for (let y = 0; y < CELL_H; y++) {
    let row = '';
    for (let x = 0; x < CELL_W; x++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        if (x === CELL_W - 1 || y === 0) continue;
        const px = x + (sx + 0.5) / 4 - cx, py = y + (sy + 0.5) / 4 - cy;
        const along = px * dx + py * dy, across = Math.abs(-px * dy + py * dx);
        if (across <= halfThick && Math.abs(along) <= halfLen) hit++;
      }
      row += hit >= 5 ? '#' : '.';
    }
    rows.push(row); // row 0 is the bottom: theta is measured with y up
  }
  return rows;
}

const litCount = (rows) => rows.join('').split('#').length - 1;

// search length and thickness for the stroke that lights closest to `target`
// pixels while still reading as a line (never thicker than half its length).
// Angles that can't reach the target (horizontal: the box is 4 px wide) are
// evened out by the per-cell glow solve.
function fitStroke(theta, halfLen, target) {
  let best = null, bestCost = Infinity;
  for (let hl = 0.8; hl <= 4.6; hl += 0.1) for (let ht = 0.2; ht <= hl * 0.5; ht += 0.05) {
    const g = strokeGlyph(theta, hl, ht);
    const cost = Math.abs(litCount(g) - target) * 10 + Math.abs(hl - halfLen) + ht * 0.1;
    if (cost < bestCost) { best = g; bestCost = cost; }
  }
  return best;
}

// The style options. ink: the photo's own colours, one phosphor colour, or
// dark ink on paper (where the photo is dark, the characters are dense);
// bg: the glow that keeps the cell's brightness, or plain black; cell: how
// many screen pixels each font pixel takes; chars: the stroke glyphs that
// turn with what moves, a classic ASCII ramp, shaded blocks, braille dots
// (2×4 per cell, each on or off), or charset's own characters.
export const INKS = { photo: null, green: [0.35, 1.0, 0.45], amber: [1.0, 0.7, 0.22], white: [0.93, 0.95, 0.97], paper: [0.1, 0.11, 0.14] };
export const BGS = ['glow', 'plain'];
export const CHARS = ['strokes', 'classic', 'blocks', 'braille', 'custom'];
export const CELLS = [1, 2, 3];
const PAPER = [0.95, 0.93, 0.88];
export const DEFAULT_STYLE = { ink: 'photo', bg: 'glow', cell: 1, chars: 'strokes', charset: '' };

const flip = (g) => g.slice().reverse(); // font rows are top-down; the atlas runs bottom-up

// shaded blocks: empty, ░, ▒, ▓, █, filled in a 4×4 ordered pattern over the whole cell
function blockGlyphs() {
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return [0, 4, 8, 12, 16].map((k) => {
    const rows = [];
    for (let y = 0; y < CELL_H; y++) {
      let row = '';
      for (let x = 0; x < CELL_W; x++) row += bayer[(y % 4) * 4 + (x % 4)] < k ? '#' : '.';
      rows.push(row);
    }
    return rows;
  });
}

// the user's own characters, drawn with the browser's monospace font at the
// cell's own size (so at 1× they are hard to read: 2× or 3× suits them) and put
// in order of how much of the cell they fill. Whole characters (an emoji with
// its modifiers is one), at most 32, which old phones' shaders can hold
export const MAX_CHARSET = 32;
function customGlyphs(charset, cell) {
  const split = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(charset)].map((x) => x.segment) : Array.from(charset);
  const chars = [...new Set(split)].slice(0, MAX_CHARSET);
  const gw = CELL_W * cell, gh = CELL_H * cell;
  const cv = document.createElement('canvas');
  cv.width = gw; cv.height = gh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(gh * 0.9)}px ui-monospace, Menlo, Consolas, monospace`;
  const glyphs = chars.map((ch) => {
    g.clearRect(0, 0, gw, gh);
    g.fillStyle = '#fff';
    g.fillText(ch, gw / 2, gh * 0.55);
    const a = g.getImageData(0, 0, gw, gh).data, rows = [];
    for (let y = 0; y < gh; y++) { let row = ''; for (let x = 0; x < gw; x++) row += a[(y * gw + x) * 4 + 3] >= 128 ? '#' : '.'; rows.push(row); }
    return flip(rows);
  });
  return glyphs.map((g2, i) => [litCount(g2), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => glyphs[i]);
}

// the glyphs of one style, in one strip; ramp: how many of them are a
// density ramp (the rest, if any, are strokes: 4 weights × 8 angles)
function buildAtlas({ chars, charset, cell }) {
  let glyphs;
  if (chars === 'strokes') {
    glyphs = [...RAMP].map((ch) => flip(G[ch]));
    for (let w = 0; w < WEIGHTS.length; w++) for (let b = 0; b < BINS; b++) glyphs.push(fitStroke((b / BINS) * Math.PI, ...WEIGHTS[w]));
  } else if (chars === 'blocks') glyphs = blockGlyphs();
  else if (chars === 'custom') glyphs = customGlyphs(charset, cell);
  else glyphs = [...RAMP].map((ch) => flip(G[ch]));   // classic (and braille, which draws its own dots)
  const ramp = chars === 'strokes' ? RAMP.length : glyphs.length;
  const gw = glyphs[0][0].length, gh = glyphs[0].length;
  // fraction of the cell each glyph lights, for the colour solve
  const covers = glyphs.map((g) => litCount(g) / (gw * gh));
  const W = gw * glyphs.length;
  const data = new Uint8Array(W * gh * 4);
  glyphs.forEach((g, gi) => {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (g[y][x] !== '#') continue;
      const o = (y * W + gi * gw + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255;
    }
  });
  const tex = new THREE.DataTexture(data, W, gh, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, count: glyphs.length, ramp, covers };
}

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class AsciiStrokes {
  constructor(renderer, W, H, style = DEFAULT_STYLE, { sat = 0.97, glyphBoost = 2.0, highlightBoost = 1.3, lift = 1.0 } = {}) {
    this.renderer = renderer;
    this.style = { ...style };
    const s = style.cell, cw = CELL_W * s, ch = CELL_H * s;
    const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
    this.cellRT = new THREE.WebGLRenderTarget(cols, rows, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
    });
    const atlas = buildAtlas(style);
    this.atlas = atlas;
    const cell = new THREE.Vector2(cw, ch), res = new THREE.Vector2(W, H);
    // a cell is read at most 15×21 points, evenly spread (every pixel up to 3×
    // cells; the larger cells of a big download take a sample of them, so the
    // shader's loop stays small enough for any GPU to compile)
    const nx = Math.min(cw, 15), ny = Math.min(ch, 21);
    const step = `vec2(${(cw / nx).toFixed(4)}, ${(ch / ny).toFixed(4)})`;
    const area = (nx * ny).toFixed(1);
    const strokes = style.chars === 'strokes', braille = style.chars === 'braille';

    this.reduceMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDir: { value: null }, uRes: { value: res }, uCell: { value: cell } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDir; uniform vec2 uRes, uCell;
        void main() {
          vec2 cell = floor(gl_FragCoord.xy);
          vec3 sum = vec3(0.0), mx = vec3(0.0);
          vec3 dir = vec3(0.0);
          for (int y = 0; y < ${ny}; y++) for (int x = 0; x < ${nx}; x++) {
            vec2 uv = (cell * uCell + (vec2(x, y) + 0.5) * ${step}) / uRes;
            vec3 c = clamp(texture2D(tColor, uv).rgb, 0.0, 16.0);
            sum += c; mx = max(mx, c);
            dir += texture2D(tDir, uv).rgb;
          }
          // mean of doubled-angle vectors: its angle halved is the strands'
          // heading, its length over the weight is how much they agree
          float coh = dir.z > 1e-4 ? length(dir.xy) / dir.z : 0.0;
          float cover = dir.z / ${area};
          float theta = dir.z > 1e-4 ? mod(0.5 * atan(dir.y, dir.x), 3.14159265) : 0.0;
          float bin = mod(floor(theta / (3.14159265 / ${BINS}.0) + 0.5), ${BINS}.0);
          gl_FragColor = vec4(mix(sum / ${area}, mx, 0.3), bin + 0.9 * clamp(coh * smoothstep(0.15, 0.6, cover), 0.0, 1.0));
        }`,
    });

    this.drawMat = new THREE.ShaderMaterial({
      uniforms: {
        tCells: { value: this.cellRT.texture }, tAtlas: { value: atlas.tex }, tColor: { value: null },
        uCell: { value: cell }, uGrid: { value: new THREE.Vector2(cols, rows) }, uRes: { value: res },
        uCount: { value: atlas.count }, uRamp: { value: atlas.ramp }, uCover: { value: atlas.covers },
        uSat: { value: sat }, uGlyphBoost: { value: glyphBoost }, uHighlightBoost: { value: highlightBoost }, uLift: { value: lift },
        uInk: { value: new THREE.Vector3() }, uInkMode: { value: 0 }, uPlain: { value: 0 }, uPaper: { value: new THREE.Vector3(...PAPER) },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tCells, tAtlas, tColor; uniform vec2 uCell, uGrid, uRes;
        uniform float uCount, uRamp, uSat, uGlyphBoost, uHighlightBoost, uLift;
        uniform float uCover[${atlas.count}];
        uniform vec3 uInk, uPaper;
        uniform int uInkMode;   // 0 the photo's colours, 1 one ink colour, 2 dark ink on paper
        uniform float uPlain;   // 1: no glow behind the characters
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        // same grade as the flow render (gamma, then saturation), pulled back
        // toward the image's own colour (the flow grade is a touch more saturated)
        vec3 grade(vec3 lin) {
          vec3 c = pow(max(lin, 0.0), vec3(1.0 / 2.2));
          c = clamp(mix(vec3(luma(c)), c, 1.2) * 1.06, 0.0, 1.0);
          return mix(vec3(luma(c)), c, uSat);
        }
        // a stroke in the cell's own colour, brightened: a lot in shadow so it
        // reads, only a little in highlights so it stays natural
        float boostAt(float l) { return mix(uGlyphBoost, uHighlightBoost, smoothstep(0.2, 0.7, l)); }
        void main() {
          vec2 fc = gl_FragCoord.xy;
          vec2 cell = floor(fc / uCell);
          vec2 local = fract(fc / uCell);
          vec4 texel = texture2D(tCells, (cell + 0.5) / uGrid);
          vec3 c = grade(texel.rgb);
          float l = luma(c);
          float mx = max(c.r, max(c.g, c.b));
          vec3 hue = c / max(mx, 1e-4);
          bool paper = uInkMode == 2;
          // how much ink the cell wants: its brightness, or on paper its darkness
          // (shadows keep visible strokes; only the deepest gaps thin out to dots)
          float v = smoothstep(0.0, 0.8, l);
          if (paper) v = 1.0 - smoothstep(0.05, 0.95, l);
          float m, f;
${braille ? `
          // braille: 2×4 dots, each lit when its own part of the cell is light
          // enough against an ordered threshold, so tone comes from how many are lit
          vec2 px = floor(local * vec2(${CELL_W}.0, ${CELL_H}.0));
          float col = px.x < 2.5 ? 0.0 : 1.0, row = floor(px.y / 2.0);
          bool dotPx = (px.x == 1.0 || px.x == 3.0) && mod(px.y, 2.0) == 0.0;
          vec2 sub = (cell * uCell + vec2((col + 0.5) * 0.5, (row + 0.5) * 0.25) * uCell) / uRes;
          vec3 dc = grade(texture2D(tColor, sub).rgb);
          float dl = smoothstep(0.0, 0.8, luma(dc));
          if (paper) dl = 1.0 - smoothstep(0.05, 0.95, luma(dc));
          float bayer = col < 0.5 ? (row < 0.5 ? 0.0 : row < 1.5 ? 4.0 : row < 2.5 ? 2.0 : 6.0)
                                  : (row < 0.5 ? 3.0 : row < 1.5 ? 7.0 : row < 2.5 ? 1.0 : 5.0);
          m = dotPx && dl > (bayer + 0.5) / 8.0 ? 1.0 : 0.0;
          f = 4.0 / ${(CELL_W * CELL_H).toFixed(1)} * clamp(v * 2.0, 0.0, 1.0);   // about how much of the cell its lit dots cover
          float dmx = max(dc.r, max(dc.g, dc.b));
          if (!paper) { hue = dc / max(dmx, 1e-4); mx = dmx; }
` : `
          float idx;
          ${strokes ? `float bin = floor(texel.a), conf = fract(texel.a) / 0.9;
          if (conf > 0.3 && v > 0.03) {
            float weight = v < 0.12 ? 0.0 : v < 0.35 ? 1.0 : v < 0.65 ? 2.0 : 3.0;
            idx = uRamp + weight * ${BINS}.0 + bin;
          } else` : ''} {
            idx = clamp(floor(pow(v, 1.3) * uRamp), 0.0, uRamp - 1.0);
          }
          m = texture2D(tAtlas, vec2((idx + local.x) / uCount, local.y)).r;
          f = uCover[int(idx + 0.5)];
`}
          vec3 col3;
          if (paper) {
            col3 = m > 0.5 ? uInk : uPaper;
          } else {
            // ---- colour solve: what the cell should average to. The cell colour
            // leans toward its brightest pixel (to keep glints), so this scale,
            // measured against the flow render, brings it back to the flow's
            // exposure; shadows end a little deeper than flow
            float target = l * uLift * (0.82 + 0.17 * smoothstep(0.15, 0.7, l));
            float boost = boostAt(l);
            // with the glow the stroke is capped so the cell keeps its brightness;
            // on plain black the strokes carry all of it
            float gv = uPlain > 0.5 ? min(1.0, mx * boost * 1.25) : min(min(1.0, mx * boost), target / max(f * max(luma(hue), 1e-4), 1e-4));
            vec3 ink = hue * gv;
            // soft shoulder: near full brightness the stroke eases toward warm
            // cream, as sunlit tips do in a photo, instead of going neon
            float shoulder = smoothstep(0.75, 1.0, gv);
            ink = mix(ink, vec3(luma(ink)) * vec3(1.04, 1.0, 0.82), 0.35 * shoulder);
            float lg = luma(ink);
            // glow behind the strokes makes up the rest of the cell's brightness
            float b = f < 0.999 ? clamp((target - f * lg) / ((1.0 - f) * max(l, 1e-4)), 0.0, 1.0 / max(mx, 1e-4)) : 0.0;
            col3 = m > 0.5 ? ink : uPlain > 0.5 ? vec3(0.0) : c * b;
${braille ? `            // a dot lights far less than a glyph, so a glow that kept the cell's
            // brightness would bury the dots: keep it a dim backdrop, and the dots bright
            col3 = m > 0.5 ? hue * min(1.0, mx * boost * 1.25) : uPlain > 0.5 ? vec3(0.0) : c * 0.3;
` : ''}            // one ink colour: the same brightness, in that colour
            if (uInkMode == 1) col3 = clamp(uInk * (luma(col3) / luma(uInk)), 0.0, 1.0);
            vec2 vg = (fc / uRes - 0.5) * vec2(1.15, 0.85);
            col3 *= 1.0 - 0.22 * pow(clamp(dot(vg, vg) * 2.4, 0.0, 1.0), 1.6);  // same vignette as flow
          }
          gl_FragColor = vec4(col3, 1.0);
        }`,
    });
    this.setColours(style);

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
  }

  // the ink and background, which need no rebuild
  setColours({ ink, bg }) {
    const u = this.drawMat.uniforms;
    u.uInkMode.value = ink === 'photo' ? 0 : ink === 'paper' ? 2 : 1;
    if (INKS[ink]) u.uInk.value.set(...INKS[ink]);
    u.uPlain.value = bg === 'plain' ? 1 : 0;
    Object.assign(this.style, { ink, bg });
  }

  // does going to this style need a new layer (cells or characters change)?
  needsRebuild(style) {
    return style.cell !== this.style.cell || style.chars !== this.style.chars || (style.chars === 'custom' && style.charset !== this.style.charset);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.cam);
  }

  render(colorTex, dirTex) {
    this.reduceMat.uniforms.tColor.value = colorTex;
    this.reduceMat.uniforms.tDir.value = dirTex;
    this.drawMat.uniforms.tColor.value = colorTex;
    this.pass(this.reduceMat, this.cellRT);
    this.pass(this.drawMat, null);
  }

  dispose() {
    this.cellRT.dispose();
    this.atlas.tex.dispose();
    this.reduceMat.dispose();
    this.drawMat.dispose();
    this.quad.geometry.dispose();
  }
}
