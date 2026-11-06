---
name: asciigraph
description: Bring a still photo to life as a seamless looping video and ASCII animation, moving each part the way it should: sea and rivers flow and waves roll ashore, waterfalls pour, steam and smoke rise, flames flicker, clouds drift, grass and crops sway, sand and rock stay still. Exports MP4, and GIF or WebP for sharing. Use when someone asks to animate a still image, make a photo "move" or "breathe", make a cinemagraph or a live/animated wallpaper, turn a picture into an ASCII animation or ASCII video loop, make an animated banner for a GitHub README or profile, or make water, a waterfall, steam, smoke, fire, a candle, a fireplace, stars, city lights at night, fairy lights, sky, grass, fur, hair, wheat or brush strokes move.
---

# asciigraph

Turns one image into a seamless loop. Water gets a travelling swell that breaks white on the shore, skies get drifting clouds and horizon haze, grass and other strand textures sway, and land stays still. Every loop comes in two versions: `ascii` (the motion drawn in stroke characters that turn with it) and `flow` (the photo itself in motion).

This file is the workflow. Read these when the step calls for them:

- [references/motion.md](references/motion.md): what each part of a photo should do (move or stay still, and how), what wrong looks like, and the fix. Read it before step 2 and when judging every render.
- [references/parameters.md](references/parameters.md): every URL option, scene choice, wallpaper sizes.
- [references/sharing.md](references/sharing.md): GIF / WebP / MP4, file sizes, GitHub README and profile banners.
- [references/internals.md](references/internals.md): solved pitfalls and where to change the look. Only needed when editing the code.

## Where things are

- The repo folder is this skill's folder (the one holding this file). Run every command from there.
- The user's photo goes in `input/` (gitignored). Copy it there; don't move or edit their original. The page can only open files inside the repo folder.
- Results land in `out/`: `out/TAG.mp4` and, next to it, the folder `out/TAG/` with every frame as `f_0000.png`… `TAG` is the image's name, then the size if cropped, the scene for water or sky, and the mode: `beach-1179x2556-water-ascii`.
- Built-in sample: `examples/beach.png` (opened when `img` is left out).

## Workflow

1. **Install once:** `npm install`.
2. **Look at the photo first** and say whether it suits the effect, before spending a render:
   - Good: sea, surf, rivers, lakes with a breeze, skies with clouds, grass, crops, reeds, fur, hair, painterly brushwork, waterfalls, steam and smoke against a darker background, candles, campfires and fireplaces, starry skies and lights at night.
   - Poor: hard-edged subjects (buildings, faces, text) smear; say so.
   - The default `scene=auto` picks grass, water or sky from the colours and refuses anything else. Fur, hair, paintings or other non-green strands need `scene=grass`.
   - Waterfalls need `scene=waterfall`; steam, smoke and rising mist need `scene=steam`. Flames need `scene=fire`. Auto never picks these three. Only the falling water or the plume moves, along its own streaks, plus the pool or river a fall lands in; rock and everything else stays still. Fire moves the flames and makes the room they light flicker with them; candle wax and sunsets read as flame, so paint them red.
   - Stars and lights at night need `scene=twinkle`; auto never picks it. Only small bright points against a darker surround twinkle, the bigger and brighter ones most; nothing else moves. Check `shore=show`: lit windows, leaves catching light or a lamp-lit plant can count as points, so paint them red.
3. **Start the server** in the background: `npm start` (port 5177; set `PORT` to change it).
4. **Preview stills** in a browser tab you control, never one the user is watching: `http://localhost:5177/?img=input/NAME&t=0.25`. Add `&mode=flow` to see it without the ASCII. Then check what it decided:
   - Water with a shore: open `&shore=show`. The red tint is what stays still and should cover dry land only. If it covers water, use `&shore=off`.
   - A sky: open `&sky=show`. The blue tint should cover sky only, down to the horizon or skyline. If it covers sea, sand or buildings, use `&sky=off`. That ignores the sky entirely: over water the sky then moves with the sea, and the scene guess is made without it.
   - Grass: wind direction (`wind`), light direction (`light`), strand size (`density`). See parameters.md.
   - Anything in the wrong region (a rock that swims, a cliff that breathes, a sea read as land): fix it with marks. Red keeps still, green lets it move. Either ask the user to press `E` in the page and paint, or make the marks file yourself (parameters.md, Marks). Then add `&marks=input/NAME-marks.png` to every URL that follows, export included.
   - Crops (wallpapers, banners): set `width` and `height` to the final size and move the frame with `focus`.
