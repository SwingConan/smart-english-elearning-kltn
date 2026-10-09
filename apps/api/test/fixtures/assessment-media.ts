/** Project-owned, deterministic media fixtures for authorized assessment delivery tests. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// One MPEG-1 Layer III frame (128 kbps, 44.1 kHz). Empty frame data decodes as silence.
export const TINY_MP3 = (() => {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x64]);
  return frame;
})();
