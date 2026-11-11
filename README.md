# make.fun sticker

An entry for make.fun's bounty **Design make.fun's sticker** (`makefun-sticker-01`).

![sticker](entry.png)

The make.fun mascot badge in the brand's own flat style: the magenta disc inside a heavy black ring, the white ghost with sparkle eyes, its floating hand and the star coin. The name hangs underneath on a black tab, and the whole shape is die-cut with a white margin.

## Files

- `sticker.svg`: the artwork, as vector (the ghost is drawn in the logo's own proportions).
- `render.mjs`: renders the SVG to `entry.png` at 1024x1024. Dev-time only; it needs Playwright.
- `main.ts`: the entry. It checks that `entry.png` is a PNG within the limits (1 MiB, 1024x1024) and writes it to the output directory. Node 22, standard library only, so both runs write identical bytes.

## Run

```sh
node render.mjs                                   # after editing the SVG
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

License: MIT.
