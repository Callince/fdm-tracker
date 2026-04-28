/**
 * One-off: generate app + tray icons from src/renderer/public/4d-logo.webp.
 * Runs after a fresh `npm install --no-save sharp`.
 *
 *   node scripts/gen-icons.mjs
 */
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = "src/renderer/public/4d-logo.webp";
const OUT = "resources";
await fs.mkdir(OUT, { recursive: true });

const BRAND = { r: 183, g: 62, b: 19 }; // #b73e13

async function squareOnBrand(size, contentScale = 0.82) {
  const pad = Math.round((size * (1 - contentScale)) / 2);
  const inner = size - pad * 2;
  const logo = await sharp(SRC)
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toBuffer();
}

// 512×512 app icon — electron-builder auto-derives Windows .ico and macOS .icns
await fs.writeFile(path.join(OUT, "icon.png"), await squareOnBrand(512, 0.8));
// Tray, 16×16 + HiDPI 32×32
await fs.writeFile(path.join(OUT, "tray-icon.png"), await squareOnBrand(16, 0.88));
await fs.writeFile(path.join(OUT, "tray-icon@2x.png"), await squareOnBrand(32, 0.88));

for (const f of ["icon.png", "tray-icon.png", "tray-icon@2x.png"]) {
  const s = await fs.stat(path.join(OUT, f));
  console.log(`  ${f.padEnd(22)} ${s.size} bytes`);
}
