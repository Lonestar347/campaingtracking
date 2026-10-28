// Placeholder visuals for the seed creatives: simple generated PNGs (gradient,
// shapes, paw/pack motifs). No external images, no image library needed.

import { deflateSync } from "node:zlib";

type RGB = [number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Signed "distance" in pixels to an ellipse edge (negative inside), good enough for anti-aliasing. */
type Shape = { color: RGB; alpha?: number; dist: (x: number, y: number) => number };

const ellipse = (cx: number, cy: number, rx: number, ry: number, color: RGB, alpha = 1): Shape => ({
  color,
  alpha,
  dist: (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry),
});

const roundedRect = (x0: number, y0: number, w: number, h: number, r: number, color: RGB, alpha = 1): Shape => ({
  color,
  alpha,
  dist: (x, y) => {
    const qx = Math.abs(x - (x0 + w / 2)) - (w / 2 - r);
    const qy = Math.abs(y - (y0 + h / 2)) - (h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  },
});

export type Motif = "paw" | "pack" | "bowl";

export interface VisualSpec {
  from: string;
  to: string;
  accent: string;
  motif: Motif;
}

/** Renders a 960×720 placeholder visual as PNG. */
export function renderVisual(spec: VisualSpec, width = 960, height = 720): Buffer {
  const [from, to, accent] = [hex(spec.from), hex(spec.to), hex(spec.accent)];
  const white: RGB = [255, 255, 255];
  const shapes: Shape[] = [ellipse(width * 0.78, height * 0.22, 230, 230, white, 0.14)];

  if (spec.motif === "paw") {
    const s = 1.25;
    const [cx, cy] = [width * 0.5, height * 0.58];
    shapes.push(ellipse(cx, cy + 40 * s, 120 * s, 100 * s, accent));
    for (const [dx, dy, r] of [[-150, -70, 46], [-60, -150, 50], [60, -150, 50], [150, -70, 46]]) {
      shapes.push(ellipse(cx + dx * s, cy + dy * s, r * s, r * 1.2 * s, accent));
    }
  } else if (spec.motif === "pack") {
    shapes.push(roundedRect(width * 0.33, height * 0.18, width * 0.34, height * 0.66, 36, accent));
    shapes.push(roundedRect(width * 0.33, height * 0.42, width * 0.34, height * 0.12, 0, white, 0.85));
    shapes.push(ellipse(width * 0.5, height * 0.3, 44, 44, white, 0.85));
  } else {
    shapes.push(ellipse(width * 0.5, height * 0.62, 260, 70, accent));
    shapes.push(roundedRect(width * 0.5 - 260, height * 0.62, 520, 120, 60, accent));
    for (const [dx, dy] of [[-90, -30], [-20, -55], [50, -35], [110, -60], [-140, -55], [10, -10]]) {
      shapes.push(ellipse(width * 0.5 + dx, height * 0.62 + dy, 34, 26, white, 0.8));
    }
  }

  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      let c: RGB = [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * (t * 0.8 + (x / width) * 0.2)) as RGB;
      for (const shape of shapes) {
        const coverage = Math.min(1, Math.max(0, 0.5 - shape.dist(x, y))) * (shape.alpha ?? 1);
        if (coverage > 0) c = [0, 1, 2].map((i) => c[i] + (shape.color[i] - c[i]) * coverage) as RGB;
      }
      const o = (y * width + x) * 3;
      pixels[o] = c[0];
      pixels[o + 1] = c[1];
      pixels[o + 2] = c[2];
    }
  }
  return encodePng(width, height, pixels);
}
