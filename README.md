# make.fun sticker

An entry for make.fun's bounty **Design make.fun's sticker** (`makefun-sticker-01`).

![sticker](preview.png)

One idea, in make.fun's own flat style (magenta disc, thick black outlines, a white ghost with sparkle eyes): the ghost holds its star badge up high, like a medal it just won. You build something, it competes, it wins. The chunky outlined make.fun wordmark sits below.

`main.ts` draws the whole image from scratch with signed-distance shapes (smooth-blended for the ghost) and its own stroke font for the wordmark, then writes the PNG with `node:zlib`. It uses the Node 22 standard library only and no randomness, so every run writes the same bytes.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`preview.png` is a copy of the output, kept here for this README.
