/**
 * The wolf sprite.
 *
 * One hand-authored 28x28 sprite (see `wolf-pixels.json`) is the single source
 * of truth for the application's artwork. Every state and animation frame is
 * produced from it by deterministic pixel operations — no image files, no
 * runtime canvas, no third-party art.
 *
 * The operations are pure functions over a character matrix, which keeps them
 * trivially testable and cheap to run: a frame is a few dozen small array
 * copies, not a re-render.
 *
 * Row and column constants below refer to features of the base sprite and are
 * verified by `scripts/check-sprite.mjs` and `sprites.test.ts`.
 */

import spriteData from "./wolf-pixels.json";

type Pixel = string;

/** A sprite frame: one string per row, all of equal length. */
export type Matrix = readonly string[];

/**
 * A frame under construction.
 *
 * Transforms have to write whole rows back, so they hand out a mutable copy
 * rather than the readonly `Matrix` callers pass in. A `Rows` is still a valid
 * `Matrix`, so it can be returned or stored wherever one is expected.
 */
type Rows = string[];

interface WolfSpriteData {
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  rows: string[];
  authoring: string;
}

const data = spriteData as unknown as WolfSpriteData;

export const SPRITE_WIDTH = data.width;
export const SPRITE_HEIGHT = data.height;
export const PALETTE: Readonly<Record<string, string | null>> = data.palette;
export const BASE: Matrix = data.rows;

/** Colour keys the overlays rely on; every one is opaque in `wolf-pixels.json`. */
type ColorName =
  | "outline"
  | "fur"
  | "furLight"
  | "light"
  | "white"
  | "pink"
  | "cavity"
  | "tear";

/**
 * Named pixel colours used by the overlays. `requireColor` fails loudly at
 * module load if the sprite data ever drops a key, rather than silently
 * painting transparent pixels.
 */
function requireColor(key: string): string {
  const value = PALETTE[key];
  if (value == null) {
    throw new Error(
      `wolf-pixels.json is missing an opaque colour for "${key}"`,
    );
  }
  return value;
}

export const COLOR: Readonly<Record<ColorName, string>> = {
  outline: requireColor("K"),
  fur: requireColor("B"),
  furLight: requireColor("C"),
  light: requireColor("L"),
  white: requireColor("W"),
  pink: requireColor("P"),
  cavity: requireColor("R"),
  tear: requireColor("T"),
};

/* ------------------------------------------------------------ primitives --- */

function clone(matrix: Matrix): Rows {
  return matrix.slice();
}

function assertSameShape(matrix: Matrix): void {
  const width = matrix[0]?.length ?? 0;
  for (let i = 1; i < matrix.length; i += 1) {
    if (matrix[i]!.length !== width) {
      throw new Error(
        `sprite row ${i} is ${matrix[i]!.length} wide, expected ${width}`,
      );
    }
  }
}

function rowWidth(matrix: Matrix): number {
  return matrix[0]?.length ?? 0;
}

/** Replace every occurrence of one pixel character with another. */
export function swap(matrix: Matrix, from: Pixel, to: Pixel): Matrix {
  return matrix.map((row) => row.split(from).join(to));
}

/**
 * Write `text` into `matrix` at (row, col), clipped to the canvas.
 *
 * Unlike {@link overlay} this writes `.` as a real erased pixel, so `text` must
 * describe the full row segment including the background it should restore.
 */
export function stamp(
  matrix: Matrix,
  row: number,
  col: number,
  text: string,
): Rows {
  const out = clone(matrix);
  const width = rowWidth(out);
  if (row < 0 || row >= out.length) return out;
  for (let i = 0; i < text.length; i += 1) {
    const x = col + i;
    if (x < 0 || x >= width) continue;
    const next = out[row]!.split("");
    next[x] = text[i]!;
    out[row] = next.join("");
  }
  return out;
}

