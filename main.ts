// make.fun sticker entry (Node 22, standard library only): copies entry.png to /output/entry.png.
// The image is drawn as vector art in sticker.svg and rendered to entry.png by render.mjs (a
// dev-time script using Playwright's Chromium, never run by the grader), so the bytes are fixed and
// both grading runs write the same file.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

copyFileSync(new URL('./entry.png', import.meta.url), join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'));
