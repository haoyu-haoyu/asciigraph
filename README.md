<p align="right"><b>English</b> · <a href="./README.zh-CN.md">中文</a></p>

<p align="center"><img src="./assets/readme/banner.gif" width="100%" alt="Waves washing up a sandy beach, drawn in ASCII characters"></p>

<h1 align="center">asciigraph</h1>

<p align="center">Give it one photo. Get back a short loop where the sea rolls in, clouds drift and grass sways,<br>drawn as a normal video or as moving ASCII.</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%E2%89%A522-0b1519?style=flat-square&labelColor=0b1519&color=e2c48c" alt="Node 22.12 or newer">
  <img src="https://img.shields.io/badge/runs%20in-the%20browser-0b1519?style=flat-square&labelColor=0b1519&color=5f9e98" alt="Runs in the browser">
  <img src="https://img.shields.io/badge/license-MIT-0b1519?style=flat-square&labelColor=0b1519&color=8fa9a6" alt="MIT license">
</p>

<br>

<img src="./assets/readme/en/section-what.svg" width="100%" alt="01 What it does">

You pick a photo. asciigraph works out which parts should move and how, and renders a loop that you can play forever without seeing where it starts again. The banner at the top is a single beach photo.

- **Water** moves like water: waves come in from the open sea toward the shore, get smaller toward the horizon, and break white where they hit rock or sand.
- **Sky** drifts. Clouds slide slowly sideways and the far sea fades into haze.
- **Grass and fields** sway with the wind, one strand at a time.
- **Everything else stays put.** Cliffs, sand, buildings and rocks don't wobble along with the water.

You get two versions of every loop: `flow`, the photo itself in motion, and `ascii`, the same motion drawn in characters that turn with whatever is moving under them.

<br>

<img src="./assets/readme/en/section-how.svg" width="100%" alt="02 How it reads a photo">

<p align="center"><img src="./assets/readme/en/regions.webp" width="100%" alt="The photo, what asciigraph sees in it (sky in blue, still land in red), the moving version, and the ASCII version"></p>

1. **It finds the sky.** Sky hangs from the top edge, is smooth, and stops at the horizon, so that's what it looks for.
2. **It finds the land.** Anything connected to sand, rock or a cliff is kept still. Grass on that land is allowed to sway.
3. **What's left is water.** It reads which way the photo's own waves already run and keeps them going in that direction, in perspective, so far waves are smaller and slower than near ones.
4. **Then it draws.** Each character's shape and angle comes from the motion right under it, which is why the ASCII looks like it's flowing instead of flickering.

<br>

<img src="./assets/readme/en/section-gallery.svg" width="100%" alt="03 Gallery">

<table>
  <tr>
    <td width="33%"><img src="./assets/readme/gallery/coast.gif" width="100%" alt="A grassy cliff over the sea, in ASCII"></td>
    <td width="33%"><img src="./assets/readme/gallery/rice.gif" width="100%" alt="A golden rice field in the wind, in ASCII"></td>
    <td width="33%"><img src="./assets/readme/gallery/clouds.gif" width="100%" alt="A sky full of clouds, in ASCII"></td>
  </tr>
  <tr>
    <td align="center"><b>Coast</b><br><sub>waves roll in, the cliff stays still</sub></td>
    <td align="center"><b>Rice field</b><br><sub>the whole field bends in the wind</sub></td>
    <td align="center"><b>Clouds</b><br><sub>nothing but sky, drifting</sub></td>
  </tr>
</table>

<p align="center"><sub>And the same thing without the ASCII, as a phone wallpaper (<code>mode=flow</code>):</sub></p>

<table>
  <tr>
    <td width="50%"><img src="./assets/readme/gallery/bay.webp" width="100%" alt="A curved bay from above, palm shadows on the sand, waves washing in"></td>
    <td width="50%"><img src="./assets/readme/gallery/surf.webp" width="100%" alt="Surf running up a sandy beach, seen from above"></td>
  </tr>
  <tr>
    <td align="center"><b>Bay</b><br><sub>the waves follow the curve of the shore</sub></td>
    <td align="center"><b>Surf</b><br><sub>foam runs up the sand and slides back</sub></td>
  </tr>
</table>

<p align="center"><sub>Waterfalls and steam, which it moves along their own streaks (<code>scene=waterfall</code>, <code>scene=steam</code>):</sub></p>

<table>
  <tr>
    <td width="50%"><img src="./assets/readme/gallery/waterfall.webp" width="100%" alt="A tall waterfall in a fern forest pouring into a pool, ripples spreading out"></td>
    <td width="50%"><img src="./assets/readme/gallery/steam.webp" width="100%" alt="Steam curling up from a cup of tea"></td>
  </tr>
  <tr>
    <td align="center"><b>Waterfall</b><br><sub>the water falls, the pool ripples out, the cliff stays</sub></td>
    <td align="center"><b>Steam</b><br><sub>it rises along its own curls</sub></td>
  </tr>
