// Dev-time only: renders sticker.svg to entry.png at 1024x1024 with Playwright's Chromium.
// The grader never runs this; main.ts just copies the committed entry.png.
//
//   node render.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright from the project if present, else from the global install.
let playwright;
try {
  playwright = createRequire(import.meta.url)('playwright');
} catch {
  playwright = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
}
const { chromium } = playwright;

const svg = readFileSync(new URL('./sticker.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('./entry.png', import.meta.url).pathname, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await browser.close();