/** Shift rows `[fromRow, toRow]` horizontally. Positive `dx` moves right. */
export function shiftRows(
  matrix: Matrix,
  fromRow: number,
  toRow: number,
  dx: number,
): Matrix {
  const out = clone(matrix);
  const width = rowWidth(out);
  for (
    let y = Math.max(0, fromRow);
    y <= Math.min(out.length - 1, toRow);
    y += 1
  ) {
    const src = out[y]!.split("");
    const chars = new Array<string>(width).fill(".");
    for (let x = 0; x < width; x += 1) {
      const target = x + dx;
      if (target >= 0 && target < width) chars[target] = src[x]!;
    }
    out[y] = chars.join("");
  }
  return out;
}

/** Shift a block of rows vertically, blanking both source and destination. */
function shiftRowsVertical(
  matrix: Matrix,
  fromRow: number,
  toRow: number,
  dy: number,
): Rows {
  const out = clone(matrix);
  const width = rowWidth(out);
  const block = out.slice(fromRow, toRow + 1);
  for (let y = fromRow; y <= toRow; y += 1) out[y] = ".".repeat(width);
  block.forEach((row, i) => {
    const y = fromRow + i + dy;
    if (y >= 0 && y < out.length) out[y] = row;
  });
  return out;
}

/**
 * Shift the given rows and columns of a rectangular region sideways, clipping
 * whatever falls outside the region. Used to perk or flatten the ears.
 */
function shiftRegionH(
  matrix: Matrix,
  fromRow: number,
  toRow: number,
  fromCol: number,
  toCol: number,
  dx: number,
): Rows {
  const out = clone(matrix);
  const width = rowWidth(out);
  for (let y = fromRow; y <= toRow; y += 1) {
    if (y < 0 || y >= out.length) continue;
    const src = out[y]!.split("");
    const chars = src.slice();
    for (let x = fromCol; x <= toCol; x += 1) {
      const target = x + dx;
      chars[x] = target >= 0 && target < width ? src[target]! : ".";
    }
    out[y] = chars.join("");
  }
  return out;
}

/** Shift the whole sprite vertically. Positive `dy` moves down. */
export function shiftVertical(matrix: Matrix, dy: number): Matrix {
  if (dy === 0) return clone(matrix);
  const out = new Array<string>(matrix.length).fill(
    ".".repeat(rowWidth(matrix)),
  );
  for (let y = 0; y < matrix.length; y += 1) {
    const target = y + dy;
    if (target < 0 || target >= matrix.length) continue;
    out[target] = matrix[y]!;
  }
  return out;
}

/**
 * Nearest-neighbour vertical resize of a row band, keeping the band centred on
 * `anchorRow`.
 */
export function scaleBand(
  matrix: Matrix,
  topRow: number,
  bottomRow: number,
  factor: number,
  anchorRow: number,
): Matrix {
  const out = clone(matrix);
  const srcTop = Math.max(0, topRow);
  const srcBottom = Math.min(matrix.length - 1, bottomRow);
  const height = srcBottom - srcTop + 1;
  if (height <= 0 || factor <= 0) return out;

  for (let y = srcTop; y <= srcBottom; y += 1) {
    const fromAnchor = y - anchorRow;
    const sourceY = Math.round(anchorRow + fromAnchor * factor);
    const clamped = Math.min(matrix.length - 1, Math.max(0, sourceY));
    out[y] = matrix[clamped]!;
  }
  return out;
}

/** Overlap `overlay` onto `base` at (row, col); non-`.` overlay pixels win. */
export function overlay(
  base: Matrix,
  overlayMatrix: Matrix,
  row: number,
  col: number,
): Rows {
  const out = clone(base);
  for (let y = 0; y < overlayMatrix.length; y += 1) {
    const targetRow = row + y;
    if (targetRow < 0 || targetRow >= out.length) continue;
    const chars = out[targetRow]!.split("");
    for (let x = 0; x < overlayMatrix[y]!.length; x += 1) {
      const ch = overlayMatrix[y]![x]!;
      if (ch === ".") continue;
      const targetCol = col + x;
      if (targetCol < 0 || targetCol >= chars.length) continue;
      chars[targetCol] = ch;
    }
    out[targetRow] = chars.join("");
  }
  return out;
}

