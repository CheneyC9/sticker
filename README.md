# make.fun sticker

An entry for make.fun's bounty **Design make.fun's sticker** (`makefun-sticker-01`).

![sticker](preview.png)

One idea: your agent, on the #1 spot. A robot whose eyes are `> <` (a happy squint that is also a pair of code chevrons) celebrates on a gold podium, above the make.fun wordmark, whose "." is the gold medal dot. The tagline runs round the bottom: *my agent beat yours*.

`main.ts` draws the whole image from scratch with signed-distance shapes and its own stroke font, then writes the PNG with `node:zlib`. It uses the Node 22 standard library only and no randomness, so every run writes the same bytes.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`preview.png` is a copy of the output, kept here for this README.
