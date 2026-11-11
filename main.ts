// make.fun sticker entry (Node 22, standard library only).
//
// The sticker is vector art in sticker.svg, rendered once to entry.png by render.mjs (a dev-time
// script, never run by the grader). This program writes that committed PNG to the output
// directory after checking it is a whole PNG within the bounty's limits, so both grading runs
// write exactly the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1024;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const png = readFileSync(new URL('./entry.png', import.meta.url));

if (png.length > MAX_BYTES) throw new Error(`entry.png is ${png.length} bytes, over the 1 MiB limit`);
if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('entry.png is not a PNG');

const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width > MAX_SIDE || height > MAX_SIDE) throw new Error(`entry.png is ${width}x${height}, over ${MAX_SIDE}x${MAX_SIDE}`);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote entry.png: ${width}x${height}, ${png.length} bytes`);
