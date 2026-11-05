<p align="right"><b>English</b> · <a href="./README.zh-CN.md">中文</a></p>

<p align="center"><img src="./assets/readme/banner.gif" width="100%" alt="ASCII waves on a beach"></p>

# asciigraph

Takes a single photo and makes it move. The sea keeps rolling in, clouds drift, grass sways, and the sand and rocks stay where they are. You can export it as a normal video or as ASCII art, and both loop cleanly.

The banner above is one beach photo run through it.

## Running it

You need Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:5177. To try your own photo, drop it into `input/` and go to

```
http://localhost:5177/?img=input/beach.jpg
```

Add `&export=ascii,flow` to the end to save the videos. Leave the tab open until it says `done`; the files go to `out/`.

## Example: a phone wallpaper

Say you have a beach photo and want it on your phone.

1. Put it in `input/` and open `http://localhost:5177/?img=input/beach.jpg`. It figures out the water, sand and sky by itself.
2. Crop it to your screen: add `&width=1179&height=2556` (an iPhone 15 Pro). If the wrong part of the photo ends up in frame, move it with `&focus=0.5,0.3` (across, down, both 0 to 1).
3. Add `&shore=show` once. The sand should turn red and the sea shouldn't. Remove it again when it looks right.
4. Add `&export=ascii,flow` and wait for `done`. The two videos are in `out/`.

## Options

They all go in the URL.

| | |
|---|---|
| `width=1080&height=2340` | output size (your screen size, if it's a wallpaper) |
| `mode=flow` | plain video, no ASCII |
| `scene=water` | use this when it guesses the photo wrong (also `grass`, `sky`) |
| `shore=show` | shows in red what it's keeping still |
| `sky=show` | shows in blue what it thinks is sky |

`M` switches between ASCII and the plain view, space pauses.

## When it looks wrong

- Something moves that shouldn't: check with `shore=show`, then set `scene=` yourself.
- The sky or clouds look off: check with `sky=show`, or switch it off with `sky=off`.
- Too much or too little motion: `amp=0.6` calms it down, `amp=1.3` makes it livelier.

If you use Claude Code, there's a `SKILL.md` in the repo. Hand it a photo and it can do all of the above for you, checks included.

## Limits

It decides what's water, sand or sky from colour alone. That works for most beach and sea photos, but it can get a white building against a pale sky, or blue glass towers, wrong. If something moves that shouldn't, check with `shore=show` / `sky=show` and set `scene=` yourself.

## License

MIT
