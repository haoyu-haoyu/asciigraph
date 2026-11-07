# Contributing

Thanks for wanting to help. A few things make a change easy to take.

## Set up

Node.js 22.12 or newer and a Chrome or Edge (the command line and the batch use it, with no window).

```bash
npm install
npm start          # http://localhost:5177, and /demo.html
```

## Before you open a pull request

- **Run the batch:** `npm run batch`. It renders every photo in `tests/photos.json` small and checks the scene it picks and that each loop is seamless. Only the photos in `examples/` are in the repo; put your own test photos in `input/` (ignored by git) and list them there to test with them too. Say in the pull request which photos you ran and what changed.
- **Look at it.** A seamless loop can still move wrongly. Watch the photos your change touches for a whole loop, in both views, against `references/motion.md`.
- **Keep the loop whole.** Anything that moves must repeat a whole number of times per loop. `references/internals.md` lists the pitfalls already solved; please keep them solved.
- **New options** go in the list at the top of `src/main.js`, in `references/parameters.md`, and, if people will reach for them, in both READMEs (English and Chinese).

## Style

- Plain modern JavaScript modules, no build step: the browser loads `src/` as it is.
- Comments say why, not what: which mistake a threshold guards against, what a constant was measured from.
- Small commits with messages that say what changed and why, in plain words.

## Reporting a photo it gets wrong

Open an issue with the photo (or one like it you can share), the URL options you used, and what moved that shouldn't or didn't move that should. A still or a short clip of the result helps most.
