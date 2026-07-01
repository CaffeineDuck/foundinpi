import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const digits = Number(process.argv[2] ?? 10_000_000);
const fragmentDigits = 32;
const stride = 7;

function compactDigitsName(count) {
  if (count % 1_000_000 === 0) return `${count / 1_000_000}m`;
  if (count % 1_000 === 0) return `${count / 1_000}k`;
  return String(count);
}

const version = `pi32-${compactDigitsName(digits)}-v1`;
const outputPath = resolve(
  process.cwd(),
  process.argv[3] ?? `public/dig-sites/${version}.bin`
);
const manifestPath = outputPath.replace(/\.bin$/, ".json");
const digitsPerTerm = 14.181647462725477;
const terms = Math.ceil((digits + 20) / digitsPerTerm);
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

function signatureFor(fragment) {
  return fragment
    .slice(9, 25)
    .split("")
    .map((digit) => Math.round((Number.parseInt(digit, 10) / 9) * 15));
}

console.log(
  `Building pi dig site index: ${digits.toLocaleString()} digits, ${terms.toLocaleString()} Chudnovsky terms`
);

const decimalDigits = piDecimalDigits(digits);
const fragments = Math.floor((decimalDigits.length - fragmentDigits) / stride) + 1;
const index = Buffer.alloc(fragments * 11);

for (let fragmentIndex = 0; fragmentIndex < fragments; fragmentIndex += 1) {
  const offset = fragmentIndex * stride;
  const fragment = decimalDigits.slice(offset, offset + fragmentDigits);
  const base = fragmentIndex * 11;
  index[base] = Number.parseInt(fragment.slice(0, 3), 10) % 256;
  index[base + 1] = Number.parseInt(fragment.slice(3, 6), 10) % 256;
  index[base + 2] = Number.parseInt(fragment.slice(6, 9), 10) % 256;

  const signature = signatureFor(fragment);
  for (let sigIndex = 0; sigIndex < 8; sigIndex += 1) {
    index[base + 3 + sigIndex] =
      ((signature[sigIndex * 2] & 0x0f) << 4) |
      (signature[sigIndex * 2 + 1] & 0x0f);
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, index);

const checksum = createHash("sha256").update(index).digest("hex");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      version,
      source: "pi decimal expansion generated with Chudnovsky binary splitting",
      digits,
      fragmentDigits,
      stride,
      fragments,
      bytesPerFragment: 11,
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
