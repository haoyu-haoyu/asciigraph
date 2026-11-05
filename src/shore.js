// Where a water photo isn't water: dry land (a beach, a sandbank) that the
// swell, churn and drift should leave still. Read once from the still photo,
// as a soft mask (1 = moves, 0 = still) in photo uv.
//
// The two mistakes cost differently: land read as water moves (how every
// water scene behaved before), water read as land freezes, which looks
// broken. So a pixel is only still when it is clearly land, and the mask only
// switches on when the photo clearly has both, side by side:
//   land   - warm hues (golden sand, earth, red rock); when bright, only if
//            smooth at the mask's scale (glitter and sunlit ripples are busy)
//          - near-white that is very smooth (white sand; foam is lacy)
//          - but not the swash: sand under a thin sheet of water (see wash())
//          - dark rock: dark and, whatever its hue, far greyer than this photo's own water
//            (black rock under a blue sky looks blue-grey; so does an
//            overcast sea, but then the water itself is grey and the cut-off
//            drops with it, so the sea keeps moving)
//   water  cyan to deep blue with some texture (a clear sky is smooth, and
//          this is the main guard against one; a calm glassy sea fails it
//          too, which only keeps the mask off)
// and the land forms solid areas, not specks scattered through the water,
// with some water or foam within reach of its edge. That reach is wide (a
// band of foam often sits between sand and sea), so it also reaches a sky
// just past a horizon when no sky mask (sky.js) takes that sky out first: a
// brown river under a broken, cloudy blue sky can still freeze. shore=show
// shows it; shore=off undoes it.
// Grass and trees are land only under a sky with a straight sea horizon (a
// clifftop over the sea): there is no far shore to mirror, while in a lake
// they can't be told from the forest's reflection by colour, and a frozen
// reflection is the worse mistake. Elsewhere green banks, dark green water
// and anything else unsure keep moving (unless small and closed in by land
// with no water in it: see despeck()). Grass that stays still still sways a
// little in the wind (the texture's g channel; water.js). A sea that is
// all one warm colour (sunset, a muddy river) has no blue to stand against,
// so the mask stays off and the whole frame moves as before.
import { LONG, smooth, blur, flood, maskTexture } from './masks.js';

const MIN_WATER = 0.15;      // share of the frame that must be clear water...
const MIN_LAND = 0.06;       // ...and solid land, for the mask to switch on,
const MIN_CONTACT = 0.08;    // ...with water or foam along the land's edge

// The swash: sand under a thin sheet of water is still water. It reads as
// sand by colour, but is a little darker than the dry sand further up (by a
// tenth to a third, the soaked band at the waterline most; a shadow or a rock
// is darker by half or more). So sand up to about 37% darker than this
// photo's dry sand stops counting as land, but only where
// it connects to the sea through more of the same (a flood fill from the
// water): a shadow or damp patch cut off from the sea stays still, and so
// does dark rock, wet or not. Land darker
// than that cap is marked as stone for despeck(), so a pebble is never a speck.
// The dry-sand brightness is read per kind (golden, white): a pale overcast
// sky or a white building is never the reference a golden beach is compared
// with. Known misses (they move, the cheaper mistake): a soft shadow edge,
// sunlit brown rock or pilings that run down into the swash, and white or pale beige sand
// under a brighter white sky (pale sand counts as both kinds).
// Land without its specks and holes: connected areas (4-neighbour) of land
// smaller than minArea pixels become water (unless they are mostly stone: a
// pebble on wet sand or in the foam is real. Stone is the rock class, which is
// already kept far greyer than this photo's water so a dark trough is not
// one, or land too dark to be sand, wet or dry: see wash()), and areas of
// not-land become land
// when they are that small too, or when land closes them in, no water or
// foam is in them and they are still small (a dark crack in rock; a rock pool,
// or a big green bank or shaded channel inside sand, keeps moving). A blur
// would do the same to specks, but it also dilutes a rock standing alone in
// the surf until it reads as half water.
function despeck(land, stone, sea, w, h, minArea) {
  const n = w * h, out = new Uint8Array(n), seen = new Uint8Array(n), queue = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = land[i] > 0.5 ? 1 : 0;
  for (const side of [1, 0]) {   // specks first, then holes judged on what is left
    seen.fill(0);
    for (let s0 = 0; s0 < n; s0++) {
      if (out[s0] !== side || seen[s0]) continue;
      let head = 0, tail = 0, edge = false, wet = false, rocky = 0;
      seen[s0] = 1; queue[tail++] = s0;
      while (head < tail) {
        const i = queue[head++], x = i % w;
        if (x === 0 || x === w - 1 || i < w || i >= n - w) edge = true;
        if (sea[i] > 0.5) wet = true;
        rocky += stone[i];
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= n || seen[j] || out[j] !== side) continue;
          seen[j] = 1; queue[tail++] = j;
        }
      }
      const small = tail < minArea && !(side === 1 && tail >= 2 && rocky > 0.5 * tail);
      if (small || (side === 0 && !edge && !wet && tail < 10 * minArea)) for (let q = 0; q < tail; q++) out[queue[q]] = 1 - side;
    }
  }
  return out;
}

