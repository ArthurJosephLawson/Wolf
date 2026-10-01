#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = join(root, "src-tauri", "icons");
const publicDir = join(root, "public");

const sprite = JSON.parse(
  readFileSync(join(root, "src", "assets", "wolf", "wolf-pixels.json"), "utf8"),
);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const BADGE_GROUND = hexToRgb("#1C2024");
const BADGE_RING = hexToRgb("#8C939A");

const ON_DARK = {
  K: "#F2F0E8",
  B: "#6E767C",
  C: "#4A5056",
  L: "#8C939A",
  W: "#F2F0E8",
  P: "#E27D85",
  R: "#802A30",
  T: "#7FA9C4",
};

const FIGURE = [...hexToRgb("#D8DCDE"), 255];
const FIGURE_DARK = [...hexToRgb("#1C2024"), 255];

const CROP = { row: 2, col: 4, height: 19, width: 19 };

const FACES = [
  { row: 10, col: 9, height: 2, width: 4 },
  { row: 10, col: 15, height: 2, width: 4 },
  { row: 17, col: 12, height: 1, width: 4 },
];

function inBox(box, row, col) {
  return (
    row >= box.row &&
    row < box.row + box.height &&
    col >= box.col &&
    col < box.col + box.width
  );
}

function cellColour(row, col, simplify) {
  const ch = sprite.rows[row]?.[col];
  if (!ch || ch === ".") return null;

  if (simplify) {
    return inBox(FACES, row, col) ||
      sprite.rows[row]?.[col] === "K" ||
      sprite.rows[row]?.[col] === "C"
      ? FIGURE_DARK
      : FIGURE;
  }

  const hex = ON_DARK[ch];
  return hex ? [...hexToRgb(hex), 255] : null;
}

function circleAt(size, px, py, rOuter, rInner) {
  const S = 4;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const c = size / 2;
  for (let sy = 0; sy < S; sy += 1) {
    for (let sx = 0; sx < S; sx += 1) {
      const dx = px + (sx + 0.5) / S - c;
      const dy = py + (sy + 0.5) / S - c;
      const d = Math.hypot(dx, dy);
      let colour = null;
      if (d <= rOuter) colour = d <= rInner ? BADGE_GROUND : BADGE_RING;
      if (!colour) continue;
      r += colour[0];
      g += colour[1];
      b += colour[2];
      a += 255;
    }
  }
  const n = S * S;
  const alpha = a / n;
  if (alpha === 0) return null;

  const cover = a / 255;
  return [r / cover, g / cover, b / cover, alpha];
}

function compose(size, { simplify = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const rOuter = size / 2 - 0.5;
  const rInner = rOuter - 1;

  const inner = rInner - 1;
  const scale = (inner * 2) / (CROP.width + 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const base = circleAt(size, x, y, rOuter, rInner);
      const offset = (y * size + x) * 4;
      if (!base) continue;

      const gx = Math.floor((x - size / 2) / scale + CROP.width / 2);
      const gy = Math.floor((y - size / 2) / scale + CROP.height / 2);
      const row = gy + CROP.row;
      const col = gx + CROP.col;
      const inside = gx >= 0 && gx < CROP.width && gy >= 0 && gy < CROP.height;
      const figure = inside ? cellColour(row, col, simplify) : null;

      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const colour = figure && d <= rInner - 0.5 ? figure : base;

      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = colour[3];
    }
  }
  return rgba;
}

mkdirSync(iconDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const targets = [
  { file: "32x32.png", dir: iconDir, size: 32 },
  { file: "44x44.png", dir: iconDir, size: 44 },
  { file: "128x128.png", dir: iconDir, size: 128 },
  { file: "128x128@2x.png", dir: iconDir, size: 256 },
  { file: "icon.png", dir: iconDir, size: 512 },
  { file: "Square150x150Logo.png", dir: iconDir, size: 150 },
  { file: "Square44x44Logo.png", dir: iconDir, size: 44 },
  { file: "StoreLogo.png", dir: iconDir, size: 50 },

  { file: "tray.png", dir: iconDir, size: 32 },
  { file: "tray-22.png", dir: iconDir, size: 22 },
  { file: "tray-16.png", dir: iconDir, size: 16 },

  { file: "favicon-16.png", dir: publicDir, size: 16 },
  { file: "favicon-32.png", dir: publicDir, size: 32 },
  { file: "favicon-64.png", dir: publicDir, size: 64 },
];

for (const { file, dir, size } of targets) {
  const rgba = compose(size, { simplify: size <= 32 });
  const label = dir === iconDir ? "src-tauri/icons" : "public";
  writeFileSync(join(dir, file), encodePng(size, size, rgba));
  console.log(
    `wrote ${label}/${file} (${size}x${size}${size <= 32 ? ", simplified" : ""})`,
  );
}

console.log(`\n${targets.length} images generated from the wolf sprite`);