</table>

<p align="center"><sub>Fire, found by its colour (<code>scene=fire</code>):</sub></p>

<table>
  <tr>
    <td width="50%"><img src="./assets/readme/gallery/campfire.webp" width="100%" alt="A campfire on a pebble shore at dusk, flames licking up off the logs"></td>
    <td width="50%"><img src="./assets/readme/gallery/candle.webp" width="100%" alt="A candle on a wooden table beside a mug and a book, its flame wavering"></td>
  </tr>
  <tr>
    <td align="center"><b>Campfire</b><br><sub>tongues of flame rise and break off, the logs stay put</sub></td>
    <td align="center"><b>Candle</b><br><sub>a small flame, so it only wavers</sub></td>
  </tr>
</table>

<p align="center"><sub>Stars and lights at night (<code>scene=twinkle</code>):</sub></p>

<table>
  <tr>
    <td width="50%"><img src="./assets/readme/gallery/stars.webp" width="100%" alt="The Milky Way over dark mountains and a still lake, the stars twinkling"></td>
    <td width="50%"><img src="./assets/readme/gallery/fairy.webp" width="100%" alt="Fairy lights strung across a bedroom window at night, the bulbs dimming and brightening"></td>
  </tr>
  <tr>
    <td align="center"><b>Starry sky</b><br><sub>the brightest stars flare the most, the faint ones barely flicker</sub></td>
    <td align="center"><b>Fairy lights</b><br><sub>each bulb on its own beat, the room stays still</sub></td>
  </tr>
</table>

<br>

<img src="./assets/readme/en/section-start.svg" width="100%" alt="04 Get started">

### Option 1: run it yourself

You need Node.js 22.12 or newer.

```bash
git clone https://github.com/haoyu-haoyu/asciigraph.git
cd asciigraph
npm install
npm start
```

The quickest way in is http://localhost:5177/demo.html: drop a photo on it, pick a scene and size, and download the MP4. It takes videos too: drop one in and it plays in ASCII, every style included, with the strokes turning to follow what really moves in it (the motion between frames); the download is up to 60 seconds and can keep the video's own sound. It all happens in the browser; nothing is uploaded, so the page also works as plain static files (on GitHub Pages, say).

Open http://localhost:5177 for the full page with every option; you'll see the beach example. To use your own photo, put it in `input/` and open:

```
http://localhost:5177/?img=input/your-photo.jpg
```

To save the videos, add `&export=ascii,flow` to the end. Keep the tab open until it says `done`; the files land in `out/`.

### Or from the command line

It drives the Chrome (or Edge) you already have, with no window:

```bash
node bin/asciigraph.mjs photo.jpg --size iphone --mode both --sound
```

`node bin/asciigraph.mjs --help` lists the rest. Any URL option goes through `--set`, e.g. `--set wind=30`.

### Option 2: let Claude Code do it

The repo includes a `SKILL.md`, so it installs as a skill for Claude Code, Codex, Cursor and other agents that read skills:

```bash
npx skills add haoyu-haoyu/asciigraph
```

Or, for Claude Code alone, clone it where it looks for skills:

```bash
git clone https://github.com/haoyu-haoyu/asciigraph.git ~/.claude/skills/asciigraph
```

Then just ask, for example: *"Make this beach photo into a phone wallpaper loop."* It runs everything above, checks that the right parts are moving, and fixes the settings if they aren't.

<details>
<summary><b>Walkthrough: a phone wallpaper</b></summary>
<br>

1. Put the photo in `input/` and open `http://localhost:5177/?img=input/beach.jpg`. It sorts out water, sand and sky by itself.
2. Crop it to your screen with `&size=android` (or `iphone`, `mac`, `1080p`, `4k`…; any other screen: `&width=1080&height=2340`). If the wrong part ends up in frame, move it with `&focus=0.5,0.3`: across, then down, both from 0 to 1.
3. Add `&shore=show` once. The sand should turn red and the sea shouldn't. If it missed a rock or got something wrong, press `E` and paint over it (below). Take `shore=show` off again when it looks right.
4. Add `&export=ascii,flow` and wait for `done`. Both videos are in `out/`.
5. Set the MP4 as your wallpaper: on Windows with Wallpaper Engine or Lively Wallpaper, on Android with a video wallpaper app (Samsung lock screens take it directly, up to 15 s), on a Mac with a video wallpaper app. An iPhone can't loop a video as wallpaper, but it takes a Live Photo, which plays when the phone wakes: `node bin/asciigraph.mjs live photo.jpg` (on a Mac) writes one. AirDrop both files to the phone together, then pick it under Settings → Wallpaper.

</details>

<details>
<summary><b>All options</b></summary>
<br>

