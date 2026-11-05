---
name: asciigraph
description: Bring a still photo to life as a seamless looping video and ASCII animation, moving each part the way it should: sea and rivers flow and waves roll ashore, clouds drift, grass and crops sway, sand and rock stay still. Exports an MP4. Use when someone asks to animate a still image, make a photo "move" or "breathe", make a cinemagraph, turn a picture into an ASCII animation or ASCII video loop, or make water, sky, grass, fur, hair, wheat or brush strokes move.
---

# asciigraph

Turns one image into a seamless loop: strands that sway like a school of fish, plus an ASCII layer whose stroke glyphs follow each strand's heading. Water photos get a water scene instead (travelling swell, foam that churns, a still shore), and skies get drifting clouds. Output is an MP4 (ASCII, and optionally the scene without ASCII).

## Workflow

1. **Install once.** In the repo folder: `npm install`.
2. **Place the image** in `input/`. Read it first and say whether it suits the effect: best are images of many fine strokes with a clear direction (grass, fur, hair, wheat, reeds, painterly brushwork, wind-swept water). Hard-edged subjects (buildings, faces, text) smear; say so before spending a render. Sea, rivers and other water use `scene=water`. Photos with a big sky over land (a city, a beach under cloud) use `scene=sky`: only the clouds drift (a city of blue glass is taken for water unless you say so). The default `scene=auto` picks grass, water or sky from the image's colours and refuses anything else; for fur, hair, paintings or other non-green strand subjects, add `scene=grass`.
3. **Start the server** with `npm start` (port 5177; set `PORT` to change it). Run it in the background.
4. **Preview stills** in a browser tab you control (never one the user is watching): `http://localhost:5177/?img=input/NAME&t=0.25`, plus `&mode=flow` for the scene without the ASCII layer. For water with a shore, also open `&shore=show`: the red tint is what stays still, and it should cover dry land only (if it covers water, use `&shore=off`). With a sky, open `&sky=show`: the blue tint should cover the sky only, down to the horizon or skyline (if it covers sea, sand or buildings, use `&sky=off`). Check:
   - **Wind direction** (`wind`): default `auto` follows the texture. If strands run against the obvious flow, set degrees (0 = right, 90 = up).
   - **Light** (`light`): set to where the light in the image comes from (130 = upper left, 45 = upper right, 270 = below).
   - **Strand size**: strands too fat or sparse for the texture → raise `density`.
5. **Export** with `?img=input/NAME&export=ascii,flow` (add any tuning parameters). Keep the tab in front until the title reads `done` (or `failed`; a refused image also reads `failed`, with the reason on the page). A 12 s loop at 1080 px wide takes about 10 minutes. Results: `out/NAME-ascii.mp4`, `out/NAME-flow.mp4` (water and sky scenes add `-water` or `-sky`, crops add their size before it: `NAME-1080x2340-water-ascii.mp4`).
6. **Verify** before handing over (see Checks), then report the file paths and anything that looked weak.

## Parameters (URL)

`img` (default: the sample), `mode` ascii|flow, `width` (default 1080), `height` (default: follows the image; with `width` set, the image is cropped to that shape), `focus` x,y 0–1 (which part to keep when cropping, default 0.5,0.5), `scene` auto|grass|water|sky (default auto), `shore` auto|off|show (water: keep dry land still, default auto), `sky` auto|off|show (drift the clouds, default auto), `cloud` degrees (cloud drift direction, default 0 = right), `clouds` (cloud speed, default 1), `haze` (a sea seen from the shore: haze at the horizon, default 0.35), `wind` auto|degrees, `light` degrees (default 130), `amp` sway (default 1), `density` (default 1), `loop` seconds (default 12), `fps` (default 30), `t` 0–1 freeze, `export` ascii,flow.

**Wallpapers.** Set `width` and `height` to the screen's native resolution (e.g. 3840×2160 desktop, 1290×2796 phone) and choose `focus` from stills. Never render small and upscale: glyphs are 5×7 px and blur. A longer `loop` adds no variety: every motion term repeats a whole number of times per loop, so it only slows the motion down.

## Checks

Run these on every export:

1. **Seamless loop**: `npm run check -- out/NAME-ascii.mp4` must print `✓ seamless` (last→first change no bigger than an ordinary frame step).
2. **Motion reads at phone size.** Scale two frames 0.5 s apart to 360 px wide and compare: PSNR should be about 25 dB or lower. If it is near 29+, motion is too subtle — raise `amp` (try 1.3–1.5). Users judge this on a phone, where small sway disappears.
3. **Colour matches the image.** Scale the ASCII frame and the source image to ~108 px wide and compare per brightness band: ASCII/source brightness ≈ 1.0–1.1, saturation ≈ the source's. Bright pixels must not be white-washed or neon. Do not "fix" dullness by pushing exposure or stroke saturation; that is what made earlier versions look blown-out and fluorescent.
4. **No black specks**: none should appear; if they do, a shader produced NaN (see Pitfalls).

## Pitfalls already solved — keep them solved

- **NaN specks.** MSAA can extrapolate varyings slightly outside 0–1; `pow()` of a negative is NaN, which mipmapping spreads into black squares. Clamp before `pow`. Guard `atan(0, 0)`.
- **Loop seam.** Every moving term must repeat a whole number of times per loop. Noise that drifts must use the periodic `pfbm` with an integer period on the drift axis.
- **GLSL comments** must not end in a backslash (it continues the line and swallows the next one). `half` is reserved in GLSL — don't use it as a name.
- **Brightness by angle.** Stroke glyphs are fitted so each weight lights the same pixel count at every angle; otherwise horizontal strands read darker than diagonal ones.
- **Highlights.** Strokes keep their cell's own saturation and only ease toward warm cream at the very top. Whitening them loses the colour; boosting their saturation looks neon.
- **Shadows.** Shadows keep thin strokes plus a glow so they read as dark colour, not black.

## Changing the look

- Motion: `STRAND_VS` in `src/field.js` (`amp`, the `wave`/`sub`/`lean` mix, `own`).
- Light: `sunDir`, `sunPool`, `poolTint` in `src/field.js`.
- Glyphs and colour: `WEIGHTS` and the colour solve in `src/ascii.js`; the dot ramp in `src/font5x7.js`.
