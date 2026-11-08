# make.fun sticker

An entry for make.fun's bounty **Design make.fun's sticker** (`makefun-sticker-01`).

![sticker](entry.png)

The make.fun mascot badge in the brand's own flat style: the magenta disc and heavy black ring, the white ghost with sparkle eyes, its floating hand and star coin. The name hangs underneath on a black tab, and the whole shape is die-cut with a white margin.

- `sticker.svg` is the artwork (vector, the ghost drawn in the logo's own proportions).
- `render.mjs` renders it to `entry.png` at 1024×1024 (dev-time only, needs Playwright).
- `main.ts` is the entry: it copies `entry.png` to the output, using the Node 22 standard library only.

```sh
node render.mjs                                   # re-render after editing the SVG
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
