# Sharing a loop

The export gives you MP4s, which is what a phone's live wallpaper, a video player or a chat app wants. Anywhere that only shows images needs GIF or WebP. That includes a GitHub README or profile, many docs sites, and Markdown in general.

Always convert from the frame folder `out/TAG/`, not from the MP4: the frames are lossless, the MP4 isn't. Use the bundled ffmpeg:

```bash
FF=$(node -p "require('ffmpeg-static')")
```

## Which format

| Content | Format | Why |
|---|---|---|
| ASCII (`ascii`) | **GIF** | Sharp glyph edges in a few flat colours, which is what GIF is good at. Lossy WebP subsamples colour (4:2:0) and blurs coloured glyphs |
| Plain photo loop (`flow`) | **animated WebP** | Smooth photographic colour. As a GIF it needs dithering and comes out about 5× bigger |
| Phone wallpaper, video | **MP4** | As exported |

## Commands

**ASCII as GIF** (palette built from the changes between frames, no dithering so glyphs stay crisp):

```bash
$FF -v error -y -framerate 30 -i out/TAG/f_%04d.png \
  -vf "fps=15,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 out/TAG.gif
```

**Flow as animated WebP:**

```bash
$FF -v error -y -framerate 30 -i out/TAG/f_%04d.png -vf fps=20 \
  -c:v libwebp -lossless 0 -quality 72 -compression_level 6 -loop 0 out/TAG.webp
```

Notes:

- `-framerate 30` must match the export's `fps` (30 unless it was set), or the loop plays at the wrong speed.
- Dropping 30 → 15 fps (`fps=15`) keeps the loop seamless as long as the frame count divides evenly: 360 frames become 180.
- Don't `scale=` an ASCII render; render at the target size instead. Cropping is fine: `crop=400:400:60:60,` in front of `fps=`.
- In zsh, write variables inside filter strings with braces: `${N}:stats_mode`, not `$N:stats_mode`, or zsh reads `:s` as a modifier.
- ffmpeg can't decode animated WebP back. Check a WebP by opening it in a browser.

## File size

Dense, fast-changing ASCII (a whole field of swaying rice) barely compresses: every glyph changes every frame. Sizes from real runs:

| Loop | Size |
|---|---|
| beach banner, ASCII GIF, 840×340, 30 fps | 11.8 MB (over budget; 15 fps would roughly halve it) |
| coast, ASCII GIF, 520×520, 15 fps | 3.5 MB |
| clouds, ASCII GIF, 520×520, 15 fps | 3.8 MB |
| rice field, ASCII GIF, 520×520, 15 fps, 96 colours | 19.5 MB (too big) |
| same, cropped to 400×400 | 11.9 MB |
| bay, flow WebP, 360×540, 20 fps | 4.8 MB |

To shrink one, in this order: lower fps (15) → crop to a smaller window → fewer colours (96, then 64; watch for banding) → a calmer scene or lower `amp`. Aim for under ~10 MB per image so a page loads in reasonable time.

## Wallpapers

Export at the screen's size (`size=`, parameters.md) and hand over the MP4 as it is: wallpaper apps play video, and the loop is seamless, so it repeats with no jump.

| Device | How it plays | What to tell them |
|---|---|---|
| Windows | **Wallpaper Engine** (Steam) or **Lively Wallpaper** (free) | Wallpaper Engine: create a wallpaper from the MP4 (Workshop uploads accept only MP4). If it hitches where the loop restarts, set its video loading to load into memory |
| Android | a video live-wallpaper app; some phones set a video on the lock screen themselves | Samsung lock screens take a video of up to 15 s: keep `loop` at 15 or below |
| Mac | no built-in way: a video wallpaper app | 2880×1864 is a 15" MacBook Air; use the screen's own size for others |
| iPhone, iPad | can't loop a video as wallpaper; a Live Photo plays briefly as the phone wakes | on a Mac, `node bin/asciigraph.mjs live input/NAME` makes one (below). Say up front that it plays once on waking, not on repeat |

A 4K loop takes about four times as long to render as 1080p. Preview it at `width=960` first.

### Live Photo (iPhone)

`node bin/asciigraph.mjs live input/NAME [--size iphone-max] [--seconds 3]` renders the loop (at `size=iphone` unless told otherwise) and writes a pair to `out/`: `NAME….heic` (the first frame) and `NAME….mov` (the first few seconds), sharing an identifier so Photos joins them into one Live Photo. It also takes an MP4 already made. macOS only: it uses AVFoundation through `swift`.

Tell them: send both files to the phone together (AirDrop them in one go, or import both into Photos on the Mac and let iCloud sync), open it in Photos to check it moves, then Settings → Wallpaper → Add New Wallpaper → Photos. iOS only plays it when the phone wakes. Whether iOS accepts a given Live Photo for the lock screen is iOS's call: it sometimes refuses one with "motion not available"; a shorter `--seconds` is the thing to try.

## Terminal and curl

- `node bin/asciigraph.mjs play input/NAME` renders a small flow loop and plays it as coloured text in the terminal until Ctrl-C. `--style ascii` draws characters instead of half-blocks; `--cols` sets the width.
- `node bin/asciigraph.mjs stream input/NAME` serves it: `curl http://localhost:7777` plays it in any terminal that shows 24-bit or 256 colours. It listens on 127.0.0.1 only; `--host 0.0.0.0` opens it to the network, so ask first.
- Both also take an MP4 already made.

## On a web page

`src/element.js` defines `<living-photo>`, which renders the photo live in the page (WebGL), so no video is downloaded. The page needs an import map for `three` and loads the element as a module; README.md has the snippet and `embed.html` an example. Photos from another site must allow CORS. Each element is one WebGL context; browsers allow about 16 at once, so keep it to a few per page.

## GitHub README

- GitHub strips scripts, canvas, iframes and styles, so the page can't animate live. A GIF, animated WebP or animated SVG in the repo is the way.
- Reference images by repo-relative path so they work in private repos too: `<img src="./assets/banner.gif" width="100%" alt="…">`.
- Put the banner in its own centred paragraph at the very top: `<p align="center"><img …></p>`.
- Always write `alt` text that says what the loop shows.
- A gallery row is a `<table>` of `<td width="33%">` cells with the images at `width="100%"`, and a caption row under it.
- An SVG shown as an image can't load anything from outside itself. To put a raster image inside an SVG (a section header over a strip of ASCII), embed it as a base64 `data:` URI in `href`.
- Preview before pushing: render the README with GitHub's own renderer and open it locally next to the assets:

  ```bash
  jq -Rs '{text:., mode:"gfm"}' < README.md | gh api markdown --input - > /tmp/body.html
  ```

  Wrap the output in a page that loads `github-markdown-css` and save it in the repo folder so the relative image paths resolve, then open it from the running server and delete it afterwards.

## GitHub profile

The profile README lives in a repo named exactly like the account (`USER/USER`), shown at github.com/USER. Put the banner at the top of its `README.md` the same way, with the image committed in that repo (e.g. `assets/banner.gif`). Ask before pushing to it: it's public.