function mirrorRow(text: string): string {
  return text.split("").reverse().join("");
}

/* ------------------------------------------------------------ base anatomy -- */

/** Ears: left occupies columns 8-11, right 16-19, including the row-2 tips. */
const EAR_TOP = 2;
const EAR_BOTTOM = 4;
const EAR_LEFT_COL = 8;
const EAR_RIGHT_COL = 16;

const HEAD_TOP = 5;
const HEAD_BOTTOM = 18;

/** Eyes sit in a 3-row band; each eye is 4 columns wide. */
const EYE_ROW = 10;
const EYE_LEFT_COL = 9;
const EYE_RIGHT_COL = 15;

/** Nose bridge and mouth. */
const SNOUT_TOP = 13;
const SNOUT_BOTTOM = 18;
const MOUTH_ROW = 17;
const MOUTH_COL = 12;

/** Cream chest patch, as [row, firstColumn, lastColumn]. */
const CHEST: ReadonlyArray<readonly [number, number, number]> = [
  [22, 10, 17],
  [23, 11, 16],
  [24, 12, 15],
  [25, 13, 14],
];

const JAW = BASE[HEAD_BOTTOM]!;

/* -------------------------------------------------------------- eye shapes -- */

/**
 * A 3x4 patch drawn over one eye. `.` is transparent, so the patch spells out
 * only the pixels that change. The right eye is the mirror of the left.
 */
type EyePatch = readonly string[];

const EYE_HAPPY: EyePatch = [".KK.", "KBBK", "BBBB"];
const EYE_BLINK: EyePatch = ["BBBB", "KKKK", "BBBB"];
// Two rows only: a third row would collide with the forehead stripe.
const EYE_ARC: EyePatch = ["KBBK", "BKKB"];
// A 2x2 pupil. The rest of the eye box is spelled out as fur, because the
// resting caret leaves pixels behind at the corners of the box.
const EYE_DOT: EyePatch = ["BKKB", "BKKB", "BBBB"];
const EYE_TIGHT: EyePatch = ["KKKK", "BBBB", "BBBB"];
const EYE_FLAT: EyePatch = ["KKKK", "KKKK", "BBBB"];

function applyEyes(matrix: Matrix, patch: EyePatch): Matrix {
  const mirrored = patch.map(mirrorRow);
  let out = overlay(matrix, patch, EYE_ROW, EYE_LEFT_COL);
  out = overlay(out, mirrored, EYE_ROW, EYE_RIGHT_COL);
  return out;
}

/* -------------------------------------------------------------- overlays --- */

const SPARKLE: Matrix = [".W.", "WWW", ".W."];
/** A 3x3 heart that floats up and shrinks as it fades. */
const HEART: Matrix = ["P.P", "PPP", ".P."];
/** A single heart pixel, standing in for the faded tail of the heart. */
const HEART_TAIL: Matrix = ["P"];
const BREATH: Matrix = [".W.", "W..", "..W"];
/** The 3x3 attention ripple used while listening. */
const SOUND: Matrix = [".L", "LL", "L."];

/* ---------------------------------------------------------------- states --- */

/** Every visual state the wolf can express. */
export type WolfState =
  | "idle"
  | "blink"
  | "speaking"
  | "listening"
  | "happy"
  | "winking"
  | "huffing"
  | "puffing"
  | "sad";

export const WOLF_STATES: readonly WolfState[] = [
  "idle",
  "blink",
  "speaking",
  "listening",
  "happy",
  "winking",
  "huffing",
  "puffing",
  "sad",
];

/** Human labels, used for the accessible name of the companion. */
export const WOLF_STATE_LABELS: Record<WolfState, string> = {
  idle: "Wolf is idling",
  blink: "Wolf blinks",
  speaking: "Wolf is speaking",
  listening: "Wolf is listening",
  happy: "Wolf is happy",
  winking: "Wolf winks",
  huffing: "Wolf is huffing",
  puffing: "Wolf is puffing",
  sad: "Wolf is sad",
};

