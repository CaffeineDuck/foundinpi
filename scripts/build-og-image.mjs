import { mkdirSync } from "node:fs";
import sharp from "sharp";

const width = 1200;
const height = 630;
const output = "public/og/foundinpi-v2.png";
const legacyOutput = "public/og-default.png";
const piDigits =
  "31415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";

function escape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorAt(index) {
  const a = Number(piDigits[index % piDigits.length]);
  const b = Number(piDigits[(index * 3 + 17) % piDigits.length]);
  const c = Number(piDigits[(index * 7 + 29) % piDigits.length]);
  const exact = (a + b + c + index) % 9 === 0;
  const near = (a * 2 + b + index) % 5 === 0;
  const lossy = (a + c + index) % 3 === 0;

  if (exact) return ["#70f0a4", "#123923"];
  if (near) return ["#f3cf63", "#44351a"];
  if (lossy) return ["#7fb5f2", "#182b42"];
  return ["#26352c", "#121712"];
}

function relicTiles() {
  const tile = 28;
  const gap = 3;
  const cols = 13;
  const rows = 10;
  const startX = 718;
  const startY = 178;
  const rects = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      const [fill, stroke] = colorAt(index);
      const raised =
        (x - 6) * (x - 6) + (y - 4.5) * (y - 4.5) < 17 ||
        (x > 1 && x < 5 && y > 2 && y < 8);
      const opacity = raised ? 0.95 : 0.62;
      rects.push(
        `<rect x="${startX + x * (tile + gap)}" y="${startY + y * (tile + gap)}" width="${tile}" height="${tile}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="1"/>`
      );
    }
  }

  return rects.join("");
}

function digitField() {
  const rows = [];
  for (let y = 38; y < height; y += 34) {
    const offset = Math.floor(y / 17) % piDigits.length;
    const text = piDigits.slice(offset) + piDigits.slice(0, offset);
    rows.push(
      `<text x="34" y="${y}" class="digit-row">${escape(text.repeat(8))}</text>`
    );
  }
  return rows.join("");
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10130f"/>
      <stop offset="0.55" stop-color="#171b14"/>
      <stop offset="1" stop-color="#080a08"/>
    </linearGradient>
    <radialGradient id="glow" cx="74%" cy="44%" r="48%">
      <stop offset="0" stop-color="#80f0a2" stop-opacity="0.28"/>
      <stop offset="0.42" stop-color="#4e9e78" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#4e9e78" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <style>
      .sans { font-family: Arial, Helvetica, sans-serif; }
      .mono { font-family: "Courier New", Courier, monospace; }
      .digit-row { font-family: "Courier New", Courier, monospace; font-size: 15px; fill: #e9f4df; opacity: 0.055; letter-spacing: 4px; }
      .title { font-family: Arial, Helvetica, sans-serif; font-size: 92px; font-weight: 900; fill: #f4f6ea; letter-spacing: -2px; }
      .pi { fill: #79efa4; }
      .sub { font-family: Arial, Helvetica, sans-serif; font-size: 31px; font-weight: 700; fill: #d6e4c8; }
      .small { font-family: "Courier New", Courier, monospace; font-size: 19px; font-weight: 700; fill: #8ad99d; letter-spacing: 1px; }
      .label { font-family: "Courier New", Courier, monospace; font-size: 18px; fill: #a9b99e; }
    </style>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  ${digitField()}
  <rect x="-40" y="0" width="1280" height="630" fill="url(#glow)"/>
  <path d="M0 536 C210 450 310 267 528 287 C715 304 802 112 1200 92" stroke="#7bf0a2" stroke-opacity="0.22" stroke-width="2" fill="none"/>
  <path d="M0 537 C210 451 310 268 528 288 C715 305 802 113 1200 93" stroke="#e6ffe6" stroke-opacity="0.16" stroke-width="1" fill="none"/>

  <g transform="translate(70 96)">
    <text class="small" x="0" y="0">DIG SITE I · FIRST 1,000,000 DIGITS</text>
    <text class="title" x="0" y="104">Found in <tspan class="pi">π</tspan></text>
    <text class="sub" x="4" y="160">Excavate an image from a finite</text>
    <text class="sub" x="4" y="200">indexed region of pi.</text>
    <g transform="translate(4 268)">
      <rect x="0" y="0" width="154" height="44" fill="#1f2a21" stroke="#395742"/>
      <rect x="172" y="0" width="174" height="44" fill="#1f2a21" stroke="#395742"/>
      <rect x="364" y="0" width="184" height="44" fill="#1f2a21" stroke="#395742"/>
      <text class="label" x="18" y="29">IMAGE-FIRST</text>
      <text class="label" x="190" y="29">HONEST SCORES</text>
      <text class="label" x="382" y="29">SHAREABLE RELICS</text>
    </g>
    <text class="label" x="4" y="384">No infinite-π claims. Just a declared dig site,</text>
    <text class="label" x="4" y="414">a checksum, and the best fragments we found.</text>
  </g>

  <g>
    <rect x="672" y="118" width="462" height="392" fill="#0d110d" stroke="#7bf0a2" stroke-opacity="0.72" stroke-width="2"/>
    <rect x="690" y="138" width="426" height="52" fill="#151d16" stroke="#314536"/>
    <text class="small" x="712" y="172">RELIC REPORT · π:000128..000159</text>
    <rect x="704" y="207" width="396" height="316" fill="#080b08" filter="url(#soft)" opacity="0.8"/>
    ${relicTiles()}
    <rect x="718" y="502" width="399" height="1" fill="#7bf0a2" opacity="0.5"/>
    <text class="label" x="718" y="548">32-DIGIT FRAGMENTS · STRIDE 7 · PI-NATIVE</text>
  </g>

  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#2a382c" stroke-width="18" opacity="0.8"/>
</svg>`;

mkdirSync("public/og", { recursive: true });

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(legacyOutput);

console.log(`Wrote ${output} and ${legacyOutput}`);
