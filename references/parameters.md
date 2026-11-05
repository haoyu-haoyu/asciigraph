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
| `scene` | `auto` | `grass`, `water` or `sky`. `auto` picks one from the colours and refuses anything that is none of them |
| `shore` | `auto` | water: keep dry land still. `off` makes it all water; `show` tints the still part red |
| `sky` | `auto` | drift the clouds. `show` tints what it reads as sky blue. `off` ignores the sky altogether: in a water scene it then moves with the water, and a sky scene can't run without it (`scene=sky&sky=off` is refused) |

How `auto` decides:

- A mostly green frame is grass.
- Otherwise, if there is a sky along the top edge, what lies under it decides. It's a water scene, with the clouds drifting too, when there is enough water under the sky and either the sky meets a sea or the whole frame reads as water. Otherwise it's a sky scene if at least a fifth of the frame is sky.
- With no sky (or `sky=off`), the colour guess alone decides: water, grass, or refused.
- A sky photo with no water keeps everything under the sky still.

## Motion

| Option | Default | Applies to | What it does |
|---|---|---|---|
| `amp` | 1 | all | how far things move. 0.6 is calm, 1.3–1.5 lively (water stops growing at 1.4) |
| `wind` | auto | all | direction in degrees (0 = right, 90 = up). Grass: the way strands lean. Water: overrides the wave heading it reads from the photo |
| `light` | 130 | all | where the light comes from, in degrees (130 = upper left, 45 = upper right, 270 = below) |
| `density` | 1 | grass | strand density; raise it when strands look fat or sparse for the texture |
| `speed` | 1 | water | how fast the waves run |
| `wavelength` | from the photo | water | wave size in frame heights, when the photo's own reads wrong |
| `churn` | from the photo | water | how much the surface churns in place (surf) versus drifting (a river) |
| `drift` | from the photo | water | how far the surface texture drifts |
| `cycles` | 6 | water | whole drift cycles per loop; more means shorter, busier drift |
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
