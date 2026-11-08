// make.fun sticker — drawn from scratch, Node 22 standard library only.
//
// One idea, in make.fun's own flat style (magenta disc, thick black outlines, white ghost with
// sparkle eyes): the ghost holds its star badge up high, like a medal it just won. That is the site
// in one picture: you build something, it competes, it wins. The make.fun wordmark sits below.
//
// Everything is signed-distance shapes rasterised with analytic anti-aliasing, then written as a
// PNG with node:zlib. No randomness and no clock, so every run writes the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------------------------
// Canvas: float RGB, painted back to front.

const buf = new Float32Array(W * H * 3);

type RGB = [number, number, number];
type SDF = (x: number, y: number) => number;
type Box = [number, number, number, number]; // x0, y0, x1, y1

function hex(s: string): RGB {
  const n = parseInt(s.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Paint `color` wherever sdf < 0, with a one-pixel analytic edge (or a smooth `soft` falloff),
// inside the bounding box only.
function paint(sdf: SDF, box: Box, color: RGB, opacity = 1, soft = 0): void {
  const x0 = clamp(Math.floor(box[0]) - 2, 0, W - 1);
  const y0 = clamp(Math.floor(box[1]) - 2, 0, H - 1);
  const x1 = clamp(Math.ceil(box[2]) + 2, 0, W - 1);
  const y1 = clamp(Math.ceil(box[3]) + 2, 0, H - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = sdf(x + 0.5, y + 0.5);
      let a: number;
      if (soft > 0) {
        const t = clamp((d + soft) / (2 * soft), 0, 1);
        a = 1 - t * t * (3 - 2 * t);
      } else {
        a = clamp(0.5 - d, 0, 1);
      }
      a *= opacity;
      if (a <= 0) continue;
      const i = (y * W + x) * 3;
      buf[i] += (color[0] - buf[i]) * a;
      buf[i + 1] += (color[1] - buf[i + 1]) * a;
      buf[i + 2] += (color[2] - buf[i + 2]) * a;
    }
  }
}

// Paint a shape the make.fun way: a thick black outline, then the fill on top.
function outlined(sdf: SDF, box: Box, fill: RGB, line: number): void {
  const grown: Box = [box[0] - line, box[1] - line, box[2] + line, box[3] + line];
  paint((x, y) => sdf(x, y) - line, grown, INK);
  paint(sdf, box, fill);
}

// ---------------------------------------------------------------------------------------------
// Shapes.

function circle(cx: number, cy: number, r: number): SDF {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

function roundBox(cx: number, cy: number, hw: number, hh: number, r: number): SDF {
  return (x, y) => {
    const qx = Math.abs(x - cx) - hw + r;
    const qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const px = x - ax;
  const py = y - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp((px * dx + py * dy) / len2, 0, 1);
  return Math.hypot(px - dx * t, py - dy * t);
}

// Distance to an arc of a circle, angles in degrees, y down (0 = right, 90 = bottom, 270 = top).
function arcDist(x: number, y: number, cx: number, cy: number, r: number, a0: number, a1: number): number {
  let ang = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  while (ang < a0) ang += 360;
  while (ang >= a0 + 360) ang -= 360;
  if (ang <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - r);
  const r0 = (a0 * Math.PI) / 180;
  const r1 = (a1 * Math.PI) / 180;
  return Math.min(
    Math.hypot(x - cx - r * Math.cos(r0), y - cy - r * Math.sin(r0)),
    Math.hypot(x - cx - r * Math.cos(r1), y - cy - r * Math.sin(r1)),
  );
}

function capsule(ax: number, ay: number, bx: number, by: number, r: number): SDF {
  return (x, y) => segDist(x, y, ax, ay, bx, by) - r;
}

// Signed distance to a closed polygon (even-odd inside test).
function polygon(pts: [number, number][]): SDF {
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j];
      const [bx, by] = pts[i];
      d = Math.min(d, segDist(x, y, ax, ay, bx, by));
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside ? -d : d;
  };
}

// A star with `n` points: tips at radius `outer`, valleys at `inner`, first tip straight up.
function star(cx: number, cy: number, n: number, outer: number, inner: number, rot = 0): SDF {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const t = ((-90 + rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return polygon(pts);
}

// A four-point sparkle with curved, pinched sides (the logo's eyes): an astroid-like shape.
function sparkle(cx: number, cy: number, r: number): SDF {
  const pts: [number, number][] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // Exponent 3 pinches the sides inward; sign keeps each quadrant.
    pts.push([cx + r * Math.sign(c) * Math.abs(c) ** 3, cy + r * Math.sign(s) * Math.abs(s) ** 3]);
  }
  return polygon(pts);
}

// Smooth unions stretch the distance field in their fillets, which blurs the edge there. Dividing
// by the gradient's length (central differences) brings the edge back to one crisp pixel.
function crisp(f: SDF): SDF {
  return (x, y) => {
    const d = f(x, y);
    if (Math.abs(d) > 4) return d; // far from the edge only the sign matters
    const gx = f(x + 0.5, y) - f(x - 0.5, y);
    const gy = f(x, y + 0.5) - f(x, y - 0.5);
    const g = Math.hypot(gx, gy);
    return g > 1e-6 ? d / g : d;
  };
}

function union(...fs: SDF[]): SDF {
  return (x, y) => {
    let d = Infinity;
    for (const f of fs) d = Math.min(d, f(x, y));
    return d;
  };
}

// Smooth union: blends two shapes with a fillet of radius k, so the ghost reads as one soft blob.
function smooth(k: number, ...fs: SDF[]): SDF {
  return (x, y) => {
    let d = fs[0](x, y);
    for (let i = 1; i < fs.length; i++) {
      const e = fs[i](x, y);
      const h = clamp(0.5 + (0.5 * (e - d)) / k, 0, 1);
      d = e * (1 - h) + d * h - k * h * (1 - h);
    }
    return d;
  };
}

// ---------------------------------------------------------------------------------------------
// A small stroke font for the wordmark: glyphs in x-height units, baseline at y = 0, y down.

type Prim =
  | { k: 's'; a: [number, number, number, number] }
  | { k: 'a'; a: [number, number, number, number, number] };

const S = (x1: number, y1: number, x2: number, y2: number): Prim => ({ k: 's', a: [x1, y1, x2, y2] });
const A = (cx: number, cy: number, r: number, a0: number, a1: number): Prim => ({ k: 'a', a: [cx, cy, r, a0, a1] });

const GLYPHS: Record<string, { w: number; p: Prim[] }> = {
  m: { w: 1.0, p: [S(0, -1, 0, 0), A(0.25, -0.75, 0.25, 180, 360), S(0.5, -0.75, 0.5, 0), A(0.75, -0.75, 0.25, 180, 360), S(1, -0.75, 1, 0)] },
  a: { w: 0.84, p: [A(0.42, -0.5, 0.42, 0, 360), S(0.84, -1, 0.84, 0)] },
  k: { w: 0.66, p: [S(0, -1.42, 0, 0), S(0.62, -1, 0.04, -0.4), S(0.24, -0.6, 0.66, 0)] },
  e: { w: 0.86, p: [A(0.43, -0.5, 0.43, 48, 360), S(0, -0.5, 0.86, -0.5)] },
  f: { w: 0.6, p: [S(0.18, 0, 0.18, -1.14), A(0.43, -1.14, 0.25, 180, 320), S(-0.02, -1, 0.56, -1)] },
  u: { w: 0.8, p: [S(0, -1, 0, -0.4), A(0.4, -0.4, 0.4, 0, 180), S(0.8, -1, 0.8, 0)] },
  n: { w: 0.8, p: [S(0, -1, 0, 0), A(0.4, -0.6, 0.4, 180, 360), S(0.8, -0.6, 0.8, 0)] },
};

function primDist(x: number, y: number, p: Prim): number {
  return p.k === 's' ? segDist(x, y, p.a[0], p.a[1], p.a[2], p.a[3]) : arcDist(x, y, p.a[0], p.a[1], p.a[2], p.a[3], p.a[4]);
}

// The whole word as one distance field to its centre lines (the "." is a point), so a stroke of
// any width, and an outline around that, is one paint call each.
function wordField(text: string, cx: number, baseY: number, h: number, gap: number): { dist: SDF; box: Box } {
  let total = 0;
  for (const ch of text) total += (GLYPHS[ch] ? GLYPHS[ch].w : 0.12) + gap;
  total -= gap;
  let x = cx - (total * h) / 2;
  const prims: Prim[] = [];
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      for (const p of g.p) {
        if (p.k === 's') prims.push({ k: 's', a: [x + p.a[0] * h, baseY + p.a[1] * h, x + p.a[2] * h, baseY + p.a[3] * h] });
        else prims.push({ k: 'a', a: [x + p.a[0] * h, baseY + p.a[1] * h, p.a[2] * h, p.a[3], p.a[4]] });
      }
    } else {
      const px = x + 0.06 * h;
      const py = baseY - 0.06 * h;
      prims.push({ k: 's', a: [px, py, px, py] });
    }
    x += ((g ? g.w : 0.12) + gap) * h;
  }
  const dist: SDF = (px, py) => {
    let d = Infinity;
    for (const p of prims) d = Math.min(d, primDist(px, py, p));
    return d;
  };
  return { dist, box: [cx - (total * h) / 2, baseY - 1.42 * h, cx + (total * h) / 2, baseY] };
}