/** Move the head, then restore the jaw so the neck stays connected. */
function raiseHead(matrix: Matrix, by: number): Matrix {
  if (by === 0) return clone(matrix);
  const out = shiftRowsVertical(matrix, HEAD_TOP - 3, HEAD_BOTTOM, -by);
  for (let i = 0; i < by; i += 1) {
    out[HEAD_BOTTOM - i] = JAW;
  }
  return out;
}

/**
 * Move the head block only, leaving the ear band untouched.
 *
 * The two must be separated: lifting the ears and lifting the head by the same
 * amount is what keeps a perking ear attached to the skull.
 */
function raiseHeadOnly(matrix: Matrix, by: number): Matrix {
  if (by === 0) return clone(matrix);
  const out = shiftRowsVertical(matrix, HEAD_TOP, HEAD_BOTTOM, -by);
  for (let i = 0; i < by; i += 1) {
    out[HEAD_BOTTOM - i] = JAW;
  }
  return out;
}

/** Drop the head, blanking the rows it vacates above the ears. */
function lowerHead(matrix: Matrix, by: number): Matrix {
  if (by === 0) return clone(matrix);
  const out = shiftRowsVertical(matrix, HEAD_TOP - 3, HEAD_BOTTOM, by);
  for (let i = 0; i < by; i += 1) {
    out[HEAD_TOP - 3 + i] = ".".repeat(SPRITE_WIDTH);
  }
  return out;
}

/** Move the muzzle up under the eyes, restoring the jaw so the neck connects. */
function raiseSnout(matrix: Matrix, by: number): Matrix {
  if (by === 0) return clone(matrix);
  const out = shiftRowsVertical(matrix, SNOUT_TOP, SNOUT_BOTTOM, -by);
  for (let i = 0; i < by; i += 1) {
    out[SNOUT_BOTTOM - i] = BASE[SNOUT_BOTTOM]!;
  }
  return out;
}

/** Redraw the cream chest patch, optionally moved and widened. */
function drawChest(matrix: Matrix, dy = 0, grow = 0): Matrix {
  const out = clone(matrix);
  for (const [row, start, end] of CHEST) {
    const y = row + dy;
    if (y < 0 || y >= out.length) continue;
    const chars = out[y]!.split("");
    for (let x = start - grow; x <= end + grow; x += 1) {
      if (x < 0 || x >= chars.length) continue;
      chars[x] = "W";
    }
    out[y] = chars.join("");
  }
  return out;
}

/**
 * Move an ear outward from the skull by `amount` columns.
 *
 * `amount` is positive for "outward" regardless of side. The region has to
 * include the extra destination column, which sits outside the head outline
 * and is empty on the ear rows, so nothing is overwritten.
 */
function perkEar(
  matrix: Matrix,
  side: "left" | "right",
  amount: number,
): Matrix {
  if (amount === 0) return clone(matrix);
  // shiftRegionH copies each pixel from its neighbour, so outward is a positive
  // shift on the left and a negative one on the right.
  const dx = side === "left" ? amount : -amount;
  const from = side === "left" ? EAR_LEFT_COL - amount : EAR_RIGHT_COL;
  const to = side === "left" ? EAR_LEFT_COL + 3 : EAR_RIGHT_COL + 3 + amount;
  return shiftRegionH(matrix, EAR_TOP, EAR_BOTTOM, from, to, dx);
}

/** Move a single ear vertically, clipping at the canvas edge. */
function moveEar(matrix: Matrix, side: "left" | "right", dy: number): Matrix {
  if (dy === 0) return clone(matrix);
  const col = side === "left" ? EAR_LEFT_COL : EAR_RIGHT_COL;
  const out = clone(matrix);
  const block = out
    .slice(EAR_TOP, EAR_BOTTOM + 1)
    .map((row) => row.slice(col, col + 4));
  for (let y = EAR_TOP; y <= EAR_BOTTOM; y += 1) {
    const chars = out[y]!.split("");
    for (let x = col; x <= col + 3; x += 1) chars[x] = ".";
    out[y] = chars.join("");
  }
  block.forEach((row, i) => {
    const y = EAR_TOP + i + dy;
    if (y < 0 || y >= out.length) return;
    const chars = out[y]!.split("");
    // Clear the destination as well, or the skull shows through the ear.
    for (let x = col; x <= col + 3; x += 1) chars[x] = ".";
    for (let k = 0; k < 4; k += 1) {
      if (row[k] === ".") continue;
      chars[col + k] = row[k]!;
    }
    out[y] = chars.join("");
  });
  return out;
}

