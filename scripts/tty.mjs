// A loop played as coloured text in a terminal, or streamed to anyone who
// runs curl against it. Frames come from an exported MP4 (best: the flow
// view, which the characters then draw again).
//   blocks: each character is two pixels, top and bottom (▀ with a fore and
//           a back colour): the most picture per character
//   ascii:  one pixel per character, drawn by a character as dense as it is
//           light, in its colour
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

// width, height and frame rate of a video, from ffmpeg's own report
function probe(video) {
  const err = spawnSync(ffmpeg, ['-hide_banner', '-i', video], { encoding: 'utf8' }).stderr;
  const m = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/), f = err.match(/([\d.]+) fps/);
  if (!m) throw new Error(`not a video: ${video}`);
  // a phone video stored sideways: ffmpeg turns it upright, so swap the sides
  const turned = /rotation of -?90|rotate\s*:\s*-?(90|270)/.test(err);
  const [w, h] = turned ? [m[2], m[1]] : [m[1], m[2]];
  return { w: Number(w), h: Number(h), fps: f ? Number(f[1]) : 30 };
}

// A colour as an SGR parameter: 24-bit, or the nearest of the 256-colour
// palette (its 6×6×6 cube or its greys), which is a quarter of the bytes and
// repeats far more often, so a stream over a network keeps up.
const LEVELS = [0, 95, 135, 175, 215, 255];
const near6 = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
function sgr([r, g, b], fg, palette) {
  if (palette !== 256) return `${fg ? 38 : 48};2;${r};${g};${b}`;
  const [R, G, B] = [near6(r), near6(g), near6(b)];
  const cube = 16 + 36 * R + 6 * G + B, ce = (LEVELS[R] - r) ** 2 + (LEVELS[G] - g) ** 2 + (LEVELS[B] - b) ** 2;
  const k = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10))), gv = 8 + 10 * k;
  const ge = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return `${fg ? 38 : 48};5;${ge < ce ? 232 + k : cube}`;
}

// The video as text frames, cols characters across (palette: 24 or 256 colours). Each frame starts by
// putting the cursor top left, so writing them in turn animates in place.
export function textFrames(video, { cols = 100, style = 'blocks', fps: want, palette = 24 } = {}) {
  const { w, h, fps } = probe(video);
  const rate = want || Math.min(fps, 20);   // terminals and links keep up better at 20
  // a character is about twice as tall as it is wide
  const rows = Math.max(2, Math.round(((cols * h) / w) / 2));
  const ph = style === 'blocks' ? rows * 2 : rows;
  const out = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `fps=${rate},scale=${cols}:${ph}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
  if (out.status !== 0) throw new Error(String(out.stderr));
  const size = cols * ph * 3, frames = [];
  for (let at = 0; at + size <= out.stdout.length; at += size) {
    const px = out.stdout.subarray(at, at + size);
    const rgb = (x, y) => { const i = (y * cols + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
    const parts = ['\x1b[H'];
    for (let r = 0; r < rows; r++) {
      let fg = '', bg = '';
      for (let c = 0; c < cols; c++) {
        if (style === 'blocks') {
          const f = sgr(rgb(c, r * 2), true, palette), b = sgr(rgb(c, r * 2 + 1), false, palette);
          if (f !== fg) { parts.push(`\x1b[${f}m`); fg = f; }
          if (b !== bg) { parts.push(`\x1b[${b}m`); bg = b; }
          parts.push('▀');
        } else {
          const [R, G, B] = rgb(c, r), l = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          const f = sgr([R, G, B], true, palette);
          if (f !== fg) { parts.push(`\x1b[${f}m`); fg = f; }
          parts.push(RAMP[Math.min(RAMP.length - 1, Math.floor(l * RAMP.length))]);
        }
      }
      parts.push('\x1b[0m\n');
    }
    frames.push(parts.join(''));
  }
  return { frames, fps: rate };
}

// Plays them on repeat in this terminal until Ctrl-C.
export function play({ frames, fps }) {
  const restore = () => process.stdout.write('\x1b[0m\x1b[?25h\x1b[2J\x1b[H');
  process.stdout.write('\x1b[?25l\x1b[2J');
  let i = 0;
  const timer = setInterval(() => process.stdout.write(frames[i++ % frames.length]), 1000 / fps);
  process.once('SIGINT', () => { clearInterval(timer); restore(); process.exit(0); });
}

// Streams them to curl (curl http://host:port), on repeat until it hangs up.
// Anything else that asks gets a line saying how to watch.
export function serve({ frames, fps }, { port = 7777, host = '127.0.0.1' } = {}) {
  const server = http.createServer((req, res) => {
    if (!/curl|wget|httpie/i.test(req.headers['user-agent'] || '')) {
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(`Watch it in a terminal:  curl http://${req.headers.host}\n`);
      return;
    }
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.write('\x1b[?25l\x1b[2J');
    let i = 0;
    // a client that isn't reading (paused, or piped into a pager) skips
    // frames instead of piling them up in memory
    const timer = setInterval(() => { if (!res.writableNeedDrain) res.write(frames[i++ % frames.length]); }, 1000 / fps);
    req.on('close', () => clearInterval(timer));
  });
  server.listen(port, host, () => console.log(`streaming → curl http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}
