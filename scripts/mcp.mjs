// asciigraph as an MCP server (stdio), for AI tools that can't run a browser
// themselves: one tool, animate_photo, that renders a photo to MP4 files.
//   claude mcp add asciigraph -- node /path/to/asciigraph/bin/asciigraph.mjs mcp
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { openSession, dropFrames } from './render.mjs';

const server = new McpServer({ name: 'asciigraph', version: '0.1.0' });

server.registerTool('animate_photo', {
  title: 'Bring a photo to life',
  description: 'Turns a still photo into a seamless looping MP4 where only what should move moves: water and the sea, '
    + 'clouds, grass, waterfalls, steam or smoke, fire, stars or city lights. Optionally as an ASCII animation, '
    + 'with the scene\'s own sound, or cropped to a phone or desktop wallpaper size. '
    + 'Fails with an explanation when the photo shows none of these; then retry with scene set if the user says what it is. '
    + 'A 1080-wide 12 s loop takes about a minute; 4K takes several.',
  inputSchema: {
    photo: z.string().describe('Absolute path to the photo (JPEG, PNG or WebP)'),
    scene: z.enum(['grass', 'water', 'sky', 'waterfall', 'steam', 'fire', 'twinkle']).optional()
      .describe('What moves. Omit to guess (grass, water or sky only); waterfall, steam, fire and twinkle must be named'),
    mode: z.enum(['ascii', 'flow', 'both']).default('flow').describe('flow: the photo moving; ascii: drawn in characters; both'),
    size: z.enum(['iphone', 'iphone-max', 'android', 'ipad', 'mac', '1080p', '1440p', '4k']).optional()
      .describe('Crop to a wallpaper size. iPhones cannot use a looping video as wallpaper: say so'),
    sound: z.boolean().default(false).describe("Add the scene's own looping sound"),
    loop: z.number().min(2).max(60).default(12).describe('Loop length in seconds'),
    width: z.number().int().min(64).max(3840).optional().describe('Output width in pixels (default 1080, or the size\'s)'),
    options: z.record(z.string(), z.union([z.string(), z.number()])).optional()
      .describe('Any other option of the page, e.g. {"wind": 30, "speed": 0.8, "focus": "0.5,0.3"}'),
    out: z.string().optional().describe('Folder to copy the MP4s into (default: the repo\'s out/)'),
  },
}, async ({ photo, scene, mode, size, sound, loop, width, options, out }) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(options || {})) p.set(k, String(v));
  for (const [k, v] of Object.entries({ scene, size, loop, width })) if (v !== undefined) p.set(k, String(v));
  if (sound) p.set('sound', 'on');
  const session = await openSession();
  try {
    const r = await session.render(photo, p, { modes: mode === 'both' ? ['ascii', 'flow'] : [mode], unique: true });
    dropFrames(r.files);
    let files = r.files;
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      // moved, not copied: each call has its own names, so out/ would only grow
      files = files.map((f) => { const d = path.join(out, path.basename(f)); fs.copyFileSync(f, d); fs.rmSync(f); return d; });
    }
    return { content: [{ type: 'text', text: `Made a ${r.scene} loop (${r.info}):\n${files.join('\n')}` }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] };
  } finally {
    await session.close();
  }
});

await server.connect(new StdioServerTransport());
