// Which scene suits a photo: 'grass' (strands), 'water' (flow and swell), or
// null when it looks like neither. It only reads colour, so it is a cheap
// first guess, not an understanding of the picture: when it is unsure it says
// so and the page asks for scene= instead of guessing.
//   grass  most of the frame is green, yellow-green or golden straw (wheat)
//   water  most of it is cyan to deep blue, or near-white foam among them
// Known blind spots: fur, hair and paintings come in any colour, so they need
// scene=grass; blue sky reads as water (clouds as its foam), so a photo of
// grass under a big sky may be refused; a green lake reads as grass.
// Given the sky (sky.js), it judges only what is under it (main.js does that
// for water: is there water under the sky, or only land?).
import { hsv } from './masks.js';

const N = 96;
const MIN_SHARE = 0.55;   // the winning kind must cover this much of the frame
const MARGIN = 2;         // ...and this many times what the other covers

export function classifyImage(img, sky = null) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;
  let grass = 0, water = 0, foam = 0, n = 0;
  for (let i = 0; i < N * N; i++) {
    const [h, s, v] = hsv(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255);
    if (v < 0.06) continue;                                     // too dark to tell: left out of the shares
    if (sky && sky.at((i % N + 0.5) / N, (((i / N) | 0) + 0.5) / N) > 0.5) continue;
    n++;
    if (s < 0.18 && v > 0.55) foam++;                           // white-ish: foam, if the rest is water
    else if (s >= 0.15 && h >= 35 && h < 160) grass++;
    else if (s >= 0.15 && h >= 160 && h < 255) water++;
  }
  // a photo that is mostly shadow can't be judged
  if (n === 0 || n < 0.3 * N * N * (sky ? 1 - sky.share : 1)) return { kind: null, shares: { grass: 0, water: 0 } };
  // foam counts for water only when there is water for it to sit on
  const shares = { grass: grass / n, water: (water + (water > 0.15 * n ? foam : 0)) / n };
  const [best, other] = shares.grass >= shares.water ? ['grass', 'water'] : ['water', 'grass'];
  const kind = shares[best] >= MIN_SHARE && shares[best] >= MARGIN * shares[other] ? best : null;
  return { kind, shares };
}
