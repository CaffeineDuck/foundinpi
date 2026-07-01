import {
  DIG_SITE_DIGITS,
  DIG_SITE_FRAGMENT_DIGITS,
  DIG_SITE_FRAGMENT_STRIDE,
  DIG_SITE_INDEX_URL
} from "./constants";

export type PiFragment = {
  offset: number;
  rgb: [number, number, number];
  signature: number[];
  contrast: number;
  ink: number;
  raw: string;
};

const PACKED_FRAGMENT_BYTES = 11;
const DEV_FALLBACK_DIGITS = 6144;

let cachedDigits = "";
let cachedCatalogue: PiFragment[] | null = null;

function arctan(invX: bigint, scale: bigint) {
  const invX2 = invX * invX;
  let term = scale / invX;
  let sum = term;
  let denominator = 1n;
  let sign = -1n;

  while (term > 0n) {
    term /= invX2;
    denominator += 2n;
    const delta = term / denominator;
    if (delta === 0n) break;
    sum += sign * delta;
    sign *= -1n;
  }

  return sum;
}

function getPiDigits(digits = DEV_FALLBACK_DIGITS) {
  if (cachedDigits.length >= digits) {
    return cachedDigits.slice(0, digits);
  }

  const guardDigits = 12;
  const scale = 10n ** BigInt(digits + guardDigits);
  const piScaled = 16n * arctan(5n, scale) - 4n * arctan(239n, scale);
  const raw = piScaled.toString().padStart(digits + guardDigits + 1, "0");
  cachedDigits = raw.slice(1, digits + 1);

  return cachedDigits.slice(0, digits);
}

function statsFor(signature: number[]) {
  const min = Math.min(...signature);
  const max = Math.max(...signature);
  const ink =
    signature.reduce((total, value) => total + value, 0) / signature.length;

  return {
    contrast: max - min,
    ink
  };
}

function decodePackedCatalogue(bytes: Uint8Array) {
  if (bytes.byteLength % PACKED_FRAGMENT_BYTES !== 0) {
    throw new Error("Dig site index is corrupt");
  }

  const catalogue: PiFragment[] = [];
  const total = bytes.byteLength / PACKED_FRAGMENT_BYTES;

  for (let index = 0; index < total; index += 1) {
    const base = index * PACKED_FRAGMENT_BYTES;
    const signature: number[] = [];

    for (let packedIndex = 0; packedIndex < 8; packedIndex += 1) {
      const packed = bytes[base + 3 + packedIndex];
      signature.push((packed >> 4) & 0x0f, packed & 0x0f);
    }

    catalogue.push({
      offset: index * DIG_SITE_FRAGMENT_STRIDE,
      rgb: [bytes[base], bytes[base + 1], bytes[base + 2]],
      signature,
      ...statsFor(signature),
      raw: ""
    });
  }

  return catalogue;
}

function signatureFor(raw: string) {
  return raw
    .slice(9, 25)
    .split("")
    .map((digit) => Math.round((Number.parseInt(digit, 10) / 9) * 15));
}

function buildFallbackCatalogue() {
  const digits = getPiDigits(DEV_FALLBACK_DIGITS);
  const catalogue: PiFragment[] = [];

  for (
    let offset = 0;
    offset + DIG_SITE_FRAGMENT_DIGITS <= digits.length;
    offset += DIG_SITE_FRAGMENT_STRIDE
  ) {
    const raw = digits.slice(offset, offset + DIG_SITE_FRAGMENT_DIGITS);
    const signature = signatureFor(raw);

    catalogue.push({
      offset,
      rgb: [
        Number.parseInt(raw.slice(0, 3), 10) % 256,
        Number.parseInt(raw.slice(3, 6), 10) % 256,
        Number.parseInt(raw.slice(6, 9), 10) % 256
      ],
      signature,
      ...statsFor(signature),
      raw
    });
  }

  return catalogue;
}

export async function getPiCatalogue() {
  if (cachedCatalogue) return cachedCatalogue;

  try {
    const response = await fetch(DIG_SITE_INDEX_URL);
    if (!response.ok) {
      throw new Error(`Unable to load dig site index: ${response.status}`);
    }

    cachedCatalogue = decodePackedCatalogue(
      new Uint8Array(await response.arrayBuffer())
    );
  } catch {
    cachedCatalogue = buildFallbackCatalogue();
  }

  return cachedCatalogue;
}

export function getDigSiteStats(indexedFragments: number) {
  return {
    digits: DIG_SITE_DIGITS,
    fragments: indexedFragments
  };
}
