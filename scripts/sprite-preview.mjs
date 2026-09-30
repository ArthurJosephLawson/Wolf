#!/usr/bin/env node
/**
 * Render the wolf as text, so the artwork can be reviewed without a display.
 *
 * The frames are generated in TypeScript, so the module is loaded through
 * Vite's SSR loader rather than a hand-rolled transpile step.
 *
 *   node scripts/sprite-preview.mjs              # every state
 *   node scripts/sprite-preview.mjs sad happy    # just these
 */

import { createServer } from "vite";

const GLYPH = {
  ".": " ",
  K: "#",
  B: "O",
  C: "o",
  L: "+",
  W: "W",
  P: "P",
  R: "X",
  T: "T",
};

function render(rows, palette) {
  return rows.map((row) => [...row].map((ch) => GLYPH[ch] ?? ch).join(""));
}

const server = await createServer({
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

let mod;
try {
  mod = await server.ssrLoadModule("/src/assets/wolf/sprites.ts");
} finally {
  await server.close();
}

const { PALETTE, SPRITE_HEIGHT, SPRITE_WIDTH, WOLF_STATES, framesFor } = mod;

const legend = Object.entries(PALETTE)
  .filter(([, hex]) => hex)
  .map(([key, hex]) => `${GLYPH[key] ?? key} = ${key} ${hex}`)
  .join("\n");

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const states = wanted.length ? wanted : [...WOLF_STATES];
const unknown = states.filter((s) => !WOLF_STATES.includes(s));
if (unknown.length) {
  console.error(
    `unknown state(s): ${unknown.join(", ")}\navailable: ${WOLF_STATES.join(", ")}`,
  );
  process.exit(1);
}

console.log(`wolf ${SPRITE_WIDTH}x${SPRITE_HEIGHT}\n`);
console.log(`${legend}\n`);

for (const state of states) {
  const frames = framesFor(state);
  console.log(`${state}  (${frames.length} frames)`);
  // Side by side so a loop can be read as a sequence.
  const grids = frames.map((f) => render(f, PALETTE));
  for (let y = 0; y < SPRITE_HEIGHT; y += 1) {
    console.log(grids.map((g) => g[y]).join(" | "));
  }
  console.log();
}