Everything goes in the URL.

| Option | What it does |
|---|---|
| `img=input/photo.jpg` | the photo to use |
| `size=android` | a wallpaper size: `iphone`, `iphone-max`, `android`, `ipad`, `mac`, `1080p`, `1440p` or `4k` |
| `width=1080&height=2340` | output size; for a wallpaper, your screen size |
| `focus=0.5,0.3` | which part of the photo to keep when cropping |
| `mode=flow` | start in the plain view instead of ASCII |
| `ink=green`, `chars=braille`, `cell=2` | the ASCII look: one phosphor colour (`green`, `amber`, `white`) or dark ink on `paper`; `classic` characters, shaded `blocks`, `braille` dots or your own (`charset= .:-=+*#@`); bigger characters; `bg=plain` for no glow behind them |
| `export=ascii,flow` | save one or both versions as video |
| `scene=water` | override the guess when it's wrong (also `grass`, `sky`, and `waterfall`, `steam`, `fire` or `twinkle` for stars and lights at night, which it never guesses) |
| `amp=0.6` | less motion; `amp=1.3` for more |
| `speed=1` | how fast the waves run (water); for clouds, `clouds=1` |
| `sky=show` | tint what it thinks is sky in blue; `sky=off` to ignore it (over water it then moves with the sea) |
| `shore=show` | tint what it's keeping still in red |
| `marks=input/photo-marks.png` | your own corrections, painted with `E` (saved and added for you) |
| `haze=0` | no haze on the horizon |
| `sound=on` | export with the scene's own sound: surf, wind, a waterfall's roar, crackling fire, crickets at night |

In the page, `M` switches between ASCII and the plain view, space pauses, `S` plays the sound and `E` opens the brush.

</details>

<details>
<summary><b>When it looks wrong</b></summary>
<br>

- **Something moves that shouldn't, or the other way round.** Press `E` and paint it: `1` is keep still (red), `2` is let it move (green), `3` erases, `[` `]` or the mouse wheel change the brush size. `Enter` saves them to `input/` and reloads with them, so exports use them too. `Esc` cancels.
- **The sky looks off.** Look with `sky=show`, or turn it off with `sky=off`.
- **Too calm or too busy.** Try `amp=0.6` or `amp=1.3`.

It tells water, land and sky apart by colour and texture alone. That's fine for most sea and beach photos. It can get a white building against a pale sky, or blue glass towers, wrong. When it does, paint over it with `E`.

</details>

<details>
<summary><b>On a web page, in a terminal, in an AI tool</b></summary>
<br>

**On your own web page**, a photo can move live, with no video file:

```html
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js" } }</script>
<script type="module" src="https://cdn.jsdelivr.net/gh/haoyu-haoyu/asciigraph@main/src/element.js"></script>
<living-photo src="beach.jpg" mode="flow" style="height: 400px"></living-photo>
```

It takes `mode`, `scene`, and `options` for the rest (`options="wind=30&speed=0.8"`). It stops while scrolled out of view and holds still for visitors who ask for reduced motion. `embed.html` shows it running.

**In a terminal**, as coloured text:

```bash
node bin/asciigraph.mjs play photo.jpg            # here, until Ctrl-C
node bin/asciigraph.mjs stream photo.jpg          # then, elsewhere: curl http://localhost:7777
```

**In Claude Desktop, Cursor and other MCP clients**, as an `animate_photo` tool:

```bash
claude mcp add asciigraph -- node /path/to/asciigraph/bin/asciigraph.mjs mcp
```

</details>

<details>
<summary><b>What's in the repo</b></summary>
<br>

| Path | |
|---|---|
| `src/sky.js` | finds the sky and the horizon |
| `src/shore.js` | finds the land to keep still, and the grass on it |
| `src/water.js` | the water, the waves breaking and the drifting clouds |
| `src/field.js` | the swaying strands for grass and fields |
| `src/post.js` | turns a frame into ASCII |
| `src/sound.js` | each scene's sound |
| `src/living.js` | builds one living photo; the page, the demo and `<living-photo>` all use it |
| `demo.html`, `src/demo.js`, `src/encode.js` | the drop-a-photo page, which makes the MP4 in the browser |
| `src/video.js` | a video drawn in ASCII, its strokes turned by the motion between frames (the demo page uses it) |
| `src/element.js` | `<living-photo>` for any web page |
| `bin/asciigraph.mjs` | the command line: render, `play`, `stream`, `live`, `mcp` |
| `npm run batch` | runs the photos in `tests/photos.json` and reports what each became |
| `src/editor.js`, `src/marks.js` | the `E` brush, and how painted marks override what it found |
| `server.mjs` | the local server; also writes the exported videos |
| `npm run check` | checks that an exported loop has no visible jump |

</details>

<br>

## License

MIT
