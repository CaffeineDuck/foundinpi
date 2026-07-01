import {
  DEFAULT_DIG_SITE_ID,
  type DigSite,
  type DigSiteId,
  DIG_SITE_FRAGMENT_DIGITS,
  DIG_SITE_FRAGMENT_STRIDE,
  getDigSite
} from "./constants";

export type PiCatalogue = {
  bytes: Uint8Array;
  fragments: number;
  digSite: DigSite;
  rawDigits?: string;
};

export const PACKED_FRAGMENT_BYTES = 11;

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

function packFragment(bytes: Uint8Array, fragmentIndex: number, raw: string) {
  const base = fragmentIndex * PACKED_FRAGMENT_BYTES;
  bytes[base] = Number.parseInt(raw.slice(0, 3), 10) % 256;
  bytes[base + 1] = Number.parseInt(raw.slice(3, 6), 10) % 256;
  bytes[base + 2] = Number.parseInt(raw.slice(6, 9), 10) % 256;

  const signature = signatureFor(raw);
  for (let sigIndex = 0; sigIndex < 8; sigIndex += 1) {
    bytes[base + 3 + sigIndex] =
      ((signature[sigIndex * 2] & 0x0f) << 4) |
      (signature[sigIndex * 2 + 1] & 0x0f);
  }
}

function validatePackedCatalogue(bytes: Uint8Array, digSite: DigSite) {
  if (bytes.byteLength % PACKED_FRAGMENT_BYTES !== 0) {
    throw new Error("Dig site index is corrupt");
  }

  return {
    bytes,
    fragments: bytes.byteLength / PACKED_FRAGMENT_BYTES,
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
