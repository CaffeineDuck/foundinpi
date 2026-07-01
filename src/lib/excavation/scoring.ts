import {
  DIG_SITE_DIGITS,
  DIG_SITE_FRAGMENT_BYTES,
  DIG_SITE_INDEX_SHA256,
  DIG_SITE_INDEX_VERSION,
  DIG_SITE_LABEL
} from "./constants";
import type { ExcavationSummary, TileClass, TileExcavation } from "./types";

const CLASS_WEIGHT: Record<TileClass, number> = {
  exact: 1,
  near: 0.55,
  lossy: 0.22,
  earth: 0
};

function rarityFor(score: number) {
  if (score >= 68) return "Cathedral Grade";
  if (score >= 50) return "Museum Grade";
  if (score >= 34) return "Field Relic";
  if (score >= 18) return "Fragment Cluster";
  return "Deep Earth";
}

function percent(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
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

function hashTiles(tiles: TileExcavation[]) {
  let hash = 2166136261;

  for (const tile of tiles) {
    const text = `${tile.className}:${tile.coordinate}:${tile.distance}:${tile.source.join(",")}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }

  return hash >>> 0;
}

function nameRelic(seedNumber: number) {
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
    "from Dig Site I",
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
  indexedFragments: number
): ExcavationSummary {
  const total = tiles.length || 1;
  const counts: Record<TileClass, number> = {
    exact: 0,
    near: 0,
    lossy: 0,
    earth: 0
  };

  let weighted = 0;
  let longestRun = 0;
  let currentRun = 0;

  for (const tile of tiles) {
    counts[tile.className] += 1;
    weighted += CLASS_WEIGHT[tile.className];

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
  const score = Math.round((weighted / total) * 1000) / 10;
  const piNative =
    Math.round((exactPct + nearPct * 0.55 + lossyPct * 0.2) * 10) / 10;
  const rarity = rarityFor(score);
  const longestFossil = longestRun * DIG_SITE_FRAGMENT_BYTES;
  const seedNumber = hashTiles(tiles);
  const seed = seedNumber.toString(36).toUpperCase();
  const relicName = nameRelic(seedNumber);

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
    digSite: DIG_SITE_LABEL,
    indexedFragments,
    searchedDigits: DIG_SITE_DIGITS,
    indexVersion: DIG_SITE_INDEX_VERSION,
    indexChecksum: DIG_SITE_INDEX_SHA256,
    shareGrid: buildShareGrid(tiles),
    summary: `${relicName}: ${piNative.toFixed(1)}% pi-native, ${longestFossil} byte longest fossil, ${rarity}.`
  };
}