/**
 * Move the whole ear band vertically, clipping at the canvas edge.
 *
 * Moving both ears as one block keeps them symmetric, which moving them
 * individually cannot guarantee.
 */
function liftEars(matrix: Matrix, dy: number): Matrix {
  if (dy === 0) return clone(matrix);
  const out = clone(matrix);
  const block = out.slice(EAR_TOP, EAR_BOTTOM + 1);
  for (let y = EAR_TOP; y <= EAR_BOTTOM; y += 1) {
    const chars = out[y]!.split("");
    for (let x = EAR_LEFT_COL; x <= EAR_LEFT_COL + 3; x += 1) chars[x] = ".";
    for (let x = EAR_RIGHT_COL; x <= EAR_RIGHT_COL + 3; x += 1) chars[x] = ".";
    out[y] = chars.join("");
  }
  block.forEach((row, i) => {
    const y = EAR_TOP + i + dy;
    if (y < 0 || y >= out.length) return;
    const chars = out[y]!.split("");
    // Clear the ear columns at the destination too. When the ear drops onto the
    // skull, the head outline underneath would otherwise show through it.
    for (let x = EAR_LEFT_COL; x <= EAR_LEFT_COL + 3; x += 1) chars[x] = ".";
    for (let x = EAR_RIGHT_COL; x <= EAR_RIGHT_COL + 3; x += 1) chars[x] = ".";
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === ".") continue;
      const inLeft = x >= EAR_LEFT_COL && x <= EAR_LEFT_COL + 3;
      const inRight = x >= EAR_RIGHT_COL && x <= EAR_RIGHT_COL + 3;
      if (!inLeft && !inRight) continue;
      chars[x] = row[x]!;
    }
    out[y] = chars.join("");
  });
  return out;
}

/**
 * Widen the muzzle outward by `by` columns on each side, keeping it symmetric.
 *
 * The new outline goes `by` columns further out and the old outline becomes
 * fur, so the muzzle grows rather than acquiring a second outline.
 */
function widenMuzzle(matrix: Matrix, by: number): Matrix {
  if (by === 0) return clone(matrix);
  const out = clone(matrix);
  const leftEdge = 8;
  const rightEdge = SPRITE_WIDTH - 1 - leftEdge;
  for (let y = SNOUT_TOP; y <= SNOUT_BOTTOM; y += 1) {
    const chars = out[y]!.split("");
    for (let x = leftEdge - by; x < leftEdge; x += 1) {
      chars[x] = x === leftEdge - by ? "K" : "B";
    }
    for (let x = rightEdge + 1; x <= rightEdge + by; x += 1) {
      chars[x] = x === rightEdge + by ? "K" : "B";
    }
    chars[leftEdge] = "B";
    chars[rightEdge] = "B";
    out[y] = chars.join("");
  }
  return out;
}

/** The closed, smiling mouth used at rest. */
const MOUTH_CLOSED = "KKKK";

/** Assert at import time that the resting mouth is where the poses expect. */
const _mouthGuard = BASE[MOUTH_ROW]!.slice(MOUTH_COL, MOUTH_COL + 4);
if (_mouthGuard !== MOUTH_CLOSED) {
  throw new Error(
    `wolf-pixels.json mouth moved: expected "${MOUTH_CLOSED}" at row ${MOUTH_ROW} cols ${MOUTH_COL}-${MOUTH_COL + 3}, found "${_mouthGuard}"`,
  );
}