// ---------------------------------------------------------------------------------------------
// Palette: make.fun's magenta, ink black, white. Nothing else.

const BACKDROP = hex('#ECEAE6');
const PAPER = hex('#FFFFFF');
const INK = hex('#111114');
const MAGENTA = hex('#C8228F');

const LINE = 18; // the outline weight, everywhere

// ---------------------------------------------------------------------------------------------
// The sticker.

const CX = 512;
const CY = 512;

for (let i = 0; i < W * H; i++) {
  buf[i * 3] = BACKDROP[0];
  buf[i * 3 + 1] = BACKDROP[1];
  buf[i * 3 + 2] = BACKDROP[2];
}
const full: Box = [0, 0, W, H];

// Die-cut: soft shadow, white margin, black ring, magenta face.
paint(circle(CX, CY + 12, 476), full, hex('#000000'), 0.2, 22);
paint(circle(CX, CY, 476), full, PAPER);
paint(circle(CX, CY, 448), full, INK);
paint(circle(CX, CY, 420), full, MAGENTA);

// The star badge, held high: a magenta coin with a white star, in a black outline.
const MEDAL_X = 686;
const MEDAL_Y = 252;
const MEDAL_R = 70;
outlined(circle(MEDAL_X, MEDAL_Y, MEDAL_R), [MEDAL_X - MEDAL_R, MEDAL_Y - MEDAL_R, MEDAL_X + MEDAL_R, MEDAL_Y + MEDAL_R], MAGENTA, LINE);
paint(star(MEDAL_X, MEDAL_Y + 3, 5, 48, 21), [MEDAL_X - 52, MEDAL_Y - 52, MEDAL_X + 52, MEDAL_Y + 52], PAPER);

