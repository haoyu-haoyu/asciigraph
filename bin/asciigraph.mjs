#!/usr/bin/env node
// asciigraph from the command line. Run with no arguments for help.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSession, dropFrames } from '../scripts/render.mjs';
import { textFrames, play, serve } from '../scripts/tty.mjs';

const HELP = `asciigraph: bring a still photo to life as a seamless loop

  asciigraph PHOTO [options]          make the MP4 (into out/, or --out)
  asciigraph play PHOTO|VIDEO         play it as coloured text in this terminal
  asciigraph stream PHOTO|VIDEO       stream it to curl: curl http://localhost:7777
  asciigraph live PHOTO|VIDEO         a Live Photo for an iPhone wallpaper (macOS)
  asciigraph mcp                      run as an MCP server (stdio) for AI tools

options for PHOTO:
  --scene NAME     grass, water, sky, waterfall, steam, fire, twinkle (default: guess)
  --size NAME      iphone, iphone-max, android, ipad, mac, 1080p, 1440p, 4k
  --width N        output width (default 1080)   --height N   crop to this height
  --mode MODE      ascii, flow or both (default ascii)
  --sound          add the scene's own sound
  --loop SECONDS   loop length (default 12)
  --set KEY=VALUE  any other option of the page (repeatable), e.g. --set wind=30
  --out DIR        copy the MP4s there
  --keep-frames    keep the PNG frames in out/ (for scripts/check-loop.mjs)

options for play and stream:
  --cols N         characters across (default: the terminal's width, or 100)
  --style STYLE    blocks (two pixels a character, default) or ascii
  --colors 256     play with the 256-colour palette (stream always does)
  --port N --host H   where stream listens (default 7777 on 127.0.0.1)

options for live:
  --seconds N      how long it plays when the phone wakes (default 3)
  --out DIR        where the .heic and .mov go (default out/)
  (a photo is rendered at --size iphone first unless you give a size)
`;

const die = (msg) => { console.error(msg); process.exit(1); };
let parsed;
try {
  parsed = parseArgs({
  allowPositionals: true,
  options: {
    scene: { type: 'string' }, size: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
    mode: { type: 'string', default: 'ascii' }, sound: { type: 'boolean' },
    loop: { type: 'string' }, set: { type: 'string', multiple: true, default: [] }, out: { type: 'string' },
    'keep-frames': { type: 'boolean' }, cols: { type: 'string' }, colors: { type: 'string' }, style: { type: 'string', default: 'blocks' },
    seconds: { type: 'string', default: '3' }, port: { type: 'string', default: '7777' }, host: { type: 'string', default: '127.0.0.1' }, help: { type: 'boolean', short: 'h' },
  },
  });
} catch (e) {
  die(`${e.message}\n(other options of the page go through --set, e.g. --set sky=off; asciigraph --help lists the rest)`);
}
const { values: o, positionals: args } = parsed;
if (o.help || !args.length) { process.stdout.write(HELP); process.exit(0); }

function pageParams() {
  const p = new URLSearchParams();
  for (const k of ['scene', 'size', 'width', 'height', 'loop']) if (o[k]) p.set(k, o[k]);
  if (o.sound) p.set('sound', 'on');
  for (const kv of o.set) {
    const i = kv.indexOf('=');
    if (i < 1) die(`--set wants KEY=VALUE, not ${kv}`);
    p.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return p;
}

async function make(photo, params, modes, { quiet = false } = {}) {
  const s = await openSession();
  try {
    const r = await s.render(photo, params, {
      modes,
      onProgress: quiet || !process.stderr.isTTY ? undefined : (d, n) => process.stderr.write(`\r${r0(photo)} · frame ${d}/${n}  `),
    });
    if (!quiet && process.stderr.isTTY) process.stderr.write('\n');
    if (!o['keep-frames']) dropFrames(r.files);
    return r;
  } finally {
    await s.close();
  }
}
const r0 = (p) => path.basename(p);

const cmd = args[0];
try {
  if (cmd === 'mcp') {
    await import('../scripts/mcp.mjs');
  } else if (cmd === 'live') {
    if (process.platform !== 'darwin') die('asciigraph live needs macOS (it uses AVFoundation to write the Live Photo)');
    const src = args[1] || die('asciigraph live needs a photo or a video');
    let video = src;
    if (!/\.(mp4|mov)$/i.test(src)) {
      const p = pageParams();
      if (!p.has('size') && !p.has('width')) p.set('size', 'iphone');
      console.error('rendering the loop first…');
      video = (await make(src, p, [o.mode === 'ascii' ? 'ascii' : 'flow'])).files[0];
    }
    const swift = fileURLToPath(new URL('../scripts/livephoto.swift', import.meta.url));
    const out = o.out || fileURLToPath(new URL('../out', import.meta.url));
    const r = spawnSync('swift', [swift, video, out, o.seconds], { encoding: 'utf8' });
    if (r.status !== 0) die(r.stderr || r.error?.message || 'swift failed (is Xcode or the Command Line Tools installed?)');
    process.stdout.write(r.stdout);
    console.error('Send both files to the phone together (AirDrop), then Settings → Wallpaper → Add New Wallpaper → Photos.');
  } else if (cmd === 'play' || cmd === 'stream') {
    const src = args[1] || die(`asciigraph ${cmd} needs a photo or a video`);
    let video = src;
    if (!/\.(mp4|mov|webm|mkv)$/i.test(src)) {
      // a photo: render its flow view small first; the text redraws it
      const p = pageParams();
      if (!p.has('width') && !p.has('size')) p.set('width', '480');
      console.error('rendering the loop first…');
      video = (await make(src, p, ['flow'])).files[0];
    }
    const cols = Number(o.cols) || (cmd === 'play' && process.stdout.columns) || 100;
    // a stream goes over a network: the 256-colour palette is far fewer bytes
    const frames = textFrames(video, { cols, style: o.style === 'ascii' ? 'ascii' : 'blocks', palette: cmd === 'stream' || o.colors === '256' ? 256 : 24 });
    if (cmd === 'play') play(frames); else serve(frames, { port: Number(o.port), host: o.host });
  } else {
    const modes = o.mode === 'both' ? ['ascii', 'flow'] : [o.mode];
    if (!modes.every((m) => m === 'ascii' || m === 'flow')) die(`--mode is ascii, flow or both, not ${o.mode}`);
    const r = await make(cmd, pageParams(), modes);
    let files = r.files;
    if (o.out && cmd !== 'live') {
      fs.mkdirSync(o.out, { recursive: true });
      files = files.map((f) => { const d = path.join(o.out, path.basename(f)); fs.copyFileSync(f, d); return d; });
    }
    console.log(`${r.scene} · ${r.info}`);
    for (const f of files) console.log(f);
  }
} catch (e) {
  // the page words its advice as URL options: say them as flags here
  die(String(e.message || e).replace(/&(scene|size)=(\w+)/g, '--$1 $2').replace(/&(\w+)=(\w+)/g, '--set $1=$2').replace(/open it with/, 'run it with'));
}
