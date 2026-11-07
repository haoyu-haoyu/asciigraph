// Renders a photo with no window: starts the local server, opens the page in
// the Chrome (or Edge, or Chromium) already on this computer, and waits for
// the export. The command line (bin/asciigraph.mjs), the MCP server
// (scripts/mcp.mjs) and the photo batch (scripts/batch.mjs) all use this.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from '../server.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BROWSERS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  win32: [`${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`],
};
export function findBrowser() {
  const found = [process.env.CHROME_PATH, ...(BROWSERS[process.platform] || [])].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('No Chrome, Edge or Chromium found. Install Chrome, or set CHROME_PATH to one.');
  return found;
}

// The photo as a path the server can serve: one inside the repo as it is,
// any other copied into input/ (under a new name if a different file there
// already has its name).
export function servable(photo) {
  const abs = path.resolve(photo);
  if (!fs.existsSync(abs)) throw new Error(`no such file: ${photo}`);
  const rel = path.relative(ROOT, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  const ext = path.extname(abs), base = path.basename(abs, ext).replace(/[^\p{L}\p{N}_-]/gu, '-') || 'photo';
  const same = (f) => fs.existsSync(f) && crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') === crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  for (let n = 1; ; n++) {
    const name = `${base}${n > 1 ? `-${n}` : ''}${ext}`, dest = path.join(ROOT, 'input', name);
    if (!fs.existsSync(dest) || same(dest)) {
      if (!fs.existsSync(dest)) fs.copyFileSync(abs, dest);
      return `input/${name}`;
    }
  }
}

// One session: a server and a browser, reused across renders, closed by close().
export async function openSession() {
  const server = await startServer(0);
  const port = server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: true,
      // WebGL without a screen: the GPU where there is one, else software
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        // CI runners (Ubuntu 24.04) block the user namespaces Chrome's sandbox needs; it only ever opens our own local page
        ...(process.env.CI ? ['--no-sandbox'] : [])],
    });
  } catch (e) {
    server.close();   // (a long-lived MCP server would keep one per failed call)
    throw e;
  }
  return {
    port,
    // photo: a path; params: the page's options (an object or a query
    // string); modes: which views to export. Resolves to
    // { files (absolute paths), scene, info, tag }, or throws with the page's
    // own explanation when there is nothing to make.
    // unique: add a run id to the file names, for callers that may render one
    // photo twice at once (the MCP server); the command line keeps plain names
    async render(photo, params = {}, { modes = ['ascii'], timeout = 30 * 60e3, onProgress, unique = false } = {}) {
      const q = new URLSearchParams(params);
      q.set('img', servable(photo));
      q.set('export', modes.join(','));
      // two renders of one photo at once (an MCP client trying two settings)
      // must not share a frame folder or an MP4
      if (unique && !q.has('tag') && !q.has('run')) q.set('run', crypto.randomBytes(3).toString('hex'));
      const page = await browser.newPage();
      try {
        let crashed = null;   // an error the page didn't explain (it sets the title 'failed' when it does)
        page.on('pageerror', (e) => { crashed = e; });
        await page.goto(`http://127.0.0.1:${port}/?${q}`);
        let last = '';
        const deadline = Date.now() + timeout;
        for (;;) {
          const title = await page.title();
          if (title === 'done' || title === 'failed') break;
          if (crashed) { await new Promise((r) => setTimeout(r, 300)); if (!['done', 'failed'].includes(await page.title())) throw crashed; }
          if (title !== last && onProgress && /^\d+\/\d+$/.test(title)) onProgress(...title.split('/').map(Number));
          last = title;
          if (Date.now() > deadline) throw new Error('timed out');
          await new Promise((r) => setTimeout(r, 250));
        }
        const hud = await page.$eval('#hud', (el) => el.textContent);
        const state = await page.evaluate(() => (window.asciigraph ? { scene: window.asciigraph.scene, info: window.asciigraph.info, tag: window.asciigraph.tag } : null));
        if ((await page.title()) === 'failed') throw new Error(hud);
        const files = hud.replace(/^done → /, '').split(', ').map((f) => path.join(ROOT, f));
        return { files, ...state };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}

// The frame folders an export leaves in out/ (kept for the seamless check),
// removed: they are large.
export function dropFrames(files) {
  for (const f of files) fs.rmSync(f.replace(/\.mp4$/, ''), { recursive: true, force: true });
}
