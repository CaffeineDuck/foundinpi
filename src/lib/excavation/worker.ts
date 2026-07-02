/// <reference lib="webworker" />

import {
  type DigSiteId,
  DIG_SITE_FRAGMENT_DIGITS,
  DIG_SITE_FRAGMENT_STRIDE,
  TILE_CLASS_COLORS
} from "./constants";
import {
  getDigSiteStats,
  getPiCatalogue,
  type PiCatalogue
} from "./pi";
import { summarizeTiles } from "./scoring";
import type {
  ExcavationMode,
  TileClass,
  TileExcavation,
  WorkerRequest,
  WorkerResponse
} from "./types";

const ctx = self as DedicatedWorkerGlobalScope;
const COLOR_BUCKET_STEPS = 16;
const COLOR_BUCKET_MASK = COLOR_BUCKET_STEPS - 1;
const SIGNATURE_BUCKETS = 256;
const PATCH_BUCKETS = 512;
const MIN_COLOR_CANDIDATES = 160;
const COLOR_SEARCH_RADIUS = 1;
const COLOR_FALLBACK_RADIUS = 2;
const EXACT_DISTANCE_THRESHOLD = 17;
const EXACT_MIN_SOURCE_CONTRAST = 2;
const NEAR_DISTANCE_THRESHOLD = 26;
const LOSSY_DISTANCE_THRESHOLD = 33;

type PiSearchIndex = {
  catalogue: PiCatalogue;
  colorBucketStarts: Uint32Array;
  colorBucketItems: Uint32Array;
  signatureBucketStarts: Uint32Array;
  signatureBucketItems: Uint32Array;
  patchBucketStarts: Uint32Array;
  patchBucketItems: Uint32Array;
  contrast: Uint8Array;
  inkSum: Uint8Array;
  edgeX: Int16Array;
  edgeY: Int16Array;
  diagonal: Int16Array;
  texture: Uint8Array;
  centerBias: Int16Array;
  saturation: Uint8Array;
  seen: Uint32Array;
  seenMark: number;
};

type PatchDescriptor = {
  color: [number, number, number];
  signature: number[];
  contrast: number;
  inkSum: number;
  edgeX: number;
  edgeY: number;
  diagonal: number;
  texture: number;
  centerBias: number;
  saturation: number;
};

type PiFragmentView = {
  index: number;
  offset: number;
  rgb: [number, number, number];
  signature: number[];
  contrast: number;
  ink: number;
  raw: string;
};

const cachedSearchIndexes = new Map<DigSiteId, PiSearchIndex>();

function emit(message: WorkerResponse) {
  ctx.postMessage(message);
}

