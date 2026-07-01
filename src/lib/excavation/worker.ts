/// <reference lib="webworker" />

import { TILE_CLASS_COLORS } from "./constants";
import { getDigSiteStats, getPiCatalogue, type PiFragment } from "./pi";
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
const MIN_COLOR_CANDIDATES = 160;
const COLOR_SEARCH_RADIUS = 1;
const COLOR_FALLBACK_RADIUS = 2;

type PiSearchIndex = {
  catalogue: PiFragment[];
  colorBuckets: number[][];
  signatureBuckets: number[][];
  seen: Uint32Array;
  seenMark: number;
};

let cachedSearchIndex: PiSearchIndex | null = null;

function emit(message: WorkerResponse) {
  ctx.postMessage(message);
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function classify(distance: number, exactSignature: boolean): TileClass {
  if (exactSignature && distance <= 22) return "exact";
  if (distance <= 30) return "near";
  if (distance <= 58) return "lossy";
  return "earth";
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
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
  fragment: PiFragment,
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

function signatureDistance(a: number[], b: number[]) {
  let distance = 0;
  for (let index = 0; index < 16; index += 1) {
    distance += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return distance / 16;
}

function colorBucketKey(color: [number, number, number]) {
  return (
    ((color[0] >> 4) << 8) |
    ((color[1] >> 4) << 4) |
    (color[2] >> 4)
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

function buildSearchIndex(catalogue: PiFragment[]) {
  const colorBuckets = Array.from(
    { length: COLOR_BUCKET_STEPS ** 3 },
    () => [] as number[]
  );
  const signatureBuckets = Array.from(
    { length: SIGNATURE_BUCKETS },
    () => [] as number[]
  );

  catalogue.forEach((fragment, index) => {
    colorBuckets[colorBucketKey(fragment.rgb)].push(index);
    signatureBuckets[signatureBucketKey(fragment.signature)].push(index);
  });

  return {
    catalogue,
    colorBuckets,
    signatureBuckets,
    seen: new Uint32Array(catalogue.length),
    seenMark: 0
  } satisfies PiSearchIndex;
}

async function getPiSearchIndex() {
  if (cachedSearchIndex) return cachedSearchIndex;

  const catalogue = await getPiCatalogue();
  cachedSearchIndex = buildSearchIndex(catalogue);

  return cachedSearchIndex;
}

function findNearestPiFragment(
  color: [number, number, number],
  signature: number[],
  searchIndex: PiSearchIndex
) {
  const { catalogue, colorBuckets, signatureBuckets, seen } = searchIndex;
  let best = catalogue[0];
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
  const sourceContrast = Math.max(...signature) - Math.min(...signature);
  const sourceInk =
    signature.reduce((total, value) => total + value, 0) / signature.length;

  function consider(candidateIndex: number) {
    if (seen[candidateIndex] === seenMark) return;
    seen[candidateIndex] = seenMark;
    candidateCount += 1;

    const candidate = catalogue[candidateIndex];
    const candidateColorDistance = colorDistance(color, candidate.rgb);
    const candidateSignatureDistance = signatureDistance(
      signature,
      candidate.signature
    );
    const contrastDistance = Math.abs(sourceContrast - candidate.contrast);
    const inkDistance = Math.abs(sourceInk - candidate.ink);
    const distance =
      candidateColorDistance * 0.08 +
      candidateSignatureDistance * 7.4 +
      contrastDistance * 2.2 +
      inkDistance * 1.3;

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      bestColorDistance = candidateColorDistance;
      exactSignature = candidateSignatureDistance === 0;
    }
  }

  function searchColorBuckets(radius: number) {
    const rBucket = (color[0] >> 4) & COLOR_BUCKET_MASK;
    const gBucket = (color[1] >> 4) & COLOR_BUCKET_MASK;
    const bBucket = (color[2] >> 4) & COLOR_BUCKET_MASK;

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
          const bucket = colorBuckets[colorBucketKeyFromBins(r, g, b)];
          for (const candidateIndex of bucket) consider(candidateIndex);
        }
      }
    }
  }

  searchColorBuckets(COLOR_SEARCH_RADIUS);

  const signatureBucket = signatureBuckets[signatureBucketKey(signature)];
  for (const candidateIndex of signatureBucket) consider(candidateIndex);

  if (candidateCount < MIN_COLOR_CANDIDATES) {
    searchColorBuckets(COLOR_FALLBACK_RADIUS);
  }

  return { best, bestDistance, bestColorDistance, exactSignature };
}

async function processImage(request: WorkerRequest) {
  emit({
    type: "progress",
    jobId: request.jobId,
    progress: 0.08,
    label: "Indexing dig site"
  });

  const searchIndex = await getPiSearchIndex();
  const stats = getDigSiteStats(searchIndex.catalogue.length);
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
      const { best, bestDistance, bestColorDistance, exactSignature } =
        findNearestPiFragment(average, sourceSignature, searchIndex);
      const isExact = exactSignature && bestColorDistance <= 48;
      const className = classify(bestDistance, isExact);
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
  const summary = summarizeTiles(tiles, stats.fragments);

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