function wash(land, kinds, sea, hsvs, w, h, stone) {
  const n = w * h, v = (i) => hsvs[i * 3 + 2];
  // this kind's dry sand: the brightest of it
  const dryV = kinds.map((k) => {
    const vs = [];
    for (let i = 0; i < n; i++) if (k[i] > 0.8) vs.push(v(i));
    return vs.length >= 0.02 * n ? vs.sort((a, b) => a - b)[Math.floor(vs.length * 0.75)] : null;
  });
  const dry = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let wet = 0;
    kinds.forEach((k, c) => {
      if (dryV[c] == null) return;
      const dark = dryV[c] - v(i);
      wet = Math.max(wet, k[i] * smooth(0.03, 0.08, dark) * (1 - smooth(0.32, 0.42, dark / dryV[c])));
    });
    dry[i] = land[i] * (1 - wet);
    // land darker than any sand here could be, even soaked: a stone or a shadow
    const ref = dryV[0] ?? dryV[1];
    if (ref != null) stone[i] = Math.max(stone[i], land[i] * smooth(0.42, 0.5, (ref - v(i)) / ref));
  }
  const reached = flood((i) => sea[i] > 0.5, (j) => dry[j] < 0.5, w, h);
  for (let i = 0; i < n; i++) if (reached[i]) land[i] = dry[i];
}

// grid: readGrid(img); sky: the sky mask on the same grid (sky.js), or null.
// The sky is neither land nor water here: it has a motion of its own.
// grass and trees: yellow-green to green. Green water is teal (bluer, from
// about 150°), and so is a forest's reflection in a lake (about 130°)
// (from about 45°: golden sand and sun glitter are yellower; and a bright
// yellow-green is glitter on the water, not grass)
const greenOf = (hu, s, v) => smooth(40, 50, hu) * (1 - smooth(105, 120, hu)) * smooth(0.2, 0.3, s) * smooth(0.08, 0.15, v)
  * (1 - smooth(0.8, 0.9, v) * (1 - smooth(55, 65, hu)));
// where grass sways: green under no sky, softened one cell
function swayOf(grid, sky, still) {
  const { w, h, n, hsvs } = grid;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = greenOf(hsvs[i * 3], hsvs[i * 3 + 1], hsvs[i * 3 + 2]) * (1 - (sky ? sky[i] : 0)) * still(i);
  return blur(blur(g, w, h, 1), w, h, 1);
}

// A sky scene (no water): everything under the sky still, the grass swaying.
export function stillMask(grid, sky) {
  const { w, h, n } = grid;
  return maskTexture(w, h, new Float32Array(n), swayOf(grid, sky, () => 1));
}

