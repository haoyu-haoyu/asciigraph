# URL options

Everything goes in the page's URL: `http://localhost:5177/?img=input/NAME&option=value&…`.

## Input, size and output

| Option | Default | What it does |
|---|---|---|
| `img` | `examples/beach.png` | the image, as a path inside the repo folder |
| `width` | 1080 | output width in px (rounded to even) |
| `height` | follows the image | set it, together with `width`, to crop the image to that shape |
| `focus` | `0.5,0.5` | which part to keep when cropping: across, then down, each 0–1 |
| `mode` | `ascii` | what the page shows: `ascii` or `flow` (`M` toggles, space pauses) |
| `t` | — | freeze at this point of the loop, 0–1; use it for stills |
| `export` | — | `ascii`, `flow` or `ascii,flow`: render the whole loop and encode MP4s |
| `loop` | 12 | loop length in seconds |
| `fps` | 30 | frames per second |

## Scene

| Option | Default | What it does |
|---|---|---|
| `scene` | `auto` | `grass`, `water`, `sky`, `waterfall`, `steam` (use it for smoke and rising mist too) or `fire` (candles, campfires, fireplaces). `auto` picks grass, water or sky from the colours and refuses anything that is none of them; it never picks `waterfall`, `steam` or `fire`, so ask for those by name |
| `shore` | `auto` | water: keep dry land still. `off` makes it all water; `show` tints the still part red (in `waterfall`, `steam` and `fire` too) |
| `marks` | — | a PNG of hand-painted corrections (see below). `E` in the page paints one and adds it for you |
| `sky` | `auto` | drift the clouds. `show` tints what it reads as sky blue. `off` ignores the sky altogether: in a water scene it then moves with the water, and a sky scene can't run without it (`scene=sky&sky=off` is refused) |

How `auto` decides:

- A mostly green frame is grass.
- Otherwise, if there is a sky along the top edge, what lies under it decides. It's a water scene, with the clouds drifting too, when there is enough water under the sky and either the sky meets a sea or the whole frame reads as water. Otherwise it's a sky scene if at least a fifth of the frame is sky.
- With no sky (or `sky=off`), the colour guess alone decides: water, grass, or refused.
- A sky photo with no water keeps everything under the sky still.

What `waterfall` and `steam` move: only what runs in streaks down the frame (a waterfall) or up it (steam), is lighter than what is around it and isn't strongly coloured. It moves along those streaks; everything else stays still. Below a waterfall, the water it lands in moves too: a pool or the river it feeds, found from the fall's foot outward through what is coloured like water and not like rock. It drifts away from the foot, with rings of ripples spreading out and a little churn; rocks in it stay still. Open `shore=show` to check: only the falling water, the plume or the pool should be untinted. A highlight that runs up the side of a cup can read as steam: paint it red. `wind` and `shore=off` do nothing in these two scenes.

What `fire` moves: what is bright, flame-coloured (red through yellow, or a white-hot core) and lighter than what is around it. It moves the way real flames do: the base holds at the fuel, read from the photo; higher up the flame is drawn new each moment, in the photo's own flame colours and within its shape, as thin tongues that rise, curl and break off at the tips. A wide fire also swells and shrinks about once a second, and its brightness wavers. A narrow, tall flame (a candle) is calm: it only sways and flickers gently. It lights the room around it: everything within about a quarter of the frame brightens and dims with it. Anything as bright and warm as a flame reads as one: candle wax lit from above, a sunset, a lamp; so can a near-white highlight brighter than its surroundings (a window, white paper), since a flame's white-hot core counts. Paint those red. Red keeps them from rising, but they still brighten and dim in the fire's light. `wind` and `shore=off` do nothing here.

## Marks

A marks file overrides what the masks found, wherever it is painted:

- **Red** (255, 0, 0): keep this still. No swell, no cloud drift, no grass sway, and on grass the light is held too. In `fire`, a red part still brightens and dims in the fire's light; it only stops rising.
- **Green** (0, 255, 0): this is water; let it move, even if it was read as land or sky. In `waterfall` and `steam`, green is more of the fall or the plume, moving the way the streaks around it run; in `fire`, it is more of the flame. A grass scene already moves everywhere, so it ignores green.
- **Transparent:** leave it to the masks. Alpha is how strongly a mark applies, so soft edges blend.

The file has the shape of the whole, uncropped photo (any resolution), so it still fits after `width`, `height` or `focus` change. The scene guess ignores the marks: they only change what moves.

To make one without the brush, draw it on a canvas in the page and post it; the server saves it as `input/NAME-marks.png` and answers with the path:

```js
const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = '/input/NAME.jpg'; });
const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
const g = cv.getContext('2d');
g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0.30 * cv.width, 0.55 * cv.height, 0.15 * cv.width, 0.2 * cv.height);   // keep still
const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
(await fetch('/marks?img=input/NAME.jpg', { method: 'POST', body: blob })).json();   // → { file: 'input/NAME-marks.png' }
```

## Motion

| Option | Default | Applies to | What it does |
|---|---|---|---|
| `amp` | 1 | all | how far things move. 0.6 is calm, 1.3–1.5 lively (water stops growing at 1.4). Waterfall and steam: how much the strands sway sideways and the pool churns; `speed` sets how fast they run. Fire: how far the flames sway and stretch, how much they flicker, and how strongly the room's light follows |
| `wind` | auto | grass, water | direction in degrees (0 = right, 90 = up). Grass: the way strands lean. Water: overrides the wave heading it reads from the photo |
| `light` | 130 | all | where the light comes from, in degrees (130 = upper left, 45 = upper right, 270 = below) |
| `density` | 1 | grass | strand density; raise it when strands look fat or sparse for the texture |
| `speed` | 1 | water, waterfall, steam, fire | water: how fast the waves run. Waterfall and steam: how fast it falls or rises, and the pool's drift and ripples. Fire: how fast the tongues rise, puff and waver (0 holds them, the room's light included) |
| `wavelength` | from the photo | water | wave size in frame heights, when the photo's own reads wrong |
| `churn` | from the photo | water | how much the surface churns in place (surf) versus drifting (a river) |
| `drift` | from the photo | water | how fast the surface texture drifts |
| `cycles` | 18 (6 for a sea seen from the shore; 36 for a waterfall, 12 for steam, per 12 s) | water, waterfall, steam | whole drift cycles per loop, at the same speed: more keeps the water sharper, fewer restart the drift less often. Lower it if the surface seems to shimmer |
| `cloud` | 0 | any scene with a sky | cloud drift direction in degrees (0 = right) |
| `clouds` | 1 | any scene with a sky | cloud speed; the one speed control in a sky scene |
| `haze` | 0.35 | water with a sea horizon | haze where the sea meets the sky; `0` for none |

The water reads its heading from the photo's own waves. When the photo shows a sea horizon, waves come in from it in perspective: smaller and slower far off, breaking white where they reach land. Without a horizon, they head onshore if it found a shore, and otherwise along the photo's streaks (or `wind`, when given).

## Sizes worth knowing

| Target | `width` × `height` |
|---|---|
| iPhone 15 / 15 Pro | 1179 × 2556 |
| iPhone 15 Plus / Pro Max | 1290 × 2796 |
| Common Android phone | 1080 × 2400 |
| 1440p desktop | 2560 × 1440 |
| 4K desktop | 3840 × 2160 |
| GitHub README / profile banner | 840 × 340 (wide and short; see sharing.md) |
| README gallery tile | 520 × 520 |

Render at the size it will be shown. Glyphs are 5×7 px: scaling an ASCII render up or down blurs them.
