# Internals

Only needed when changing the code. After any change, re-run the Checks in SKILL.md on at least one water, one sky and one grass image (`examples/beach.png` and `examples/grass.png` are two of them).

## Where things are

| File | What it does |
|---|---|
| `src/main.js` | reads the URL, picks the scene, runs preview and export |
| `src/masks.js` | shared helpers: the photo read once on a coarse grid (160 cells on the long side), flood fill, mask textures |
| `src/sky.js` | finds the sky, the horizon and whether a sea lies under it |
| `src/shore.js` | finds dry land to keep still, the grass on it that may sway, and how near each point is to land |
| `src/classify.js`, `src/waterstats.js` | the scene guess, and the photo's own wave size and heading |
| `src/water.js` | water and sky scenes: perspective swell, the waves breaking on land, drifting clouds, horizon haze |
| `src/field.js` | grass scene: the swaying strands |
| `src/pour.js` | waterfall, steam and fire scenes: what runs in streaks down or up the frame (or, for fire, what is flame-coloured) and the drift along them, the pool below a fall, a fire's flicker and the light it throws |
| `src/ascii.js`, `src/font5x7.js`, `src/post.js` | turning a frame into stroke glyphs |
| `src/marks.js`, `src/editor.js` | painted marks: read onto the grid, applied in `sky.js` and `shore.js` (`field.js` for grass, `pour.js` for waterfalls, steam and fire); the `E` brush |
| `scripts/check-loop.mjs` | the seamless check |

## Changing the look

- **Grass motion:** `STRAND_VS` in `src/field.js` (`amp`, the `wave`/`sub`/`lean` mix, `own`).
- **Grass light:** `sunDir`, `sunPool`, `poolTint` in `src/field.js`.
- **Water:** `buildWater` in `src/water.js`. The comment block above each uniform says what it does.
- **Glyphs and colour:** `WEIGHTS` and the colour solve in `src/ascii.js`; the dot ramp in `src/font5x7.js`.
- **What counts as sky or land:** the thresholds at the top of `src/sky.js` and `src/shore.js`. Their header comments explain which mistake each one guards against. Sea read as land freezes; land read as sea wobbles. Weigh which is worse for the photos at hand before moving a threshold.

## Pitfalls already solved — keep them solved

- **Loop seam.** Every moving term must repeat a whole number of times per loop. Noise that drifts must use the periodic `pfbm` with an integer period on the drift axis. Water drifts with three offset copies cross-faded with weights `(1 − cos 2πp)/3`. Their squared weights always sum to ½, so contrast is lifted by a constant ×1.19 instead of pulsing. Averaging the copies blurs the water by their spacing (drift ÷ 3 per cycle), so keep cycles high and each one short (18 by default): that was worth +15–20% fine detail with no added flicker. A sea seen from the shore keeps 6, since there the gain was small and the flicker rose. Tilting the weights toward one copy (softmax-style priorities, as in Holynski et al.) was tried instead: it sharpened only when it nearly picked one copy, and then flickered 3× more.
- **NaN specks.** MSAA can push varyings slightly outside 0–1; `pow()` of a negative is NaN, and mipmapping spreads it into black squares. Clamp before `pow`. Guard `atan(0, 0)`. Guard every division whose denominator can reach zero (`max(x, 0.02)`).
- **A shader that fails to compile can fail quietly.** When the ASCII direction pass broke, the water ASCII fell back to plain ramp glyphs with no visible error. After editing a shader, check the console for GLSL errors and look at the ASCII, not just the flow view. Redefining a name in the same scope (a second `float w`) is enough to break it.
- **GLSL comments** must not end in a backslash: it continues the line and swallows the next one. `half` is reserved in GLSL; don't use it as a name.
- **Brightness by angle.** Stroke glyphs are fitted so each weight lights the same pixel count at every angle. Otherwise horizontal strands read darker than diagonal ones.
- **Highlights.** Strokes keep their cell's own saturation and only ease toward warm cream at the very top. Whitening them loses the colour (golden fields went pale this way), and boosting saturation looks neon. Strand glints take their colour as `mix(light, hue, sat²)`.
- **Shadows.** Shadows keep thin strokes plus a glow, so they read as dark colour, not black.
- **Waves breaking.** The shore surge runs in, bursts white and falls back, in three beats. Its direction comes from the gradient of an unmasked "near land" channel, so it doesn't flip where the mask ends. A surge that only pulls toward the land looks like water being sucked into the shore.
- **Perspective.** The sea is a plane seen from the shore. Screen motion is scaled by distance, and the along-view part by a further `seaLine · ps²`. Without that factor the far sea moves as fast as the near sea and looks like a wall.
- **Marks and the loop.** Where grass is painted still, its light and gusts are held at the loop's first moment. At a soft edge they blend the held and the live value. Never slow the clock there instead (`uT * calm`): a partly slowed clock doesn't come back round, and the loop jumps.
- **Marks and the scene guess.** The scene is chosen on the sky as found, not as marked. Otherwise painting the clouds still turns a sky photo into a "water" one.
- **Flicker.** Measure it, don't eyeball it: the block-averaged (32×32) second difference between frames, near, mid-distance and far. Fine detail far off flickers first. Fade each wave by its on-screen wavelength.
