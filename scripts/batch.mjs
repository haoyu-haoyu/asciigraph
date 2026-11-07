// Runs every photo in a list (tests/photos.json by default) through a small,
// short render and reports, for each: the scene picked against the one
// expected, whether it rendered, and whether the loop is seamless.
//   node scripts/batch.mjs [list.json] [--width 360] [--loop 4]
// Exits non-zero when any photo fails, so it can gate a change.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { openSession, dropFrames, ROOT } from './render.mjs';

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { width: { type: 'string', default: '360' }, loop: { type: 'string', default: '4' } } });
const list = JSON.parse(fs.readFileSync(positionals[0] || path.join(ROOT, 'tests/photos.json'), 'utf8')).photos;

const session = await openSession();
const rows = [];
try {
  for (const item of list) {
    const photo = path.join(ROOT, item.photo);
    const name = item.photo.split('/').pop();
    if (!fs.existsSync(photo)) { rows.push({ name, result: 'skipped', note: 'not on this computer' }); continue; }
    // its own names, so it never overwrites a real export in out/
    const p = new URLSearchParams({ tag: `batch-${name.replace(/\.[^.]+$/, '')}`, width: o.width, loop: o.loop, ...(item.scene && { scene: item.scene }), ...(item.marks && { marks: item.marks }), ...item.options });
    const t0 = Date.now();
    try {
      const r = await session.render(photo, p, { modes: ['flow'] });
      const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-loop.mjs'), r.files[0].replace(/\.mp4$/, '')], { encoding: 'utf8' });
      dropFrames(r.files);
      for (const f of r.files) fs.rmSync(f, { force: true });
      const want = item.expect || item.scene;
      const problems = [];
      if (r.scene !== want) problems.push(`picked ${r.scene}`);
      if (check.status !== 0) problems.push('visible seam');
      rows.push({ name, want, got: r.scene, seam: check.status === 0 ? 'ok' : 'jump', secs: Math.round((Date.now() - t0) / 1000), result: problems.length ? 'FAIL' : 'pass', note: problems.join(', ') });
    } catch (e) {
      const want = item.expect || item.scene;
      rows.push({ name, want, got: 'none', result: want === 'none' ? 'pass' : 'FAIL', note: String(e.message).slice(0, 90) });
    }
    const last = rows.at(-1);
    console.error(`${last.result.padEnd(7)} ${name}${last.note ? ` (${last.note})` : ''}`);
  }
} finally {
  await session.close();
}

const ran = rows.filter((r) => r.result !== 'skipped'), failed = ran.filter((r) => r.result === 'FAIL');
console.log('\n| photo | expected | picked | seam | result |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.want ?? ''} | ${r.got ?? ''} | ${r.seam ?? ''} | ${r.result}${r.note ? `: ${r.note}` : ''} |`);
console.log(`\n${ran.length - failed.length}/${ran.length} passed${rows.length > ran.length ? `, ${rows.length - ran.length} skipped` : ''}`);
process.exit(failed.length ? 1 : 0);