function fragmentColorDistance(
  catalogue: PiCatalogue,
  fragmentIndex: number,
  color: [number, number, number]
) {
  const base = fragmentBase(catalogue, fragmentIndex);
  const dr = color[0] - catalogue.bytes[base];
  const dg = color[1] - catalogue.bytes[base + 1];
  const db = color[2] - catalogue.bytes[base + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function classify(
  distance: number,
  exactSignature: boolean,
  sourceSignature: number[]
): TileClass {
  const sourceContrast =
    Math.max(...sourceSignature) - Math.min(...sourceSignature);

  if (exactSignature && distance <= EXACT_DISTANCE_THRESHOLD) return "exact";
  if (
    sourceContrast >= EXACT_MIN_SOURCE_CONTRAST &&
    distance <= EXACT_DISTANCE_THRESHOLD
  ) {
    return "exact";
  }
  if (distance <= NEAR_DISTANCE_THRESHOLD) return "near";
  if (distance <= LOSSY_DISTANCE_THRESHOLD) return "lossy";
  return "earth";
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampSigned(value: number) {
  return Math.max(-127, Math.min(127, Math.round(value)));
}

function luma(color: [number, number, number]) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  amount: number
): [number, number, number] {
  return [
    clamp(a[0] * (1 - amount) + b[0] * amount),
    clamp(a[1] * (1 - amount) + b[1] * amount),
    clamp(a[2] * (1 - amount) + b[2] * amount)
  ];
}

function piFragmentColor(
  mode: ExcavationMode,
  fragment: PiFragmentView,
  className: TileClass,
  localX: number,
  localY: number,
  tileWidth: number,
  tileHeight: number
) {
  const sx = Math.min(3, Math.floor((localX / Math.max(1, tileWidth)) * 4));
  const sy = Math.min(3, Math.floor((localY / Math.max(1, tileHeight)) * 4));
  const tone = fragment.signature[sy * 4 + sx] ?? 7;
  const digit =
    fragment.raw.length > 0
      ? Number.parseInt(
          fragment.raw[(localX * 3 + localY * 5) % fragment.raw.length],
          10
        ) || 0
      : (fragment.signature[
          (localX + localY * 3) % fragment.signature.length
        ] *
          7 +
          fragment.offset) %
        10;
  const grain = (digit - 4.5) * 3;
  const lift = (tone - 7.5) * 11 + grain;
  const raw: [number, number, number] = [
    clamp(fragment.rgb[0] + lift),
    clamp(fragment.rgb[1] + lift * 0.86),
    clamp(fragment.rgb[2] + lift * 1.08)
  ];

  let base = raw;

  if (className === "earth") {
    base = [
      clamp(25 + digit * 3 + tone),
      clamp(26 + digit * 2 + tone * 0.8),
      clamp(24 + digit * 4 + tone * 0.6)
    ];
  }

  if (className === "lossy") {
    base = mixColor(base, [92, 102, 95], 0.24);
  }

  if (mode === "deep") {
    return [
      clamp(Math.floor((base[0] + grain) / 28) * 28),
      clamp(Math.floor((base[1] + grain * 0.7) / 26) * 26),
      clamp(Math.floor((base[2] + grain * 1.2) / 30) * 30)
    ] satisfies [number, number, number];
  }

  if (mode === "cursed") {
    const inverted: [number, number, number] = [
      255 - base[2],
      255 - base[0],
      255 - base[1]
    ];
    return mixColor(base, inverted, className === "earth" ? 0.34 : 0.7);
  }

  if (mode === "holy") {
    const gold: [number, number, number] = [224, 178, 86];
    const ash: [number, number, number] = [42, 44, 39];
    const plate = mixColor(ash, gold, Math.min(1, (tone + digit) / 24));
    return mixColor(plate, base, className === "earth" ? 0.08 : 0.22);
  }

  if (mode === "scientific") {
    const gray = clamp(luma(base));
    const tint: Record<TileClass, [number, number, number]> = {
      exact: [58, 145, 103],
      near: [165, 126, 44],
      lossy: [88, 129, 170],
      earth: [54, 54, 54]
    };
    return mixColor([gray, gray, gray], tint[className], 0.28);
  }

  return [
    clamp(base[0]),
    clamp(base[1]),
    clamp(base[2])
  ] satisfies [number, number, number];
}

function heatmapColor(className: TileClass) {
  const hex = TILE_CLASS_COLORS[className];
  const rgb = hex
    .replace("#", "")
    .match(/.{1,2}/g)
    ?.map((part) => Number.parseInt(part, 16)) ?? [0, 0, 0];
  return [rgb[0], rgb[1], rgb[2], className === "earth" ? 124 : 156];
}

function fragmentBase(catalogue: PiCatalogue, index: number) {
  return index * catalogue.bytesPerFragment;
}

function signatureValue(catalogue: PiCatalogue, fragmentIndex: number, index: number) {
  const packed =
    catalogue.bytes[fragmentBase(catalogue, fragmentIndex) + 3 + (index >> 1)];
  return index % 2 === 0 ? (packed >> 4) & 0x0f : packed & 0x0f;
}

function signatureArray(catalogue: PiCatalogue, fragmentIndex: number) {
  const signature: number[] = [];

  for (let index = 0; index < 16; index += 1) {
    signature.push(signatureValue(catalogue, fragmentIndex, index));
  }

  return signature;
}

function fragmentRgb(catalogue: PiCatalogue, fragmentIndex: number) {
  const base = fragmentBase(catalogue, fragmentIndex);
  return [
    catalogue.bytes[base],
    catalogue.bytes[base + 1],
    catalogue.bytes[base + 2]
  ] satisfies [number, number, number];
}

function signedFeature(value: number) {
  return value - 128;
}

function signatureStats(
  signature: number[],
  color: [number, number, number]
) {
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
    edgeX: clampSigned(edgeX / 4),
    edgeY: clampSigned(edgeY / 4),
    diagonal: clampSigned(diagonal / 2),
    texture: clamp((neighborDiff / Math.max(1, neighborCount)) * 17),
    centerBias: clampSigned(
      (centerSum / Math.max(1, centerCount) -
        outerSum / Math.max(1, outerCount)) *
        8
    ),
    saturation: Math.max(...color) - Math.min(...color)
  };
}

function fragmentStats(catalogue: PiCatalogue, fragmentIndex: number) {
  const base = fragmentBase(catalogue, fragmentIndex);
  const rgb = fragmentRgb(catalogue, fragmentIndex);

  if (catalogue.bytesPerFragment >= 18) {
    return {
      contrast: catalogue.bytes[base + 11],
      inkSum: catalogue.bytes[base + 12],
      edgeX: signedFeature(catalogue.bytes[base + 13]),
      edgeY: signedFeature(catalogue.bytes[base + 14]),
      diagonal: signedFeature(catalogue.bytes[base + 15]),
      texture: catalogue.bytes[base + 16],
      centerBias: signedFeature(catalogue.bytes[base + 17]),
      saturation: Math.max(...rgb) - Math.min(...rgb)
    };
  }

  return signatureStats(signatureArray(catalogue, fragmentIndex), rgb);
}

function signatureDistanceSum(
  catalogue: PiCatalogue,
  fragmentIndex: number,
  signature: number[]
) {
  let distance = 0;
  const base = fragmentBase(catalogue, fragmentIndex) + 3;

  for (let packedIndex = 0; packedIndex < 8; packedIndex += 1) {
    const packed = catalogue.bytes[base + packedIndex];
    const signatureIndex = packedIndex * 2;
    distance +=
      Math.abs((signature[signatureIndex] ?? 0) - ((packed >> 4) & 0x0f)) +
      Math.abs((signature[signatureIndex + 1] ?? 0) - (packed & 0x0f));
  }

  return distance;
}

function fragmentView(
  catalogue: PiCatalogue,
  fragmentIndex: number,
  contrast: number,
  inkSum: number
) {
  const offset = fragmentIndex * DIG_SITE_FRAGMENT_STRIDE;

  return {
    index: fragmentIndex,
    offset,
    rgb: fragmentRgb(catalogue, fragmentIndex),
    signature: signatureArray(catalogue, fragmentIndex),
    contrast,
    ink: inkSum / 16,
    raw: catalogue.rawDigits
      ? catalogue.rawDigits.slice(offset, offset + DIG_SITE_FRAGMENT_DIGITS)
      : ""
  } satisfies PiFragmentView;
}

function colorBucketKeyForFragment(catalogue: PiCatalogue, fragmentIndex: number) {
  const base = fragmentBase(catalogue, fragmentIndex);
  return (
    ((catalogue.bytes[base] >> 4) << 8) |
    ((catalogue.bytes[base + 1] >> 4) << 4) |
    (catalogue.bytes[base + 2] >> 4)
  );
}

function colorBucketKeyFromBins(r: number, g: number, b: number) {
  return (r << 8) | (g << 4) | b;
}

function signatureBucketKey(signature: number[]) {
  const topLeft = (signature[0] ?? 0) >> 2;
  const topRight = (signature[3] ?? 0) >> 2;
  const bottomLeft = (signature[12] ?? 0) >> 2;
  const bottomRight = (signature[15] ?? 0) >> 2;

  return (
    (topLeft << 6) |
    (topRight << 4) |
    (bottomLeft << 2) |
    bottomRight
  );
}

function signatureBucketKeyForFragment(
  catalogue: PiCatalogue,
  fragmentIndex: number
) {
  const topLeft = signatureValue(catalogue, fragmentIndex, 0) >> 2;
  const topRight = signatureValue(catalogue, fragmentIndex, 3) >> 2;
  const bottomLeft = signatureValue(catalogue, fragmentIndex, 12) >> 2;
  const bottomRight = signatureValue(catalogue, fragmentIndex, 15) >> 2;

  return (
    (topLeft << 6) |
    (topRight << 4) |
    (bottomLeft << 2) |
    bottomRight
  );
}

function edgeDirectionBucket(edgeX: number, edgeY: number) {
  const ax = Math.abs(edgeX);
  const ay = Math.abs(edgeY);
  if (ax + ay < 8) return 0;
  if (ax > ay * 1.6) return edgeX >= 0 ? 1 : 2;
  if (ay > ax * 1.6) return edgeY >= 0 ? 3 : 4;
  if (edgeX >= 0 && edgeY >= 0) return 5;
  if (edgeX < 0 && edgeY >= 0) return 6;
  return edgeX >= 0 ? 7 : 0;
}

function patchBucketKey(stats: {
  contrast: number;
  texture: number;
  edgeX: number;
  edgeY: number;
  centerBias: number;
}) {
  const contrastBucket = Math.min(3, stats.contrast >> 2);
  const textureBucket = Math.min(3, stats.texture >> 6);
  const centerBucket = Math.min(3, (stats.centerBias + 128) >> 6);

  return (
    (contrastBucket << 7) |
    (textureBucket << 5) |
    (edgeDirectionBucket(stats.edgeX, stats.edgeY) << 2) |
    centerBucket
  );
}

function patchBucketKeyForFragment(
  catalogue: PiCatalogue,
  fragmentIndex: number
) {
  return patchBucketKey(fragmentStats(catalogue, fragmentIndex));
}

function patchDescriptor(
  color: [number, number, number],
  signature: number[]
): PatchDescriptor {
  return {
    color,
    signature,
    ...signatureStats(signature, color)
  };
}

function startsFromCounts(counts: Uint32Array) {
  const starts = new Uint32Array(counts.length + 1);

  for (let index = 0; index < counts.length; index += 1) {
    starts[index + 1] = starts[index] + counts[index];
  }

  return starts;
}

function buildSearchIndex(catalogue: PiCatalogue) {
  const colorCounts = new Uint32Array(COLOR_BUCKET_STEPS ** 3);
  const signatureCounts = new Uint32Array(SIGNATURE_BUCKETS);
  const patchCounts = new Uint32Array(PATCH_BUCKETS);
  const contrast = new Uint8Array(catalogue.fragments);
  const inkSum = new Uint8Array(catalogue.fragments);
  const edgeX = new Int16Array(catalogue.fragments);
  const edgeY = new Int16Array(catalogue.fragments);
  const diagonal = new Int16Array(catalogue.fragments);
  const texture = new Uint8Array(catalogue.fragments);
  const centerBias = new Int16Array(catalogue.fragments);
  const saturation = new Uint8Array(catalogue.fragments);

  for (let index = 0; index < catalogue.fragments; index += 1) {
    colorCounts[colorBucketKeyForFragment(catalogue, index)] += 1;
    signatureCounts[signatureBucketKeyForFragment(catalogue, index)] += 1;

    const stats = fragmentStats(catalogue, index);
    patchCounts[patchBucketKey(stats)] += 1;
    contrast[index] = stats.contrast;
    inkSum[index] = stats.inkSum;
    edgeX[index] = stats.edgeX;
    edgeY[index] = stats.edgeY;
    diagonal[index] = stats.diagonal;
    texture[index] = stats.texture;
    centerBias[index] = stats.centerBias;
    saturation[index] = stats.saturation;
  }

  const colorBucketStarts = startsFromCounts(colorCounts);
  const signatureBucketStarts = startsFromCounts(signatureCounts);
  const patchBucketStarts = startsFromCounts(patchCounts);
  const colorBucketItems = new Uint32Array(catalogue.fragments);
  const signatureBucketItems = new Uint32Array(catalogue.fragments);
  const patchBucketItems = new Uint32Array(catalogue.fragments);
  const colorCursor = new Uint32Array(
    colorBucketStarts.subarray(0, colorCounts.length)
  );
  const signatureCursor = new Uint32Array(
    signatureBucketStarts.subarray(0, signatureCounts.length)
  );
  const patchCursor = new Uint32Array(
    patchBucketStarts.subarray(0, patchCounts.length)
  );

  for (let index = 0; index < catalogue.fragments; index += 1) {
    const colorKey = colorBucketKeyForFragment(catalogue, index);
    const signatureKey = signatureBucketKeyForFragment(catalogue, index);
    const patchKey = patchBucketKeyForFragment(catalogue, index);
    colorBucketItems[colorCursor[colorKey]] = index;
    colorCursor[colorKey] += 1;
    signatureBucketItems[signatureCursor[signatureKey]] = index;
    signatureCursor[signatureKey] += 1;
    patchBucketItems[patchCursor[patchKey]] = index;
    patchCursor[patchKey] += 1;
  }

  return {
    catalogue,
    colorBucketStarts,
    colorBucketItems,
    signatureBucketStarts,
    signatureBucketItems,
    patchBucketStarts,
    patchBucketItems,
    contrast,
    inkSum,
    edgeX,
    edgeY,
    diagonal,
    texture,
    centerBias,
    saturation,
    seen: new Uint32Array(catalogue.fragments),
    seenMark: 0
  } satisfies PiSearchIndex;
}

async function getPiSearchIndex(digSiteId: DigSiteId) {
  const cached = cachedSearchIndexes.get(digSiteId);
  if (cached) return cached;

  const catalogue = await getPiCatalogue(digSiteId);
  const searchIndex = buildSearchIndex(catalogue);
  cachedSearchIndexes.set(catalogue.digSite.id, searchIndex);

  return searchIndex;
}

function findNearestPiFragment(sourcePatch: PatchDescriptor, searchIndex: PiSearchIndex) {
  const {
    catalogue,
    colorBucketStarts,
    colorBucketItems,
    signatureBucketStarts,
    signatureBucketItems,
    patchBucketStarts,
    patchBucketItems,
    contrast,
    inkSum,
    edgeX,
    edgeY,
    diagonal,
    texture,
    centerBias,
    saturation,
    seen
  } = searchIndex;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestColorDistance = Number.POSITIVE_INFINITY;
  let exactSignature = false;
  let candidateCount = 0;
  searchIndex.seenMark += 1;

  if (searchIndex.seenMark === 0xffffffff) {
    seen.fill(0);
    searchIndex.seenMark = 1;
  }

  const seenMark = searchIndex.seenMark;

  function consider(candidateIndex: number) {
    if (seen[candidateIndex] === seenMark) return;
    seen[candidateIndex] = seenMark;
    candidateCount += 1;

    const candidateColorDistance = fragmentColorDistance(
      catalogue,
      candidateIndex,
      sourcePatch.color
    );
    const candidateSignatureDistanceSum = signatureDistanceSum(
      catalogue,
      candidateIndex,
      sourcePatch.signature
    );
    const contrastDistance = Math.abs(
      sourcePatch.contrast - contrast[candidateIndex]
    );
    const inkDistance = Math.abs(sourcePatch.inkSum - inkSum[candidateIndex]) / 16;
    const edgeDistance =
      (Math.abs(sourcePatch.edgeX - edgeX[candidateIndex]) +
        Math.abs(sourcePatch.edgeY - edgeY[candidateIndex]) +
        Math.abs(sourcePatch.diagonal - diagonal[candidateIndex])) /
      24;
    const textureDistance =
      Math.abs(sourcePatch.texture - texture[candidateIndex]) / 17;
    const centerDistance =
      Math.abs(sourcePatch.centerBias - centerBias[candidateIndex]) / 16;
    const saturationDistance = Math.abs(
      sourcePatch.saturation - saturation[candidateIndex]
    );
    const distance =
      candidateColorDistance * 0.045 +
      (candidateSignatureDistanceSum / 16) * 4.9 +
      contrastDistance * 1.25 +
      inkDistance * 0.55 +
      edgeDistance * 3.2 +
      textureDistance * 1.1 +
      centerDistance * 0.8 +
      saturationDistance * 0.035;

    if (distance < bestDistance) {
      bestIndex = candidateIndex;
      bestDistance = distance;
      bestColorDistance = candidateColorDistance;
      exactSignature = candidateSignatureDistanceSum === 0;
    }
  }

  function searchColorBuckets(radius: number) {
    const rBucket = (sourcePatch.color[0] >> 4) & COLOR_BUCKET_MASK;
    const gBucket = (sourcePatch.color[1] >> 4) & COLOR_BUCKET_MASK;
    const bBucket = (sourcePatch.color[2] >> 4) & COLOR_BUCKET_MASK;

    for (
      let r = Math.max(0, rBucket - radius);
      r <= Math.min(COLOR_BUCKET_MASK, rBucket + radius);
      r += 1
    ) {
      for (
        let g = Math.max(0, gBucket - radius);
        g <= Math.min(COLOR_BUCKET_MASK, gBucket + radius);
        g += 1
      ) {
        for (
          let b = Math.max(0, bBucket - radius);
          b <= Math.min(COLOR_BUCKET_MASK, bBucket + radius);
          b += 1
        ) {
          const bucketKey = colorBucketKeyFromBins(r, g, b);
          const start = colorBucketStarts[bucketKey];
          const end = colorBucketStarts[bucketKey + 1];

          for (let itemIndex = start; itemIndex < end; itemIndex += 1) {
            consider(colorBucketItems[itemIndex]);
          }
        }
      }
    }
  }

  searchColorBuckets(COLOR_SEARCH_RADIUS);

  const signatureKey = signatureBucketKey(sourcePatch.signature);
  const signatureStart = signatureBucketStarts[signatureKey];
  const signatureEnd = signatureBucketStarts[signatureKey + 1];
  for (
    let itemIndex = signatureStart;
    itemIndex < signatureEnd;
    itemIndex += 1
  ) {
    consider(signatureBucketItems[itemIndex]);
  }

  const patchKey = patchBucketKey(sourcePatch);
  const patchStart = patchBucketStarts[patchKey];
  const patchEnd = patchBucketStarts[patchKey + 1];
  for (let itemIndex = patchStart; itemIndex < patchEnd; itemIndex += 1) {
    consider(patchBucketItems[itemIndex]);
  }

  if (candidateCount < MIN_COLOR_CANDIDATES) {
    searchColorBuckets(COLOR_FALLBACK_RADIUS);
  }

  return {
    best: fragmentView(
      catalogue,
      bestIndex,
      contrast[bestIndex],
      inkSum[bestIndex]
    ),
    bestDistance,
    bestColorDistance,
    exactSignature
  };
}

async function processImage(request: WorkerRequest) {
  emit({
    type: "progress",
    jobId: request.jobId,
    progress: 0.08,
    label: "Indexing dig site"
  });

  const searchIndex = await getPiSearchIndex(request.digSiteId);
  const stats = getDigSiteStats(searchIndex.catalogue);
  const source = new Uint8ClampedArray(request.imageBuffer);
  const relic = new Uint8ClampedArray(source.length);
  const heatmap = new Uint8ClampedArray(source.length);
  const tiles: TileExcavation[] = [];
  const { width, height, tileSize, mode } = request;
  const totalTiles = Math.ceil(width / tileSize) * Math.ceil(height / tileSize);
  let tileIndex = 0;

  for (let tileY = 0; tileY < height; tileY += tileSize) {
    for (let tileX = 0; tileX < width; tileX += tileSize) {
      const tileWidth = Math.min(tileSize, width - tileX);
      const tileHeight = Math.min(tileSize, height - tileY);
      let r = 0;
      let g = 0;
      let b = 0;
      let samples = 0;
      const signatureSums = Array.from({ length: 16 }, () => 0);
      const signatureCounts = Array.from({ length: 16 }, () => 0);

      for (let y = tileY; y < tileY + tileHeight; y += 1) {
        for (let x = tileX; x < tileX + tileWidth; x += 1) {
          const i = (y * width + x) * 4;
          const alpha = source[i + 3] / 255;
          r += source[i] * alpha + 246 * (1 - alpha);
          g += source[i + 1] * alpha + 247 * (1 - alpha);
          b += source[i + 2] * alpha + 244 * (1 - alpha);
          const composed: [number, number, number] = [
            source[i] * alpha + 246 * (1 - alpha),
            source[i + 1] * alpha + 247 * (1 - alpha),
            source[i + 2] * alpha + 244 * (1 - alpha)
          ];
          const localX = x - tileX;
          const localY = y - tileY;
          const sx = Math.min(3, Math.floor((localX / tileWidth) * 4));
          const sy = Math.min(3, Math.floor((localY / tileHeight) * 4));
          const signatureIndex = sy * 4 + sx;
          signatureSums[signatureIndex] += luma(composed);
          signatureCounts[signatureIndex] += 1;
          samples += 1;
        }
      }

      const average: [number, number, number] = [
        clamp(r / samples),
        clamp(g / samples),
        clamp(b / samples)
      ];
      const sourceSignature = signatureSums.map((sum, index) =>
        clamp((sum / Math.max(1, signatureCounts[index]) / 255) * 15)
      );
      const sourcePatch = patchDescriptor(average, sourceSignature);
      const { best, bestDistance, bestColorDistance, exactSignature } =
        findNearestPiFragment(sourcePatch, searchIndex);
      const isExact = exactSignature && bestColorDistance <= 48;
      const className = classify(bestDistance, isExact, sourceSignature);
      const recovered = best.rgb;
      const heat = heatmapColor(className);

      for (let y = tileY; y < tileY + tileHeight; y += 1) {
        for (let x = tileX; x < tileX + tileWidth; x += 1) {
          const i = (y * width + x) * 4;
          const result = piFragmentColor(
            mode,
            best,
            className,
            x - tileX,
            y - tileY,
            tileWidth,
            tileHeight
          );
          const gridLine =
            (x - tileX === 0 || y - tileY === 0) && mode === "scientific";

          relic[i] = gridLine ? 24 : result[0];
          relic[i + 1] = gridLine ? 24 : result[1];
          relic[i + 2] = gridLine ? 24 : result[2];
          relic[i + 3] = 255;

          heatmap[i] = heat[0];
          heatmap[i + 1] = heat[1];
          heatmap[i + 2] = heat[2];
          heatmap[i + 3] = heat[3];
        }
      }

      tiles.push({
        x: tileX,
        y: tileY,
        width: tileWidth,
        height: tileHeight,
        className,
        distance: Math.round(bestDistance * 10) / 10,
        coordinate: `π:${best.offset.toString().padStart(6, "0")}..${(
          best.offset + 31
        )
          .toString()
          .padStart(6, "0")}`,
        source: average,
        recovered,
        signature: best.signature,
        exactSignature: isExact
      });

      tileIndex += 1;
      if (tileIndex % 24 === 0) {
        emit({
          type: "progress",
          jobId: request.jobId,
          progress: 0.12 + (tileIndex / totalTiles) * 0.72,
          label: "Classifying fragments"
        });
      }
    }
  }

  emit({
    type: "progress",
    jobId: request.jobId,
    progress: 0.9,
    label: "Cataloging relic"
  });
  const summary = summarizeTiles(
    tiles,
    stats.fragments,
    searchIndex.catalogue.digSite,
    stats.digits
  );

  return {
    width,
    height,
    tiles,
    summary,
    relicBuffer: relic.buffer,
    heatmapBuffer: heatmap.buffer
  };
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const result = await processImage(event.data);
    ctx.postMessage(
      {
        type: "result",
        jobId: event.data.jobId,
        result
      } satisfies WorkerResponse,
      [result.relicBuffer, result.heatmapBuffer]
    );
  } catch (error) {
    emit({
      type: "error",
      jobId: event.data.jobId,
      message: error instanceof Error ? error.message : "Excavation failed"
    });
  }
};