/**
 * Build the frame list for a state. Frame order is the animation loop; the
 * caller controls the cadence, so there is no timer inside this module.
 *
 * Every frame is the full 28x28 canvas, so states can cross-fade without the
 * renderer having to align two different geometries.
 */
export function framesFor(state: WolfState): Matrix[] {
  switch (state) {
    /* Idle: a slow breath. Head and ears rise, the chest swells, then settles. */
    case "idle": {
      const rest = BASE;
      const up = raiseHead(rest, 1);
      // Widened in place rather than moved: lifting the patch off the chest
      // reads as a shrug and loses the taper entirely.
      const breath = drawChest(up, 0, 1);
      return [rest, up, breath, rest];
    }

    /* Blink: flat line, then a downward arc, then back open. */
    case "blink": {
      return [
        applyEyes(BASE, EYE_BLINK),
        applyEyes(BASE, EYE_ARC),
        applyEyes(BASE, EYE_HAPPY),
      ];
    }

    /* Speaking: a closed line, a hint of tongue, a wide 2x2 mouth, a grin. */
    case "speaking": {
      const eyes = applyEyes(BASE, EYE_HAPPY);
      const slight = stamp(
        stamp(eyes, MOUTH_ROW, MOUTH_COL, "RRRR"),
        MOUTH_ROW + 1,
        MOUTH_COL,
        "WPPW",
      );
      const wide = stamp(
        stamp(eyes, MOUTH_ROW - 1, MOUTH_COL, "WRRW"),
        MOUTH_ROW,
        MOUTH_COL,
        "KPPK",
      );
      const grin = stamp(eyes, MOUTH_ROW, MOUTH_COL, "KWWK");
      return [eyes, slight, wide, grin];
    }

    /* Listening: one ear cocks, the other twitches, then attention ripples. */
    case "listening": {
      const dots = applyEyes(BASE, EYE_DOT);
      const cocked = perkEar(dots, "left", 1);
      const twitch = moveEar(cocked, "right", 1);
      const tilt = shiftRegionH(
        dots,
        HEAD_TOP - 3,
        HEAD_BOTTOM,
        0,
        SPRITE_WIDTH - 1,
        -1,
      );
      return [cocked, twitch, overlay(tilt, SOUND, 3, 21)];
    }

    /* Happy: ears perk 2px, tongue lolls, cheeks blush, sparkles pop. */
    case "happy": {
      // Blush on both cheeks; the right side is the mirror of the left.
      const blusher = stamp(
        stamp(BASE, MOUTH_ROW - 3, 9, "PP"),
        MOUTH_ROW - 3,
        17,
        "PP",
      );
      // Cavity at row 16, tongue at 17-18: all inside the head block so the
      // whole face moves together when the head lifts.
      const cavity = stamp(blusher, MOUTH_ROW - 1, MOUTH_COL, "RRRR");
      const tongue = stamp(
        stamp(cavity, MOUTH_ROW, 13, "PP"),
        MOUTH_ROW + 1,
        13,
        "PP",
      );
      const tight = applyEyes(tongue, EYE_TIGHT);
      // Ears lift 2px and the head 2px, so the ear base stays on the skull.
      const perked = raiseHeadOnly(liftEars(tight, -2), 2);
      const sparkled = overlay(
        overlay(perked, SPARKLE, 0, 2),
        SPARKLE,
        1,
        SPRITE_WIDTH - 5,
      );
      return [sparkled, perked, overlay(perked, SPARKLE, 2, 4), tight];
    }

    /* Winking: one eye squeezes shut while a heart floats up and fades. */
    case "winking": {
      const wink = applyEyes(BASE, EYE_BLINK);
      const squeeze = applyEyes(BASE, EYE_ARC);
      // The ear dips a pixel. Perking it outward as well would push it into
      // column 7, which is already the edge of the head.
      const dip = (m: Matrix) => liftEars(m, 1);
      return [
        overlay(dip(wink), HEART, 5, 21),
        overlay(dip(squeeze), HEART, 3, 21),
        overlay(applyEyes(BASE, EYE_HAPPY), HEART_TAIL, 1, 22),
      ];
    }

    /* Huffing: the nose lifts, the brows pinch, steam puffs from the nostrils. */
    case "huffing": {
      const snout = raiseSnout(BASE, 1);
      // Brows angled inward toward the nose bridge.
      const browed = stamp(
        stamp(snout, EYE_ROW - 1, 12, "K"),
        EYE_ROW - 1,
        15,
        "K",
      );
      const flat = perkEar(perkEar(browed, "left", 1), "right", 1);
      // Steam leaves both nostrils, drifting up and outward.
      const steam = (row: number, left: number) =>
        overlay(
          overlay(flat, BREATH, row, left),
          BREATH,
          row,
          SPRITE_WIDTH - 3 - left,
        );
      return [flat, steam(EYE_ROW, 10), steam(EYE_ROW - 1, 11)];
    }

    /* Puffing: cheeks balloon, the head sinks, a breath cloud grows. */
    case "puffing": {
      const cheeks = widenMuzzle(applyEyes(BASE, EYE_FLAT), 2);
      const sunk = lowerHead(cheeks, 2);
      return [
        overlay(sunk, BREATH, 14, 21),
        overlay(sunk, SPARKLE, 13, 21),
        overlay(sunk, SPARKLE, 12, 21),
      ];
    }

    /* Sad: ears droop, the mouth turns down, a single tear slides down. */
    case "sad": {
      const drooped = liftEars(applyEyes(BASE, EYE_ARC), 2);
      const frown = stamp(
        stamp(drooped, MOUTH_ROW, MOUTH_COL, "KBBK"),
        MOUTH_ROW + 1,
        MOUTH_COL,
        "BKKB",
      );
      const tearAt = (y: number) => stamp(frown, y, 16, "T");
      return [tearAt(12), tearAt(13), tearAt(14), tearAt(15)];
    }
  }
}