// The ghost: a dome on a rounded body with a flat bottom, a nub of a left arm and a right arm raised
// to the badge, blended into one soft shape and outlined once.
const GX = 474;
const TOP = 256; // top of the dome
const BOTTOM = 618; // the flat base
const HALF = 126; // half the body's width
const HAND_X = MEDAL_X - 20;
const HAND_Y = MEDAL_Y + 78;
const body = smooth(
  16,
  circle(GX, TOP + HALF, HALF),
  roundBox(GX, (TOP + HALF + BOTTOM) / 2, HALF, (BOTTOM - TOP - HALF) / 2, 34),
  circle(GX - HALF - 4, 500, 26),
);
// The raised arm leaves the body's right side and reaches up to the badge; a wide blend fills the
// armpit so no sliver of outline is left between arm and dome.
const ghost = smooth(40, body, smooth(10, capsule(GX + HALF - 6, 486, HAND_X - 4, HAND_Y + 8, 22), circle(HAND_X, HAND_Y, 32)));
// The outline is the shape grown by LINE; both edges are made crisp separately.
const ghostBox: Box = [GX - HALF - 50, TOP, MEDAL_X + 30, BOTTOM];
paint(crisp((x, y) => ghost(x, y) - LINE), [ghostBox[0] - LINE, ghostBox[1] - LINE, ghostBox[2] + LINE, ghostBox[3] + LINE], INK);
paint(crisp(ghost), ghostBox, PAPER);
// The little notch between its two feet.
paint(capsule(GX, BOTTOM, GX, BOTTOM - 30, 8), [GX - 10, BOTTOM - 40, GX + 10, BOTTOM + 10], INK);

// Sparkle eyes, looking up at the badge.
paint(sparkle(GX - 40, 388, 36), [GX - 78, 350, GX - 2, 426], INK);
paint(sparkle(GX + 52, 378, 36), [GX + 14, 340, GX + 90, 416], INK);

// A few white glints round the badge: the win, in the simplest possible way. All well inside the ring.
for (const [x, y, r] of [[786, 262, 18], [586, 180, 14], [776, 358, 12]] as [number, number, number][]) {
  paint(sparkle(x, y, r), [x - r, y - r, x + r, y + r], PAPER);
}

// The wordmark: chunky white make.fun, outlined in black like the ghost.
const WORD_H = 68;
const WORD_W = 0.32 * WORD_H; // stroke weight
const word = wordField('make.fun', CX, 792, WORD_H, 0.32);
const wb: Box = [word.box[0] - 40, word.box[1] - 40, word.box[2] + 40, word.box[3] + 40];
paint((x, y) => word.dist(x, y) - WORD_W / 2 - 14, wb, INK);
paint((x, y) => word.dist(x, y) - WORD_W / 2, wb, PAPER);

// ---------------------------------------------------------------------------------------------
// PNG out.

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 3);
  raw[row] = 1; // Sub filter: flat colours compress to almost nothing.
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(clamp(buf[(y * W + x) * 3 + c], 0, 255));
      const left = x > 0 ? Math.round(clamp(buf[(y * W + x - 1) * 3 + c], 0, 255)) : 0;
      raw[row + 1 + x * 3 + c] = (v - left) & 255;
    }
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', new Uint8Array(0)),
]);

writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), png);
