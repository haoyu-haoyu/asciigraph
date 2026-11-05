// Hand-painted marks: a PNG the shape of the photo (uncropped) that overrides
// what the masks read off it. Red: keep this still, whatever it is (no swell,
// no cloud drift, no grass sway). Green: this is water, let it move.
// Transparent: leave it to the masks. Painted in the page (editor.js) or by
// hand; the alpha channel is how strongly a mark applies.

const POOL = 4;   // read at 4× the grid, each cell taking its strongest mark

// red and green per mask cell, 0–1 (rows top-down, like the grid). Pooled by
// the strongest mark, not the average: a mast painted thinner than a cell
// still holds the whole cell, instead of half of it swaying at half strength.
export function marksOnGrid(img, grid) {
  const { w, h, n } = grid;
  const W = w * POOL, H = h * POOL;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const still = new Float32Array(n), move = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, a = px[o + 3] / 255, i = Math.floor(y / POOL) * w + Math.floor(x / POOL);
    still[i] = Math.max(still[i], (px[o] / 255) * a);
    move[i] = Math.max(move[i], (px[o + 1] / 255) * a);
  }
  // still wins where both are painted
  for (let i = 0; i < n; i++) move[i] *= 1 - still[i];
  return { still, move };
}
