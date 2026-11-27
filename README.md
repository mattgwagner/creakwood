# Creakwood

A spooky reading-comprehension mystery for a 3rd grader. Explore a haunted town with a lantern and Wick the candle; read notes, diaries, signs, maps and timetables to pick the safe door and solve each case. Questions follow the Florida B.E.S.T. grade 3 reading skills, including FAST-style "Part B" evidence taps.

- The whole game is `public/index.html` (Canvas 2D world, DOM passages, Web Audio, speechSynthesis). No image or audio files.
- `bun server.ts` previews on http://127.0.0.1:4851 (`HOST=0.0.0.0` to reach it from an iPad).
- `wrangler.jsonc` is an assets-only Worker named `creakwood`. Deploys are manual (`npm run deploy`).
- Saves: `creakwood.players` `{list, cur}`; player 1 is `creakwood.v1`, later players `creakwood.v1.p2` and up.

## Content

Passages and questions live in the `<script id="cw-content">` block of `public/index.html`. Every passage has Level 1, 2 and 3 text; questions point at keyed sentences (`[[key|...]]`) that must exist at every level. `CONTENT.md` is generated from that block (`npm run content`) for review without playing.

## Checks

`npm run check` runs `scripts/contentcheck.mjs` (question shape, one right answer, evidence keys at every level, word bands, Clue Board proofs, keyword-copy guard, CONTENT.md freshness) and `e2e/play.mjs` (a full Case 1 playthrough at 1180x820 with one wrong answer and one wrong door, plus Lamplighter and Tock checks). `SHOTS=dir` picks the screenshot folder; `ALL=1 node e2e/play.mjs` plays all three cases. Playwright is borrowed from a sibling repo's `node_modules`.

Debug: `?debug` exposes `window.__cw` (`S`, `RUN`, `WORLD`, `Q` = the open question with its answer, `loadCase(n)`, `scene(n)`, `fast`). `?debug&test=read|evidence|order|doors|board|unmask|lamp|tock` stages each mechanic.