// seaHorizon: the sky above ends in a straight sea horizon (sky.js)
export function shoreMask(grid, sky, seaHorizon = false) {
  const { w, h, n, hsvs, busy } = grid;
  const skyAt = (i) => (sky ? sky[i] : 0);
  const wetAt = new Float32Array(n), wetSat = [];
  for (let i = 0; i < n; i++) {
    const hu = hsvs[i * 3], s = hsvs[i * 3 + 1], v = hsvs[i * 3 + 2];
    // clear water is blue and has some texture: a clear sky is just as blue
    // but smooth, and must not count (a calm, glassy sea doesn't count
    // either, which only keeps the mask off)
    if (s >= 0.15 && v >= 0.06 && hu >= 160 && hu < 255 && busy[i] >= 0.012 && skyAt(i) < 0.5) { wetAt[i] = 1; wetSat.push(s); }
  }
  const wet = wetSat.length;
  // rock must be much greyer than the water: a third of its median saturation
  const greyCut = Math.min(0.2, Math.max(0.02, 0.35 * (wet ? wetSat.sort((a, b) => a - b)[wet >> 1] : 0)));
  const land = new Float32Array(n), stone = new Float32Array(n), sea = new Float32Array(n), golden = new Float32Array(n), whiteSand = new Float32Array(n), earth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hu = hsvs[i * 3], s = hsvs[i * 3 + 1], v = hsvs[i * 3 + 2], b = busy[i];
    const blueHue = smooth(150, 170, hu) * (1 - smooth(260, 280, hu));
    const warmHue = smooth(5, 15, hu) * (1 - smooth(55, 70, hu));
    const warm = warmHue * smooth(0.04, 0.14, s) * smooth(0.12, 0.25, v)
      * (1 - smooth(0.35, 0.6, v) * smooth(0.05, 0.1, b));
    // near-white, smooth and not tinted blue (pale shallows over sand are)
    const white = (1 - smooth(0.08, 0.14, s)) * smooth(0.65, 0.8, v) * (1 - smooth(0.02, 0.045, b))
      * (1 - blueHue * smooth(0.03, 0.06, s));
    // dark and grey, whatever the hue: dark green, teal or navy water is
    // more saturated than that and keeps moving
    const rock = smooth(0.02, 0.06, v) * (1 - smooth(0.3, 0.45, v)) * (1 - smooth(0.7 * greyCut, greyCut, s));
    // under a sea horizon a clifftop counts too: its grass, and the
    // earth-coloured rock of its face (yellow-brown to mossy green, and
    // saturated: foam is grey, shallows teal); see below for where
    const green = seaHorizon ? greenOf(hu, s, v) : 0;
    earth[i] = seaHorizon ? smooth(15, 25, hu) * (1 - smooth(110, 125, hu)) * smooth(0.18, 0.26, s) * (1 - skyAt(i)) : 0;
    land[i] = Math.max(warm, white, rock, green) * (1 - skyAt(i));
    stone[i] = rock;
    // the sand kinds the swash is read against (dark wet sand included, dark rock not)
    // (kept well above the swash's darkness cap in wash(): a darker golden
    // reference would let the cap close before the swash ramp opens)
    // (and not sunlit grass on a clifftop: its darker edge isn't wet sand)
    golden[i] = warm * smooth(0.28, 0.4, v) * (1 - green);
    whiteSand[i] = white;
    // what land meets on the water side: clear water, or foam on it
    sea[i] = Math.max(wetAt[i], (1 - smooth(0.12, 0.18, s)) * smooth(0.5, 0.6, v) * smooth(0.045, 0.07, b)) * (1 - skyAt(i));
  }
  // the cliff's rock only where it runs on from land already found (grass,
  // sand, dark rock): a streak of sun glitter out on the sea doesn't
  if (seaHorizon) {
    const onLand = flood((i) => land[i] > 0.5, (j) => earth[j] > 0.5, w, h);
    for (let i = 0; i < n; i++) if (onLand[i]) land[i] = Math.max(land[i], earth[i]);
  }
  // twice a box ≈ a soft bell: specks wash out, solid land stays solid
  // (for judging whether the photo has a shore at all)
  const r = Math.max(1, Math.round(0.02 * LONG)), rs = Math.max(1, Math.round(0.06 * LONG));
  const soft = (a) => blur(blur(a, w, h, r), w, h, r);
  // whether to act is judged on the land as its colours say (sand up to the
  // foam); what stays still is that land less the swash
  const lb0 = soft(land), near = blur(blur(sea, w, h, rs), w, h, rs);
  wash(land, [golden, whiteSand], sea, hsvs, w, h, stone);
  // what stays still: whole areas of land, a rock alone in the surf included
  // (about 0.15% of the frame, ~5 mask pixels across, is the smallest kept),
  // with a thin feathered edge that leans out over the water a little: the
  // moving copy beside a rock is displaced, and would show a sliding ghost of
  // the rock's edge at full strength right next to it
  const keep = despeck(land, stone, sea, w, h, Math.round(0.0015 * n));
  // (kept pixels stay fully still: a blur alone would thin out a pebble)
  const lb = blur(blur(Float32Array.from(keep), w, h, 1), w, h, 1).map((v, i) => Math.max(v, keep[i]));
  // land must have water or foam near its edge (a loose check: see the top)
  let solid = 0, edge = 0, touch = 0;
  for (let i = 0; i < n; i++) {
    if (lb0[i] > 0.75) solid++;
    if (lb0[i] > 0.3 && lb0[i] < 0.7) { edge++; touch += near[i]; }
  }
  const contact = edge ? touch / edge : 0;
  const on = wet / n >= MIN_WATER && solid / n >= MIN_LAND && contact >= MIN_CONTACT;

  // which way is ashore: from the moving water's centre to the still land's
  // (frame heights, y up). Land all round the water (a lagoon, a cove seen
  // from above) has no one way, so it gives none.
  const mask = new Float32Array(n);
  let still = 0, lx = 0, ly = 0, ls = 0, wx = 0, wy = 0, ws = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = on ? 1 - smooth(0.1, 0.7, lb[y * w + x]) : 1;
    mask[y * w + x] = m;
    if (m < 0.5) still++;
    const X = (x + 0.5) / h, Y = (h - 0.5 - y) / h;
    const wm = m * (1 - skyAt(y * w + x));   // the sky is not the sea the waves come from
    lx += (1 - m) * X; ly += (1 - m) * Y; ls += 1 - m; wx += wm * X; wy += wm * Y; ws += wm;
  }
  // b: how close the land is, where waves surge up the rocks and drain back
  // (a sea in perspective only: water.js uses it on the water, times r). It
  // keeps rising all the way onto the land, so its slope always points at it.
  let byLand = null;
  if (seaHorizon && on) {
    const rn = Math.max(1, Math.round(0.04 * LONG));
    byLand = blur(blur(mask.map((m) => 1 - m), w, h, rn), w, h, rn).map((x) => smooth(0.03, 0.6, x));
  }
  const tex = maskTexture(w, h, mask, seaHorizon && on ? swayOf(grid, sky, (i) => 1 - mask[i]) : new Float32Array(n), byLand);
  const dx = ls > 0 && ws > 0 ? lx / ls - wx / ws : 0, dy = ls > 0 && ws > 0 ? ly / ls - wy / ws : 0;
  const onshore = on && Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : null;
  return { tex, on, still: still / n, water: wet / n, land: solid / n, contact, onshore };
}
