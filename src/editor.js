// Painting marks (marks.js) over the preview: red for what should stay still,
// green for what should move as water. The marks are kept the shape of the
// whole, uncropped image, so they still fit after the crop changes. Saving
// writes input/NAME-marks.png through the server and reloads with marks= set.
const LONG = 1024;   // marks resolution along the long side
const TOOLS = {
  still: { key: '1', label: 'keep still', color: [255, 0, 0] },
  move: { key: '2', label: 'let it move', color: [0, 255, 0] },
  erase: { key: '3', label: 'erase', color: null },
};

// canvas: the preview; original: the uncropped image; crop: the part in
// frame, as fractions of it; marksImg: marks to start from, or null
export function openEditor({ canvas, hud, original, crop, marksImg, imgPath, onClose }) {
  const aspect = original.width / original.height;
  const marks = document.createElement('canvas');
  marks.width = aspect >= 1 ? LONG : Math.round(LONG * aspect);
  marks.height = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
  const mg = marks.getContext('2d');
  if (marksImg) mg.drawImage(marksImg, 0, 0, marks.width, marks.height);

  const view = document.createElement('canvas');
  view.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;cursor:none;touch-action:none;z-index:2';
  document.body.appendChild(view);
  const vg = view.getContext('2d');
  let tool = 'still', radius = 28, cursor = null, last = null, saving = false, error = '';

  // where the preview's picture sits on screen (it is drawn object-fit: contain)
  function shown() {
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width / canvas.width, r.height / canvas.height);
    const w = canvas.width * s, h = canvas.height * s;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
  }
  // a screen point in marks pixels, and the brush radius in them
  function toMarks(px, py) {
    const d = shown();
    return {
      x: (crop.x + ((px - d.x) / d.w) * crop.w) * marks.width,
      y: (crop.y + ((py - d.y) / d.h) * crop.h) * marks.height,
      r: (radius / d.w) * crop.w * marks.width,
    };
  }

  function redraw() {
    const dpr = devicePixelRatio || 1;
    if (view.width !== Math.round(innerWidth * dpr) || view.height !== Math.round(innerHeight * dpr)) {
      view.width = Math.round(innerWidth * dpr); view.height = Math.round(innerHeight * dpr);
    }
    vg.setTransform(dpr, 0, 0, dpr, 0, 0);
    vg.clearRect(0, 0, innerWidth, innerHeight);
    const d = shown();
    vg.globalAlpha = 0.5;
    vg.drawImage(marks, crop.x * marks.width, crop.y * marks.height, crop.w * marks.width, crop.h * marks.height, d.x, d.y, d.w, d.h);
    vg.globalAlpha = 1;
    if (cursor) {
      vg.beginPath();
      vg.arc(cursor.x, cursor.y, radius, 0, 2 * Math.PI);
      const c = TOOLS[tool].color;
      vg.strokeStyle = c ? `rgb(${c})` : '#fff';
      vg.lineWidth = 1.5;
      vg.stroke();
    }
    const mark = (k) => (tool === k ? `<code>[${TOOLS[k].key}] ${TOOLS[k].label}</code>` : `[${TOOLS[k].key}] ${TOOLS[k].label}`);
    hud.innerHTML = saving ? 'saving… · [Esc] cancel'
      : `${error ? `<code>couldn't save: ${error.replace(/[<&]/g, '')}</code> · ` : ''}marks · ${Object.keys(TOOLS).map(mark).join(' · ')} · [ ] or wheel: brush size · [C] clear · [Enter] save · [Esc] cancel`;
  }

  // one soft round dab of the tool at a marks-pixel point
  function dab(p) {
    const c = TOOLS[tool].color;
    const g = mg.createRadialGradient(p.x, p.y, p.r * 0.55, p.x, p.y, p.r);
    const rgb = c ? c.join(',') : '0,0,0';
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    mg.globalCompositeOperation = c ? 'source-over' : 'destination-out';
    mg.fillStyle = g;
    mg.beginPath();
    mg.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
    mg.fill();
    mg.globalCompositeOperation = 'source-over';
  }
  // a stroke from the last point, dabbed every quarter radius so it stays even;
  // off the picture (the bars beside it) it lifts: that part of the image is
  // out of frame, and paint there would only show up after a recrop
  function strokeTo(px, py) {
    const d = shown();
    if (px < d.x || py < d.y || px > d.x + d.w || py > d.y + d.h) { last = null; return; }
    const p = toMarks(px, py);
    if (!last) { dab(p); last = p; return; }
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.r / 4)));
    for (let s = 1; s <= steps; s++) dab({ x: last.x + ((p.x - last.x) * s) / steps, y: last.y + ((p.y - last.y) * s) / steps, r: p.r });
    last = p;
  }

  const onDown = (e) => { view.setPointerCapture(e.pointerId); last = null; strokeTo(e.clientX, e.clientY); redraw(); };
  const onMove = (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (e.buttons & 1) strokeTo(e.clientX, e.clientY);
    redraw();
  };
  const onUp = () => { last = null; };
  const onWheel = (e) => { e.preventDefault(); radius = Math.min(300, Math.max(4, radius * (e.deltaY > 0 ? 0.9 : 1.1))); redraw(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (saving) return;
    for (const [k, t] of Object.entries(TOOLS)) if (e.key === t.key) tool = k;
    if (e.key === 'x' || e.key === 'X') tool = 'erase';
    if (e.key === '[') radius = Math.max(4, radius / 1.25);
    if (e.key === ']') radius = Math.min(300, radius * 1.25);
    if (e.key === 'c' || e.key === 'C') mg.clearRect(0, 0, marks.width, marks.height);
    if (e.key === 'Enter') { save(); return; }
    redraw();
  };

  let closed = false;
  function close() {
    closed = true;
    removeEventListener('keydown', onKey);
    removeEventListener('resize', redraw);
    view.remove();
    onClose();
  }
  async function save() {
    saving = true; error = ''; redraw();
    try {
      const blob = await new Promise((r) => marks.toBlob(r, 'image/png'));
      const res = await fetch(`/marks?img=${encodeURIComponent(imgPath)}`, { method: 'POST', body: blob });
      if (!res.ok) throw new Error(await res.text());
      const { file } = await res.json();
      const q = new URLSearchParams(location.search);
      q.set('marks', file);
      if (!closed) location.search = q.toString();   // reload with them: the masks are built once, at load
    } catch (e) {
      saving = false; error = e.message;
      if (!closed) redraw();
    }
  }

  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointerleave', () => { cursor = null; redraw(); });
  view.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  addEventListener('resize', redraw);
  redraw();
  return { close };
}
