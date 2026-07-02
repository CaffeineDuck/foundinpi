import {
  DIG_SITE_FRAGMENT_BYTES,
  type DigSite
} from "./constants";
import type { ExcavationSummary, TileClass, TileExcavation } from "./types";

const CLASS_WEIGHT: Record<TileClass, number> = {
  exact: 1,
  near: 0.55,
  lossy: 0.22,
  earth: 0
};

const DISTANCE_SCORE_MIN = 14;
const DISTANCE_SCORE_MAX = 42;
const DISTANCE_SCORE_CURVE = 1.18;
const MATCH_SCORE_WEIGHT = 0.84;

function rarityFor(score: number) {
  if (score >= 82) return "Cathedral Grade";
  if (score >= 66) return "Museum Grade";
  if (score >= 48) return "Field Relic";
  if (score >= 30) return "Fragment Cluster";
  return "Deep Earth";
}

function percent(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function oneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function distanceQuality(distance: number) {
  const normalized = clamp01(
    (DISTANCE_SCORE_MAX - distance) / (DISTANCE_SCORE_MAX - DISTANCE_SCORE_MIN)
  );

  return Math.pow(normalized, DISTANCE_SCORE_CURVE);
}

function buildShareGrid(tiles: TileExcavation[]) {
  if (tiles.length === 0) return "";

  const minX = Math.min(...tiles.map((tile) => tile.x));
  const minY = Math.min(...tiles.map((tile) => tile.y));
  const maxX = Math.max(...tiles.map((tile) => tile.x + tile.width));
  const maxY = Math.max(...tiles.map((tile) => tile.y + tile.height));
  const cols = 7;
  const rows = 7;
  const glyphs: Record<TileClass, string> = {
    exact: "🟩",
    near: "🟨",
    lossy: "⬜",
    earth: "⬛"
  };

  const lines: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    let line = "";
    for (let col = 0; col < cols; col += 1) {
      const cx = minX + ((col + 0.5) / cols) * (maxX - minX);
      const cy = minY + ((row + 0.5) / rows) * (maxY - minY);
      const hit =
        tiles.find(
          (tile) =>
            cx >= tile.x &&
            cx < tile.x + tile.width &&
            cy >= tile.y &&
            cy < tile.y + tile.height
        ) ?? tiles[(row * cols + col) % tiles.length];
      line += glyphs[hit.className];
    }
    lines.push(line);
  }

  return lines.join("\n");
}

function hashTiles(tiles: TileExcavation[], salt: string) {
  let hash = 2166136261;

  for (let index = 0; index < salt.length; index += 1) {
    hash ^= salt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  for (const tile of tiles) {
    const text = `${tile.className}:${tile.coordinate}:${tile.distance}:${tile.source.join(",")}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }

  return hash >>> 0;
}

function nameRelic(seedNumber: number, digSite: DigSite) {
  const materials = [
    "Mossglass",
    "Obsidian",
    "Citrine",
    "Verdigris",
    "Black Salt",
    "Static",
    "Opal",
    "Vermilion",
    "Lacquer",
    "Mercury",
    "Ash",
    "Jade"
  ];
  const forms = [
    "Reliquary",
    "Index",
    "Tablet",
    "Signal",
    "Plate",
    "Cipher",
    "Atlas",
    "Shrine",
    "Proof",
    "Receipt",
    "Lantern",
    "Fragment"
  ];
  const epithets = [
    "of Radius Zero",
    "from the Green Offset",
    "under the Ninth Decimal",
    "with Missing Edges",
    "for a Borrowed Coordinate",
    "of the Quiet Window",
    `from ${digSite.shortLabel}`,
    "with a Salted Checksum",
    "beneath the Indexed Rain",
    "for the Last Near Match",
    "of the Lower Mantissa",
    "with Archive Dust"
  ];
  const serial = (seedNumber % 997).toString().padStart(3, "0");
  const pick = (values: string[], shift: number) =>
    values[(seedNumber >>> shift) % values.length];
  const patterns = [
    () => `${pick(materials, 0)} ${pick(forms, 8)} ${serial}`,
    () => `The ${pick(materials, 4)} ${pick(forms, 12)} ${serial}`,
    () => `${pick(forms, 16)} ${pick(epithets, 20)} ${serial}`,
    () =>
      `${pick(materials, 24)} ${pick(forms, 28)} ${pick(epithets, 32)} ${serial}`
  ];

  return patterns[seedNumber % patterns.length]();
}

export function summarizeTiles(
  tiles: TileExcavation[],
  indexedFragments: number,
  digSite: DigSite,
  searchedDigits: number = digSite.digits
): ExcavationSummary {
  const total = tiles.length || 1;
  const counts: Record<TileClass, number> = {
    exact: 0,
    near: 0,
    lossy: 0,
    earth: 0
  };

  let weighted = 0;
  let matchQuality = 0;
  let longestRun = 0;
  let currentRun = 0;

  for (const tile of tiles) {
    counts[tile.className] += 1;
    weighted += CLASS_WEIGHT[tile.className];
    matchQuality += distanceQuality(tile.distance);

    if (tile.className === "exact" || tile.className === "near") {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const exactPct = percent(counts.exact, total);
  const nearPct = percent(counts.near, total);
  const lossyPct = percent(counts.lossy, total);
  const earthPct = percent(counts.earth, total);
  const classScore = (weighted / total) * 100;
  const piNative = oneDecimal((matchQuality / total) * 100);
  const score = oneDecimal(
    piNative * MATCH_SCORE_WEIGHT + classScore * (1 - MATCH_SCORE_WEIGHT)
  );
  const rarity = rarityFor(score);
  const longestFossil = longestRun * DIG_SITE_FRAGMENT_BYTES;
  const seedNumber = hashTiles(tiles, digSite.id);
  const seed = seedNumber.toString(36).toUpperCase();
  const relicName = nameRelic(seedNumber, digSite);

  return {
    relicName,
    seed,
    score,
    piNative,
    exactPct,
    nearPct,
    lossyPct,
    earthPct,
    rarity,
    longestFossil,
    digSite: digSite.label,
    indexedFragments,
    searchedDigits,
    digitUnit: digSite.digitUnit,
    indexVersion: digSite.indexVersion,
    indexChecksum: digSite.indexChecksum,
    shareGrid: buildShareGrid(tiles),
    summary: `${relicName}: ${piNative.toFixed(1)}% pi-native, ${longestFossil} byte longest fossil, ${rarity}.`
  };
}
