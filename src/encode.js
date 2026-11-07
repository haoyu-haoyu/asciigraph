// Encodes one loop to an MP4 in the browser (WebCodecs), with no frames
// written to disk and no ffmpeg: the demo page needs no server at all.
// The local page still sends frames to the server instead (server.mjs),
// which keeps the exact frames for the seamless check.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// H.264 High profile, from the level a 4K frame needs down
const CODECS = ['avc1.640034', 'avc1.640033', 'avc1.64002a', 'avc1.4d0034', 'avc1.42003e'];

export function canEncode() {
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
}

async function pickCodec(width, height, bitrate, framerate) {
  for (const codec of CODECS) {
    const config = { codec, width, height, bitrate, framerate, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
  }
  throw new Error(`this browser can't encode H.264 at ${width}×${height}`);
}

// living: from createLiving; mode: 'ascii' | 'flow'; sound: an AudioBuffer
// one loop long, or null; onProgress(done, total). Resolves to an MP4 Blob.
export async function encodeLoop(living, { mode = 'ascii', sound = null, onProgress = () => {} } = {}) {
  const { width, height, fps, loop } = living;
  const canvas = living.renderer.domElement;
  const N = Math.round(loop * fps);
  // fine glyphs need more bits than a photo does
  const bitrate = Math.round(width * height * fps * (mode === 'ascii' ? 0.3 : 0.2));
  const config = await pickCodec(width, height, bitrate, fps);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: sound ? { codec: 'aac', numberOfChannels: sound.numberOfChannels, sampleRate: sound.sampleRate } : undefined,
    fastStart: 'in-memory',
  });
  let failure = null;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  video.configure(config);

  const us = 1e6 / fps, key = Math.max(1, Math.round(fps * 2));
  try {
    for (let i = 0; i < N; i++) {
      if (failure) throw failure;
      living.draw(i / N, mode, i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
      video.encode(frame, { keyFrame: i % key === 0 });
      frame.close();
      // don't run ahead of the encoder: each queued frame holds a full picture
      while (video.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      onProgress(i + 1, N);
    }
    await video.flush();
  } finally {
    if (video.state !== 'closed') video.close();
  }

  if (sound) await encodeSound(muxer, sound, N * us);
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// end: the video's length (µs). The encoder pads the end out to whole packets;
// packets past the picture are dropped, or the file would run longer than
// the loop and a player repeating it would stall at the seam.
async function encodeSound(muxer, buffer, end) {
  const { numberOfChannels: channels, sampleRate, length } = buffer;
  let failure = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => { if (chunk.timestamp + (chunk.duration ?? 0) <= end + 1) muxer.addAudioChunk(chunk, meta); },
    error: (e) => { failure = e; },
  });
  const config = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 160000 };
  if (!(await AudioEncoder.isConfigSupported(config)).supported) { console.warn('no AAC encoder here: the MP4 is silent'); return; }
  enc.configure(config);
  const STEP = 4096;
  try {
    for (let at = 0; at < length; at += STEP) {
      const n = Math.min(STEP, length - at);
      const data = new Float32Array(n * channels);   // planar: each channel in turn
      for (let c = 0; c < channels; c++) data.set(buffer.getChannelData(c).subarray(at, at + n), c * n);
      const chunk = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((at / sampleRate) * 1e6), data });
      enc.encode(chunk);
      chunk.close();
    }
    await enc.flush();
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
  if (failure) throw failure;
}