/** Frames for a state, looping. Blink is injected by the caller, not baked in. */
export function loopFor(state: WolfState): Matrix[] {
  return framesFor(state);
}

/* ---------------------------------------------------------------- render --- */

interface RenderedRun {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

/**
 * Convert a frame into horizontal runs of identical colour.
 *
 * A 28x28 sprite collapses to roughly 40 rectangles instead of 784, which keeps
 * the DOM small enough that animation costs nothing.
 */
export function toRuns(matrix: Matrix): RenderedRun[] {
  assertSameShape(matrix);
  const runs: RenderedRun[] = [];
  matrix.forEach((row, y) => {
    let start = 0;
    while (start < row.length) {
      const ch = row[start]!;
      let end = start + 1;
      while (end < row.length && row[end] === ch) end += 1;
      const fill = PALETTE[ch];
      if (fill) runs.push({ x: start, y, width: end - start, height: 1, fill });
      start = end;
    }
  });
  return runs;
}

/** Sanity check used by tests and dev tooling. */
export function validateSprite(): string[] {
  const problems: string[] = [];
  if (BASE.length !== SPRITE_HEIGHT) {
    problems.push(`expected ${SPRITE_HEIGHT} rows, found ${BASE.length}`);
  }
  BASE.forEach((row, i) => {
    if (row.length !== SPRITE_WIDTH) {
      problems.push(`row ${i} is ${row.length} wide, expected ${SPRITE_WIDTH}`);
    }
    for (const ch of row) {
      if (!(ch in PALETTE))
        problems.push(`row ${i} uses unknown pixel "${ch}"`);
    }
  });
  for (const state of WOLF_STATES) {
    framesFor(state).forEach((frame, f) => {
      if (frame.length !== SPRITE_HEIGHT) {
        problems.push(`${state} frame ${f} has ${frame.length} rows`);
      }
      frame.forEach((row, i) => {
        if (row.length !== SPRITE_WIDTH) {
          problems.push(`${state} frame ${f} row ${i} is ${row.length} wide`);
        }
        for (const ch of row) {
          if (!(ch in PALETTE))
            problems.push(
              `${state} frame ${f} row ${i} uses unknown pixel "${ch}"`,
            );
        }
      });
    });
  }
  return problems;
}
