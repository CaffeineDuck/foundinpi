import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
const digits = Number(positionalArgs[0] ?? 1_000_000);
const radix = args.includes("--hex") ? "hexadecimal" : "decimal";
const fragmentDigits = 32;
const stride = 7;
const indexMajorVersion = 2;
const bytesPerFragment = 18;
const fractionalDigitCount =
  radix === "hexadecimal" ? Math.ceil(digits * Math.log10(16)) : digits;

function compactDigitsName(count) {
  if (count % 1_000_000 === 0) return `${count / 1_000_000}m`;
  if (count % 1_000 === 0) return `${count / 1_000}k`;
  return String(count);
}

const version =
  radix === "hexadecimal"
    ? `pi16-${compactDigitsName(digits)}-v1`
    : `pi32-${compactDigitsName(digits)}-v${indexMajorVersion}`;
const outputPath = resolve(
  process.cwd(),
  positionalArgs[1] ?? `public/dig-sites/${version}.bin`
);
const manifestPath = outputPath.replace(/\.bin$/, ".json");
const digitsPerTerm = 14.181647462725477;
const terms = Math.ceil((fractionalDigitCount + 20) / digitsPerTerm);
const c3Over24 = 10939058860032000n;

function sqrt(value) {
  if (value < 2n) return value;

  let x0 = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  let x1 = (x0 + value / x0) >> 1n;

  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }

  return x0;
}

function binarySplit(a, b) {
  if (b - a === 1) {
    if (a === 0) {
      return {
        p: 1n,
        q: 1n,
        t: 13591409n
      };
    }

    const n = BigInt(a);
    const p = (6n * n - 5n) * (2n * n - 1n) * (6n * n - 1n);
    const q = n * n * n * c3Over24;
    let t = p * (13591409n + 545140134n * n);

    if (a % 2 === 1) t = -t;

    return { p, q, t };
  }

  const mid = Math.floor((a + b) / 2);
  const left = binarySplit(a, mid);
  const right = binarySplit(mid, b);

  return {
    p: left.p * right.p,
    q: left.q * right.q,
    t: right.q * left.t + left.p * right.t
  };
}

function piDecimalDigits(count) {
  const scaleDigits = count + 12;
  const scale = 10n ** BigInt(scaleDigits);
  const { q, t } = binarySplit(0, terms);
  const scaledPi =
    (q * 426880n * sqrt(10005n * scale * scale)) / t;
  const raw = scaledPi.toString().padStart(scaleDigits + 1, "0");

  return raw.slice(1, count + 1);
}

function piHexDigits(count) {
  const scaleDigits = count + 8;
  const scale = 16n ** BigInt(scaleDigits);
  const { q, t } = binarySplit(0, terms);
  const scaledPi =
    (q * 426880n * sqrt(10005n * scale * scale)) / t;
  const raw = scaledPi.toString(16).padStart(scaleDigits + 1, "0");

  return raw.slice(1, count + 1).toUpperCase();
}

function colorFor(fragment) {
  if (radix === "hexadecimal") {
    return [
      Number.parseInt(fragment.slice(0, 2), 16),
      Number.parseInt(fragment.slice(2, 4), 16),
      Number.parseInt(fragment.slice(4, 6), 16)
    ];
  }

  return [
    Number.parseInt(fragment.slice(0, 3), 10) % 256,
    Number.parseInt(fragment.slice(3, 6), 10) % 256,
    Number.parseInt(fragment.slice(6, 9), 10) % 256
  ];
}

