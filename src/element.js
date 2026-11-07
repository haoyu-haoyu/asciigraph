// <living-photo>: a photo that moves, live on any web page, with no video file.
//   <living-photo src="beach.jpg" mode="flow"></living-photo>
// Attributes: src (the photo; from another site it must allow CORS), mode
// (ascii | flow, default flow), scene, and options for
// anything else the page takes, as a query string ("wind=30&speed=0.8").
// It fills its box like object-fit: cover, renders at the box's width (in
// device pixels, at most 1440), stops drawing while off screen, and holds a
// still frame for visitors who ask for reduced motion.
// The page needs an import map for "three" (see the README).
import { createLiving, LivingError } from './living.js';

const MAX = 1440;
const STYLE = ':host{display:block;position:relative;overflow:hidden;background:#000}'
  + 'canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}'
  + '.err{position:absolute;inset:auto 8px 8px;font:12px/1.4 system-ui,sans-serif;color:#f0b26a}';

class LivingPhoto extends HTMLElement {
  static observedAttributes = ['src', 'mode', 'scene', 'options'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>${STYLE}</style>`;
    this.living = null;
    this.visible = false;
    this.start = performance.now();
    this.seen = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop(); });
    this.still = matchMedia('(prefers-reduced-motion: reduce)');
  }

  connectedCallback() { this.seen.observe(this); this.build(); }
  // (and a photo still loading is dropped: it would build on a detached node)
  disconnectedCallback() { this.seen.disconnect(); this.ticket = null; this.visible = false; this.teardown(); }
  // mode needs no rebuild: each frame reads it, so just draw (a still frame,
  // for reduced motion, would otherwise keep the old mode)
  attributeChangedCallback(name) { if (!this.isConnected) return; if (name === 'mode') this.loop(); else this.build(); }

  teardown() {
    this.living?.dispose();
    this.living = null;
    this.shadowRoot.querySelectorAll('canvas, .err').forEach((n) => n.remove());
  }

  async build() {
    const src = this.getAttribute('src');
    const ticket = (this.ticket = {});   // a newer build replaces this one
    if (!src) { this.teardown(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = new URL(src, document.baseURI).href;
    try { await img.decode(); } catch { if (ticket === this.ticket && this.isConnected) { this.teardown(); this.fail(`couldn't load ${src}`); } return; }
    if (ticket !== this.ticket || !this.isConnected) return;
    this.teardown();

    const p = new URLSearchParams(this.getAttribute('options') || '');
    if (this.hasAttribute('scene')) p.set('scene', this.getAttribute('scene'));
    // the box's shape and width, so nothing is rendered that cover would cut off
    const box = this.getBoundingClientRect();
    if (!p.has('width')) p.set('width', Math.min(MAX, Math.round((box.width || 720) * devicePixelRatio)));
    if (!p.has('height') && box.width && box.height) p.set('height', Math.round((p.get('width') * box.height) / box.width));
    const canvas = document.createElement('canvas');
    this.shadowRoot.append(canvas);
    try {
      this.living = createLiving({ canvas, image: img, params: p, name: src.split('/').pop() });
    } catch (e) {
      canvas.remove();
      this.fail(e instanceof LivingError ? e.message : String(e));
      return;
    }
    this.start = performance.now();
    this.dispatchEvent(new CustomEvent('ready', { detail: { scene: this.living.scene } }));
    this.loop();
  }

  fail(text) {
    const d = document.createElement('div');
    d.className = 'err';
    d.textContent = text;
    this.shadowRoot.append(d);
    this.dispatchEvent(new CustomEvent('error', { detail: text }));
  }

  loop() {
    if (!this.living || this.running) return;
    this.running = true;
    const frame = () => {
      const l = this.living, mode = this.getAttribute('mode') === 'ascii' ? 'ascii' : 'flow';
      if (!l || !this.visible) { this.running = false; return; }
      const t = this.still.matches ? 0 : (((performance.now() - this.start) / 1000) % l.loop) / l.loop;
      l.draw(t, mode, Math.floor(performance.now() / 33));
      if (this.still.matches) { this.running = false; return; }   // one still frame
      requestAnimationFrame(frame);
    };
    frame();
  }
}

if (!customElements.get('living-photo')) customElements.define('living-photo', LivingPhoto);
