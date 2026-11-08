// make.fun sticker — drawn from scratch, Node 22 standard library only.
//
// One idea: your agent, on the #1 spot. A little robot (its eyes are "> <", a happy squint that is
// also a pair of code chevrons) throws its arms up on top of a gold podium, with silver and bronze
// below, and the make.fun wordmark underneath, whose "." is the gold medal dot.
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

// Paint `color` wherever sdf < 0, with a one-pixel analytic edge, inside the bounding box only.
// Everything drawn on the sticker face is laid out once, then nudged down by `shiftY` to sit centred.
let shiftY = 0;

function paint(sdf: SDF, box: Box, color: RGB, opacity = 1, soft = 0): void {
  const x0 = clamp(Math.floor(box[0]) - 2, 0, W - 1);
  const y0 = clamp(Math.floor(box[1] + shiftY) - 2, 0, H - 1);
  const x1 = clamp(Math.ceil(box[2]) + 2, 0, W - 1);
  const y1 = clamp(Math.ceil(box[3] + shiftY) + 2, 0, H - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = sdf(x + 0.5, y + 0.5 - shiftY);
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

// A stroked path: a list of segments and arcs drawn as one shape (so joints never double up).
type Prim =
  | { k: 's'; a: [number, number, number, number] }
  | { k: 'a'; a: [number, number, number, number, number] };

function stroke(prims: Prim[], halfWidth: number): SDF {
  return (x, y) => {
    let d = Infinity;
    for (const p of prims) {
      const v = p.k === 's' ? segDist(x, y, p.a[0], p.a[1], p.a[2], p.a[3]) : arcDist(x, y, p.a[0], p.a[1], p.a[2], p.a[3], p.a[4]);
      if (v < d) d = v;
    }
    return d - halfWidth;
  };
}

function union(...fs: SDF[]): SDF {
  return (x, y) => {
    let d = Infinity;
    for (const f of fs) d = Math.min(d, f(x, y));
    return d;
  };
}

// ---------------------------------------------------------------------------------------------
// A small stroke font: glyphs in x-height units, baseline at y = 0, y down.

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
  '1': { w: 0.5, p: [S(0.32, -1, 0.32, 0), S(0.04, -0.76, 0.32, -1)] },
  '2': { w: 0.7, p: [A(0.35, -0.68, 0.32, 195, 395), S(0.6, -0.48, 0.02, 0), S(0.02, 0, 0.7, 0)] },
  '3': { w: 0.68, p: [A(0.32, -0.74, 0.26, 200, 450), A(0.32, -0.27, 0.29, 270, 520)] },
  // Capitals for the tagline, in cap-height units.
  M: { w: 0.9, p: [S(0, 0, 0, -1), S(0, -1, 0.45, -0.42), S(0.45, -0.42, 0.9, -1), S(0.9, -1, 0.9, 0)] },
  Y: { w: 0.8, p: [S(0, -1, 0.4, -0.48), S(0.8, -1, 0.4, -0.48), S(0.4, -0.48, 0.4, 0)] },
  A: { w: 0.84, p: [S(0, 0, 0.42, -1), S(0.42, -1, 0.84, 0), S(0.17, -0.36, 0.67, -0.36)] },
  G: { w: 0.98, p: [A(0.5, -0.5, 0.5, 0, 318), S(0.56, -0.48, 1.0, -0.48), S(1.0, -0.48, 1.0, -0.3)] },
  E: { w: 0.64, p: [S(0, -1, 0, 0), S(0, -1, 0.64, -1), S(0, -0.5, 0.54, -0.5), S(0, 0, 0.64, 0)] },
  N: { w: 0.8, p: [S(0, 0, 0, -1), S(0, -1, 0.8, 0), S(0.8, 0, 0.8, -1)] },
  T: { w: 0.76, p: [S(0, -1, 0.76, -1), S(0.38, -1, 0.38, 0)] },
  B: { w: 0.72, p: [S(0, 0, 0, -1), S(0, -1, 0.44, -1), A(0.44, -0.755, 0.245, 270, 450), S(0.44, -0.51, 0, -0.51), A(0.47, -0.255, 0.255, 270, 450), S(0.47, 0, 0, 0)] },
  R: { w: 0.74, p: [S(0, 0, 0, -1), S(0, -1, 0.44, -1), A(0.44, -0.74, 0.26, 270, 450), S(0.44, -0.48, 0, -0.48), S(0.36, -0.48, 0.74, 0)] },
  O: { w: 1.0, p: [A(0.5, -0.5, 0.5, 0, 360)] },
  U: { w: 0.8, p: [S(0, -1, 0, -0.4), A(0.4, -0.4, 0.4, 0, 180), S(0.8, -0.4, 0.8, -1)] },
  S: { w: 0.66, p: [A(0.34, -0.755, 0.245, 90, 330), A(0.34, -0.255, 0.255, 270, 510)] },
};

// Text along the bottom of a circle, upright and reading left to right, tops toward the centre.
// `r` is the baseline radius; each glyph gets its own rotated frame at its centre angle.
function arcText(text: string, cx: number, cy: number, r: number, h: number, weight: number, gap: number, color: RGB): void {
  const space = 0.45;
  let total = 0;
  for (const ch of text) total += (ch === ' ' ? space : GLYPHS[ch].w) + gap;
  total -= gap;
  let s = (total * h) / 2; // arc length still to go, left to right; the middle sits at the bottom
  for (const ch of text) {
    const w = ch === ' ' ? space : GLYPHS[ch].w;
    if (ch !== ' ') {
      const theta = 90 + ((s - (w * h) / 2) / r) * (180 / Math.PI); // larger angle = further left
      const phi = theta - 90;
      const pr = (phi * Math.PI) / 180;
      const cphi = Math.cos(pr);
      const sphi = Math.sin(pr);
      const th = (theta * Math.PI) / 180;
      const ox = cx + r * Math.cos(th);
      const oy = cy + r * Math.sin(th);
      // Glyph point (gx, gy), gx measured from the glyph's centre, rotated by phi onto the arc.
      const map = (gx: number, gy: number): [number, number] => {
        const lx = (gx - w / 2) * h;
        const ly = gy * h;
        return [ox + lx * cphi - ly * sphi, oy + lx * sphi + ly * cphi];
      };
      const prims = GLYPHS[ch].p.map((p): Prim => {
        if (p.k === 's') {
          const [ax, ay] = map(p.a[0], p.a[1]);
          const [bx, by] = map(p.a[2], p.a[3]);
          return { k: 's', a: [ax, ay, bx, by] };
        }
        const [qx, qy] = map(p.a[0], p.a[1]);
        return { k: 'a', a: [qx, qy, p.a[2] * h, p.a[3] + phi, p.a[4] + phi] };
      });
      const m = h * 1.4;
      paint(stroke(prims, (weight * h) / 2), [ox - m, oy - m, ox + m, oy + m], color);
    }
    s -= (w + gap) * h;
  }
}

// Lay out `text` with x-height h, its baseline centred on (cx, baseY). Returns one stroke per glyph.
function word(text: string, cx: number, baseY: number, h: number, weight: number, gap: number): { sdf: SDF; box: Box; ch: string }[] {
  let total = 0;
  for (const ch of text) total += (GLYPHS[ch] ? GLYPHS[ch].w : 0.2) + gap;
  total -= gap;
  let x = cx - (total * h) / 2;
  const out: { sdf: SDF; box: Box; ch: string }[] = [];
  const hw = (weight * h) / 2;
  for (const ch of text) {
    const g = GLYPHS[ch];
    const w = g ? g.w : 0.2;
    if (g) {
      const prims = g.p.map((p): Prim => {
        if (p.k === 's') return { k: 's', a: [x + p.a[0] * h, baseY + p.a[1] * h, x + p.a[2] * h, baseY + p.a[3] * h] };
        return { k: 'a', a: [x + p.a[0] * h, baseY + p.a[1] * h, p.a[2] * h, p.a[3], p.a[4]] };
      });
      out.push({ sdf: stroke(prims, hw), box: [x - h * 0.4, baseY - h * 1.7, x + (w + 0.4) * h, baseY + h * 0.4], ch });
    } else {
      out.push({ sdf: circle(x + 0.1 * h, baseY - hw, hw * 1.25), box: [x - h * 0.3, baseY - h, x + h * 0.6, baseY + h * 0.3], ch });
    }
    x += (w + gap) * h;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Palette.

const BACKDROP = hex('#ECEAE4');
const PAPER = hex('#FFFFFF');
const NAVY = hex('#171A30');
const SPOT = hex('#22264A');
const LIME = hex('#B9F23C');
const LIME_DARK = hex('#86C21B');
const GOLD = hex('#FFC23D');
const GOLD_DARK = hex('#E09A12');
const SILVER = hex('#C8D0DF');
const SILVER_DARK = hex('#9AA4B8');
const BRONZE = hex('#E8925C');
const BRONZE_DARK = hex('#C06B38');
const PINK = hex('#FF5C8A');
const SKY = hex('#5CC8FF');

// ---------------------------------------------------------------------------------------------
// The sticker.

const CX = 512;
const CY = 512;
const R = 440; // the navy face
const BORDER = 26; // the white die-cut margin

// Backdrop and a soft shadow, so it reads as a sticker on any page.
for (let i = 0; i < W * H; i++) {
  buf[i * 3] = BACKDROP[0];
  buf[i * 3 + 1] = BACKDROP[1];
  buf[i * 3 + 2] = BACKDROP[2];
}
const full: Box = [0, 0, W, H];
paint(circle(CX, CY + 14, R + BORDER), full, hex('#000000'), 0.22, 26);
paint(circle(CX, CY, R + BORDER), full, PAPER);
paint(circle(CX, CY, R), full, NAVY);

shiftY = 2;

// A spotlight behind the winner.
paint(circle(CX, 400, 250), [CX - 260, 140, CX + 260, 660], SPOT, 1);
paint(circle(CX, 400, 175), [CX - 190, 210, CX + 190, 590], hex('#2B3060'), 1);

// Confetti: fixed positions, so the bytes never change.
const confetti: [number, number, number, RGB][] = [
  [262, 268, 20, PINK], [318, 196, -35, GOLD], [700, 214, 40, SKY], [770, 300, -20, PINK],
  [236, 400, 60, SKY], [790, 430, 15, GOLD], [372, 150, 75, LIME], [650, 150, -60, LIME],
];
for (const [x, y, deg, col] of confetti) {
  const t = (deg * Math.PI) / 180;
  const dx = Math.cos(t) * 13;
  const dy = Math.sin(t) * 13;
  paint(capsule(x - dx, y - dy, x + dx, y + dy, 6.5), [x - 24, y - 24, x + 24, y + 24], col);
}
for (const [x, y, r, col] of [[300, 330, 7, GOLD], [728, 360, 7, LIME], [420, 228, 6, SKY], [604, 236, 6, PINK]] as [number, number, number, RGB][]) {
  paint(circle(x, y, r), [x - r, y - r, x + r, y + r], col);
}

// Podium: 2 (silver, left), 1 (gold, centre), 3 (bronze, right), standing on one floor line.
const FLOOR = 640;
function block(x0: number, x1: number, top: number, face: RGB, edge: RGB, digit: string): void {
  const cx = (x0 + x1) / 2;
  const hw = (x1 - x0) / 2;
  const hh = (FLOOR - top) / 2;
  paint(roundBox(cx, top + hh, hw, hh, 12), [x0, top, x1, FLOOR], face);
  // A lip along the top edge gives the block some depth.
  paint(roundBox(cx, top + 9, hw, 9, 9), [x0, top, x1, top + 18], edge);
  // The digit fills about 60% of the face below the lip, centred on it.
  const faceH = FLOOR - top - 18;
  const dh = Math.min(faceH * 0.6, 58);
  const num = word(digit, cx, top + 18 + faceH / 2 + dh / 2, dh, 0.3, 0)[0];
  paint(num.sdf, num.box, NAVY);
}
block(318, 438, 548, SILVER, SILVER_DARK, '2');
block(586, 706, 566, BRONZE, BRONZE_DARK, '3');
block(432, 592, 500, GOLD, GOLD_DARK, '1');
paint(roundBox(CX, FLOOR + 5, 220, 5, 5), [290, FLOOR, 734, FLOOR + 10], hex('#0E1022'));

// The robot, on #1.
const FEET = 500;
// Legs.
paint(union(capsule(490, 456, 490, FEET - 12, 11), capsule(534, 456, 534, FEET - 12, 11)), [470, 450, 556, FEET], LIME_DARK);
paint(union(roundBox(486, FEET - 7, 20, 8, 7), roundBox(538, FEET - 7, 20, 8, 7)), [460, FEET - 16, 562, FEET], LIME);
// Arms up, in victory.
const arms = union(capsule(470, 410, 408, 330, 13), capsule(554, 410, 616, 330, 13));
paint(arms, [380, 300, 644, 430], LIME_DARK);
paint(union(circle(404, 324, 20), circle(620, 324, 20)), [380, 300, 644, 348], LIME);
// Body.
paint(roundBox(CX, 424, 56, 44, 22), [450, 376, 574, 472], LIME);
paint(roundBox(CX, 430, 30, 18, 9), [480, 410, 544, 450], LIME_DARK);
paint(circle(CX, 430, 7), [500, 420, 524, 440], GOLD);
// Neck and head.
paint(roundBox(CX, 374, 20, 12, 6), [490, 360, 534, 388], LIME_DARK);
paint(roundBox(CX, 306, 92, 70, 34), [418, 234, 606, 378], LIME);
// Ears.
paint(union(roundBox(414, 306, 10, 24, 8), roundBox(610, 306, 10, 24, 8)), [400, 280, 624, 332], LIME_DARK);
// Antenna.
paint(capsule(CX, 236, CX, 196, 6), [500, 186, 524, 240], LIME_DARK);
paint(circle(CX, 186, 16), [494, 168, 530, 204], PINK);
paint(circle(CX - 5, 181, 5), [500, 172, 512, 190], hex('#FFB3C8'));
// Face screen.
paint(roundBox(CX, 310, 68, 46, 20), [440, 262, 584, 358], NAVY);
// Eyes: "> <".
const eyes = stroke([
  { k: 's', a: [462, 286, 488, 302] }, { k: 's', a: [488, 302, 462, 318] },
  { k: 's', a: [562, 286, 536, 302] }, { k: 's', a: [536, 302, 562, 318] },
], 7);
paint(eyes, [450, 276, 574, 328], LIME);
// A grin.
paint(stroke([{ k: 'a', a: [CX, 322, 18, 25, 155] }], 6), [488, 320, 536, 348], LIME);
// Cheeks.
paint(union(circle(468, 336, 8), circle(556, 336, 8)), [456, 324, 568, 348], PINK, 0.55);

// The wordmark: make.fun, with the "." in gold.
const mark = word('make.fun', CX, 774, 80, 0.25, 0.32);
for (const g of mark) paint(g.sdf, g.box, g.ch === '.' ? GOLD : PAPER);

// The tagline, curving round the bottom of the face.
shiftY = 0;
arcText('MY AGENT BEAT YOURS', CX, CY, 412, 25, 0.24, 0.3, LIME);

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