5. **Export:** `?img=input/NAME&export=ascii,flow` plus the tuning options. Keep that tab in front until the title reads `done` or `failed` (a refused image also reads `failed`, with the reason on the page). A background or hidden tab renders several times slower. A 12 s loop at 1080 px wide takes about 10 minutes.
6. **Check it** (below), convert it if it's going somewhere other than a video player (sharing.md), then report the file paths and anything that looked weak.

## Checks

Run on every export. Get the bundled ffmpeg with `FF=$(node -p "require('ffmpeg-static')")`.

1. **Seamless loop:** `npm run check -- out/TAG` (the frame folder) must print `✓ seamless`.
   - Check the folder, not the MP4. Compression makes the MP4's first frame sharper than its last, so a perfect loop can fail on the MP4. When the folder passes and the MP4 doesn't, the loop is fine.
   - A real failure in the folder means some motion term doesn't repeat a whole number of times per loop (internals.md).
2. **Motion reads at phone size:** compare two frames 0.5 s apart (15 frames at 30 fps), both scaled to 360 px wide:
   `$FF -i out/TAG/f_0000.png -i out/TAG/f_0015.png -lavfi "[0]scale=360:-1[a];[1]scale=360:-1[b];[a][b]psnr" -f null - 2>&1 | grep average`
   - About 25 dB or lower is good.
   - Near 29 or above, the motion is too subtle. Raise `amp` (try 1.3–1.5; water stops growing at 1.4). People judge this on a phone, where small sway disappears.
3. **Colour matches the photo:** scale an ASCII frame and the source (cropped the same way) to about 108 px wide and compare them per brightness band.
   - ASCII brightness over source brightness should be about 1.0–1.1, and saturation about the source's.
   - Bright parts must keep their colour, not wash out to white or go neon.
   - Dark bands may read a little brighter in ASCII. That's expected from how cells are drawn.
   - Don't "fix" dullness by pushing exposure or stroke saturation. That's what made earlier versions look blown out.
4. **No black specks.** If any appear, a shader produced NaN (internals.md).
5. **Each part moves like the real thing.** Watch the flow version for a whole loop, then the ASCII one. Go through the parts you named before rendering, and check each against references/motion.md: still things still, waves heading toward the land in perspective, foam breaking and running back, clouds slow. Fix what has a fix; report what's a limit.

## Common requests

- **Phone or desktop wallpaper:**
  - Set `width` and `height` to the screen's native resolution, e.g. 1179×2556 (iPhone 15 Pro), 1290×2796 (iPhone 15 Pro Max), 3840×2160 (4K desktop).
  - Choose `focus` from stills, then export `flow` (and `ascii` if they want it).
  - Never render small and upscale: glyphs are 5×7 px and blur.
- **GitHub README or profile banner:** render at the size it will be shown, wide and short (e.g. 840×340), then convert. ASCII becomes a GIF; a plain flow loop becomes a WebP. See sharing.md for the exact commands and size budgets.
- **"Make it calmer / livelier":** `amp` 0.6–1.5. For water, `speed` changes how fast the waves run. For skies, `clouds` sets the cloud speed and `cloud` the direction. A longer `loop` adds no variety: every motion repeats a whole number of times per loop, so it only slows things down.
- **It guessed the scene wrong:** set `scene=water|grass|sky`. If it refuses the image, the page says what it measured. Only override when the photo really is one of them.

## Known limits

Say so up front when a photo hits one of these:

- It reads water, land and sky from colour and texture alone. A white or pale building against a pale sky, snow, or a city of blue glass can be misread.
- A sunset's orange band stays with what is below it.
- Very thin objects (a pier, a boat, a mast) are below the mask's resolution and may move with the water. Paint them still with marks.
