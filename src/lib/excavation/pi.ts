import {
  DEFAULT_DIG_SITE_ID,
  type DigSite,
  type DigSiteId,
  DIG_SITE_FRAGMENT_DIGITS,
  DIG_SITE_FRAGMENT_STRIDE,
  DIG_SITE_INDEX_BYTES_V2,
  getDigSite
} from "./constants";

export type PiCatalogue = {
  bytes: Uint8Array;
  fragments: number;
  bytesPerFragment: number;
  digSite: DigSite;
  rawDigits?: string;
};

export const PACKED_FRAGMENT_BYTES = DIG_SITE_INDEX_BYTES_V2;

const DEV_FALLBACK_DIGITS = 6144;

let cachedDigits = "";
const cachedCatalogues = new Map<DigSiteId, PiCatalogue>();

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

function signatureFor(raw: string) {
  return raw
    .slice(9, 25)
    .split("")
    .map((digit) => Math.round((Number.parseInt(digit, 10) / 9) * 15));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function signedByte(value: number) {
  return clamp(value, -127, 127) + 128;
}

function signatureStats(signature: number[], color: [number, number, number]) {
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
    ),
    saturation: Math.max(...color) - Math.min(...color)
  };
}

function packFragment(bytes: Uint8Array, fragmentIndex: number, raw: string) {
  const base = fragmentIndex * PACKED_FRAGMENT_BYTES;
  const color = [
    Number.parseInt(raw.slice(0, 3), 10) % 256,
    Number.parseInt(raw.slice(3, 6), 10) % 256,
    Number.parseInt(raw.slice(6, 9), 10) % 256
  ] satisfies [number, number, number];
  bytes[base] = color[0];
  bytes[base + 1] = color[1];
  bytes[base + 2] = color[2];

  const signature = signatureFor(raw);
  for (let sigIndex = 0; sigIndex < 8; sigIndex += 1) {
    bytes[base + 3 + sigIndex] =
      ((signature[sigIndex * 2] & 0x0f) << 4) |
      (signature[sigIndex * 2 + 1] & 0x0f);
  }

  const stats = signatureStats(signature, color);
  bytes[base + 11] = stats.contrast;
  bytes[base + 12] = stats.inkSum;
  bytes[base + 13] = signedByte(stats.edgeX);
  bytes[base + 14] = signedByte(stats.edgeY);
  bytes[base + 15] = signedByte(stats.diagonal);
  bytes[base + 16] = stats.texture;
  bytes[base + 17] = signedByte(stats.centerBias);
  bytes[base + 18] = stats.saturation;
}

function validatePackedCatalogue(bytes: Uint8Array, digSite: DigSite) {
  if (bytes.byteLength % digSite.packedFragmentBytes !== 0) {
    throw new Error("Dig site index is corrupt");
  }

  return {
    bytes,
    fragments: bytes.byteLength / digSite.packedFragmentBytes,
    bytesPerFragment: digSite.packedFragmentBytes,
    digSite
  } satisfies PiCatalogue;
}

function buildFallbackCatalogue(digSite: DigSite) {
  const digits = getPiDigits(DEV_FALLBACK_DIGITS);
  const fragments =
    Math.floor((digits.length - DIG_SITE_FRAGMENT_DIGITS) / DIG_SITE_FRAGMENT_STRIDE) +
    1;
  const bytes = new Uint8Array(fragments * PACKED_FRAGMENT_BYTES);

  for (let fragmentIndex = 0; fragmentIndex < fragments; fragmentIndex += 1) {
    const offset = fragmentIndex * DIG_SITE_FRAGMENT_STRIDE;
    packFragment(
      bytes,
      fragmentIndex,
      digits.slice(offset, offset + DIG_SITE_FRAGMENT_DIGITS)
    );
  }

  return {
    bytes,
    fragments,
    bytesPerFragment: PACKED_FRAGMENT_BYTES,
    digSite,
    rawDigits: digits
  } satisfies PiCatalogue;
}

export async function getPiCatalogue(digSiteId: DigSiteId = DEFAULT_DIG_SITE_ID) {
  const digSite = getDigSite(digSiteId);
  const cached = cachedCatalogues.get(digSite.id);
  if (cached) return cached;

  let catalogue: PiCatalogue;
  try {
    const response = await fetch(digSite.indexUrl);
    if (!response.ok) {
      throw new Error(`Unable to load dig site index: ${response.status}`);
    }

    catalogue = validatePackedCatalogue(
      new Uint8Array(await response.arrayBuffer()),
      digSite
    );
  } catch {
    catalogue = buildFallbackCatalogue(digSite);
  }

  cachedCatalogues.set(digSite.id, catalogue);
  return catalogue;
}

export function getDigSiteStats(catalogue: PiCatalogue) {
  return {
    digits: catalogue.rawDigits?.length ?? catalogue.digSite.digits,
    fragments: catalogue.fragments
  };
}