function signatureFor(fragment) {
  if (radix === "hexadecimal") {
    return fragment
      .slice(6, 22)
      .split("")
      .map((digit) => Number.parseInt(digit, 16));
  }

  return fragment
    .slice(9, 25)
    .split("")
    .map((digit) => Math.round((Number.parseInt(digit, 10) / 9) * 15));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function signedByte(value) {
  return clamp(value, -127, 127) + 128;
}

function signatureStats(signature) {
  let min = 15;
  let max = 0;
  let inkSum = 0;
  let edgeX = 0;
  let edgeY = 0;
  let diagonal = 0;
  let neighborDiff = 0;
  let neighborCount = 0;
  let centerSum = 0;
  let outerSum = 0;
  let centerCount = 0;
  let outerCount = 0;

  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const value = signature[y * 4 + x] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
      inkSum += value;
      edgeX += value * (x * 2 - 3);
      edgeY += value * (y * 2 - 3);
      diagonal += value * (x - y);

      if (x < 3) {
        neighborDiff += Math.abs(value - (signature[y * 4 + x + 1] ?? 0));
        neighborCount += 1;
      }
      if (y < 3) {
        neighborDiff += Math.abs(value - (signature[(y + 1) * 4 + x] ?? 0));
        neighborCount += 1;
      }

      if (x >= 1 && x <= 2 && y >= 1 && y <= 2) {
        centerSum += value;
        centerCount += 1;
      } else {
        outerSum += value;
        outerCount += 1;
      }
    }
  }

  return {
    contrast: max - min,
    inkSum,
    edgeX: clamp(edgeX / 4, -127, 127),
    edgeY: clamp(edgeY / 4, -127, 127),
    diagonal: clamp(diagonal / 2, -127, 127),
    texture: clamp((neighborDiff / Math.max(1, neighborCount)) * 17, 0, 255),
    centerBias: clamp(
      (centerSum / Math.max(1, centerCount) -
        outerSum / Math.max(1, outerCount)) *
        8,
      -127,
      127
    )
  };
}

console.log(
  `Building pi ${radix} dig site index: ${digits.toLocaleString()} digits, ${terms.toLocaleString()} Chudnovsky terms`
);

const piDigits = radix === "hexadecimal" ? piHexDigits(digits) : piDecimalDigits(digits);
const fragments = Math.floor((piDigits.length - fragmentDigits) / stride) + 1;
const index = Buffer.alloc(fragments * bytesPerFragment);

for (let fragmentIndex = 0; fragmentIndex < fragments; fragmentIndex += 1) {
  const offset = fragmentIndex * stride;
  const fragment = piDigits.slice(offset, offset + fragmentDigits);
  const base = fragmentIndex * bytesPerFragment;
  const color = colorFor(fragment);
  index[base] = color[0];
  index[base + 1] = color[1];
  index[base + 2] = color[2];

  const signature = signatureFor(fragment);
  for (let sigIndex = 0; sigIndex < 8; sigIndex += 1) {
    index[base + 3 + sigIndex] =
      ((signature[sigIndex * 2] & 0x0f) << 4) |
      (signature[sigIndex * 2 + 1] & 0x0f);
  }

  const stats = signatureStats(signature);
  index[base + 11] = stats.contrast;
  index[base + 12] = stats.inkSum;
  index[base + 13] = signedByte(stats.edgeX);
  index[base + 14] = signedByte(stats.edgeY);
  index[base + 15] = signedByte(stats.diagonal);
  index[base + 16] = stats.texture;
  index[base + 17] = signedByte(stats.centerBias);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, index);

const checksum = createHash("sha256").update(index).digest("hex");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      version,
      source:
        radix === "hexadecimal"
          ? "pi hexadecimal expansion generated with Chudnovsky binary splitting"
          : "pi decimal expansion generated with Chudnovsky binary splitting",
      radix,
      digits,
      fragmentDigits,
      stride,
      fragments,
      bytesPerFragment,
      descriptor:
        "rgb + 4x4 luma + contrast/ink + edge/texture/center patch descriptor",
      byteLength: index.byteLength,
      sha256: checksum
    },
    null,
    2
  )}\n`
);

console.log(
  `Wrote ${outputPath} (${index.byteLength.toLocaleString()} bytes, ${fragments.toLocaleString()} fragments)`
);
console.log(`sha256 ${checksum}`);
