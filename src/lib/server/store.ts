import type {
  CreateRelicResult,
  PublishRelicInput,
  RelicMatch,
  RelicRecord,
  RelicStatus
} from "./types";
import { DEFAULT_DIG_SITE, DIG_SITES } from "../excavation/constants";

export type EnvLike = {
  DB?: D1Database;
  RELIC_BUCKET?: R2Bucket;
};

type DbRelic = {
  id: string;
  title: string;
  mode: RelicRecord["mode"];
  rarity: string;
  score: number;
  pi_native: number;
  exact_pct: number;
  near_pct: number;
  lossy_pct: number;
  earth_pct: number;
  longest_fossil: number;
  dig_site: string;
  index_version?: string | null;
  index_checksum?: string | null;
  searched_digits?: number | null;
  indexed_fragments?: number | null;
  share_grid: string;
  summary: string;
  artifact_key: string;
  card_key: string;
  artifact_hash: string | null;
  match_hash: string | null;
  status: RelicStatus;
  views: number;
  created_at: string;
};

const memoryStore = globalThis as typeof globalThis & {
  __foundInPiRelics?: Map<string, RelicRecord>;
  __foundInPiArtifacts?: Map<string, { bytes: Uint8Array; contentType: string }>;
};

function relics() {
  memoryStore.__foundInPiRelics ??= new Map();
  return memoryStore.__foundInPiRelics;
}

function artifacts() {
  memoryStore.__foundInPiArtifacts ??= new Map();
  return memoryStore.__foundInPiArtifacts;
}

function hashText(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function looksFilenameLike(title: string) {
  const clean = title.trim();

  return (
    clean === "sample-relic" ||
    /\.[a-z0-9]{2,5}$/i.test(clean) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(clean) ||
    /[_-][0-9a-f]{6,}/i.test(clean) ||
    (/^[a-z0-9][a-z0-9_-]{5,}$/i.test(clean) && !clean.includes(" "))
  );
}

function legacyTitle(row: DbRelic) {
  if (!looksFilenameLike(row.title)) return row.title;

  const seed = hashText(
    `${row.id}:${row.score}:${row.pi_native}:${row.rarity}:${row.created_at}`
  );
  const materials = [
    "Mossglass",
    "Obsidian",
    "Citrine",
    "Verdigris",
    "Black Salt",
    "Static",
    "Opal",
    "Vermilion"
  ];
  const forms = [
    "Reliquary",
    "Index",
    "Tablet",
    "Signal",
    "Plate",
    "Cipher",
    "Atlas",
    "Fragment"
  ];
  const material = materials[seed % materials.length];
  const form = forms[(seed >>> 8) % forms.length];
  const serial = (seed % 997).toString().padStart(3, "0");

  return `${material} ${form} ${serial}`;
}

function siteFromLabel(label: string | undefined) {
  const clean = label ?? "";
  const exact = DIG_SITES.find((site) => site.label === clean);
  if (exact) return exact;
  const byVersion = DIG_SITES.find((site) => clean.includes(site.indexVersion));
  if (byVersion) return byVersion;
  if (clean.includes("10,000,000")) return DIG_SITES[1];
  if (clean.includes("1,000,000")) return DIG_SITES[0];
  return DEFAULT_DIG_SITE;
}

function resolveInputDigSite(input: PublishRelicInput) {
  const site =
    DIG_SITES.find((entry) => entry.indexVersion === input.indexVersion) ??
    siteFromLabel(input.digSite);

  return {
    digSite: site.label,
    indexVersion: input.indexVersion ?? site.indexVersion,
    indexChecksum: input.indexChecksum ?? site.indexChecksum,
    searchedDigits: input.searchedDigits ?? site.digits,
    indexedFragments: input.indexedFragments ?? site.indexedFragments
  };
}

function resolveRowDigSite(row: DbRelic) {
  const site =
    DIG_SITES.find((entry) => entry.indexVersion === row.index_version) ??
    siteFromLabel(row.dig_site);

  return {
    digSite: site.label,
    indexVersion: row.index_version ?? site.indexVersion,
    indexChecksum: row.index_checksum ?? site.indexChecksum,
    searchedDigits: row.searched_digits ?? site.digits,
    indexedFragments: row.indexed_fragments ?? site.indexedFragments
  };
}

function dbToRelic(row: DbRelic): RelicRecord {
  const digSite = resolveRowDigSite(row);

  return {
    id: row.id,
    title: legacyTitle(row),
    mode: row.mode,
    rarity: row.rarity,
    score: row.score,
    piNative: row.pi_native,
    exactPct: row.exact_pct,
    nearPct: row.near_pct,
    lossyPct: row.lossy_pct,
    earthPct: row.earth_pct,
    longestFossil: row.longest_fossil,
    digSite: digSite.digSite,
    indexVersion: digSite.indexVersion,
    indexChecksum: digSite.indexChecksum,
    searchedDigits: digSite.searchedDigits,
    indexedFragments: digSite.indexedFragments,
    shareGrid: row.share_grid,
    summary: row.summary,
    artifactKey: row.artifact_key,
    cardKey: row.card_key,
    artifactHash: row.artifact_hash ?? null,
    matchHash: row.match_hash ?? null,
    status: row.status,
    views: row.views,
    createdAt: row.created_at
  };
}

function randomId() {
  const alphabet =
    "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Expected base64 data URL image");
  }

  const contentType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { bytes, contentType };
}

function safeTitle(title: string | undefined) {
  const clean = title?.trim().replace(/\s+/g, " ").slice(0, 72);
  return clean || "Untitled Pi Relic";
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return hex(await crypto.subtle.digest("SHA-256", buffer));
}

function normalizedScore(value: number) {
  return Math.round(value * 10) / 10;
}

function matchSource(input: PublishRelicInput) {
  const digSite = resolveInputDigSite(input);

  return JSON.stringify({
    mode: input.mode,
    rarity: input.rarity,
    score: normalizedScore(input.score),
    piNative: normalizedScore(input.piNative),
    exactPct: normalizedScore(input.exactPct),
    nearPct: normalizedScore(input.nearPct),
    lossyPct: normalizedScore(input.lossyPct),
    earthPct: normalizedScore(input.earthPct),
    longestFossil: input.longestFossil,
    digSite: digSite.digSite,
    indexVersion: digSite.indexVersion,
    shareGrid: input.shareGrid.trim()
  });
}

function exactFallbackKey(relic: RelicRecord) {
  if (relic.artifactHash || relic.matchHash) {
    return relic.artifactHash || relic.matchHash || relic.id;
  }

  return [
    relic.mode,
    relic.title,
    relic.rarity,
    normalizedScore(relic.score),
    normalizedScore(relic.piNative),
    normalizedScore(relic.exactPct),
    normalizedScore(relic.nearPct),
    normalizedScore(relic.lossyPct),
    normalizedScore(relic.earthPct),
    relic.longestFossil,
    relic.digSite,
    relic.indexVersion
  ].join("|");
}

function visibleRelicsOnly(relic: RelicRecord) {
  return relic.status === "public" || relic.status === "curated";
}

function dedupeRelics(records: RelicRecord[], limit: number) {
  const seen = new Set<string>();
  const deduped: RelicRecord[] = [];

  for (const relic of records) {
    const key = exactFallbackKey(relic);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(relic);

    if (deduped.length >= limit) break;
  }

  return deduped;
}

function shareGridGlyphs(grid: string) {
  return grid
    .split(/\n+/)
    .flatMap((line) => Array.from(line.trim()))
    .filter(Boolean);
}

function shareGridSimilarity(a: string, b: string) {
  const left = shareGridGlyphs(a);
  const right = shareGridGlyphs(b);
  const total = Math.max(left.length, right.length);
  if (total === 0) return 0;

  let matches = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] === right[index]) matches += 1;
  }

  return matches / total;
}

function relicSimilarity(input: PublishRelicInput, relic: RelicRecord) {
  const digSite = resolveInputDigSite(input);
  if (
    input.mode !== relic.mode ||
    digSite.digSite !== relic.digSite ||
    digSite.indexVersion !== relic.indexVersion
  ) {
    return 0;
  }

  const grid = shareGridSimilarity(input.shareGrid, relic.shareGrid);
  const score = Math.max(0, 1 - Math.abs(input.score - relic.score) / 28);
  const piNative = Math.max(0, 1 - Math.abs(input.piNative - relic.piNative) / 28);
  const fossil = Math.max(
    0,
    1 - Math.abs(input.longestFossil - relic.longestFossil) / 64
  );

  return grid * 0.55 + score * 0.2 + piNative * 0.2 + fossil * 0.05;
}

function findMemoryExactDuplicate(
  input: PublishRelicInput,
  artifactHash: string,
  matchHash: string
) {
  const digSite = resolveInputDigSite(input);

  return (
    [...relics().values()]
      .filter((relic) => relic.status !== "hidden")
      .find(
        (relic) =>
          relic.artifactHash === artifactHash ||
          relic.matchHash === matchHash ||
          (relic.mode === input.mode &&
            relic.digSite === digSite.digSite &&
            relic.indexVersion === digSite.indexVersion &&
            relic.shareGrid.trim() === input.shareGrid.trim() &&
            Math.abs(relic.score - input.score) <= 0.05 &&
            Math.abs(relic.piNative - input.piNative) <= 0.05)
      ) ?? null
  );
}

async function findDbExactDuplicate(
  env: EnvLike,
  input: PublishRelicInput,
  artifactHash: string,
  matchHash: string
) {
  if (!env.DB) return null;
  const digSite = resolveInputDigSite(input);

  const row = await env.DB.prepare(
    `SELECT * FROM relics
     WHERE status != 'hidden'
       AND (
         artifact_hash = ?
         OR match_hash = ?
         OR (
           mode = ?
           AND dig_site = ?
           AND (index_version IS NULL OR index_version = ?)
           AND share_grid = ?
           AND ABS(score - ?) <= 0.05
           AND ABS(pi_native - ?) <= 0.05
         )
       )
     ORDER BY views DESC, created_at ASC
     LIMIT 1`
  )
    .bind(
      artifactHash,
      matchHash,
      input.mode,
      digSite.digSite,
      digSite.indexVersion,
      input.shareGrid.trim(),
      input.score,
      input.piNative
    )
    .first<DbRelic>();

  return row ? dbToRelic(row) : null;
}

function bestNearMatch(
  input: PublishRelicInput,
  records: RelicRecord[],
  excludeId?: string
): RelicMatch | null {
  let best: RelicMatch | null = null;

  for (const relic of records) {
    if (relic.id === excludeId || !visibleRelicsOnly(relic)) continue;

    const similarity = relicSimilarity(input, relic);
    if (similarity < 0.82) continue;

    if (!best || similarity > best.similarity) {
      best = {
        relic,
        similarity: Math.round(similarity * 1000) / 10
      };
    }
  }

  return best;
}

async function findNearMatch(
  env: EnvLike | undefined,
  input: PublishRelicInput,
  excludeId?: string
) {
  const digSite = resolveInputDigSite(input);

  if (env?.DB) {
    const result = await env.DB.prepare(
      `SELECT * FROM relics
       WHERE status IN ('public', 'curated')
         AND mode = ?
         AND dig_site = ?
         AND (index_version IS NULL OR index_version = ?)
         AND ABS(score - ?) <= 14
         AND ABS(pi_native - ?) <= 14
       ORDER BY views DESC, score DESC, created_at DESC
       LIMIT 96`
    )
      .bind(
        input.mode,
        digSite.digSite,
        digSite.indexVersion,
        input.score,
        input.piNative
      )
      .all<DbRelic>();

    return bestNearMatch(input, result.results.map(dbToRelic), excludeId);
  }

  return bestNearMatch(input, [...relics().values()], excludeId);
}

export function publicArtifactUrl(key: string) {
  return `/artifacts/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function createRelic(
  env: EnvLike | undefined,
  input: PublishRelicInput
): Promise<CreateRelicResult> {
  if (input.demo) {
    throw new Error("Demo specimens do not enter the museum");
  }

  const digSite = resolveInputDigSite(input);
  const artifact = decodeDataUrl(input.relicImage);
  const card = decodeDataUrl(input.cardImage);
  const artifactHash = await sha256Hex(artifact.bytes);
  const matchHash = await sha256Hex(matchSource(input));

  if (artifact.bytes.byteLength > 4_500_000 || card.bytes.byteLength > 4_500_000) {
    throw new Error("Generated artifact is too large to publish");
  }

  const exactDuplicate = env?.DB
    ? await findDbExactDuplicate(env, input, artifactHash, matchHash)
    : findMemoryExactDuplicate(input, artifactHash, matchHash);

  if (exactDuplicate) {
    return {
      relic: exactDuplicate,
      duplicate: true,
      nearMatch: null
    };
  }

  const nearMatch = await findNearMatch(env, input);
  const id = randomId();
  const createdAt = new Date().toISOString();
  const artifactKey = `relics/${id}/relic.png`;
  const cardKey = `relics/${id}/card.png`;

  const record: RelicRecord = {
    id,
    title: safeTitle(input.title),
    mode: input.mode,
    rarity: input.rarity,
    score: input.score,
    piNative: input.piNative,
    exactPct: input.exactPct,
    nearPct: input.nearPct,
    lossyPct: input.lossyPct,
    earthPct: input.earthPct,
    longestFossil: input.longestFossil,
    digSite: digSite.digSite,
    indexVersion: digSite.indexVersion,
    indexChecksum: digSite.indexChecksum,
    searchedDigits: digSite.searchedDigits,
    indexedFragments: digSite.indexedFragments,
    shareGrid: input.shareGrid,
    summary: input.summary,
    artifactKey,
    cardKey,
    artifactHash,
    matchHash,
    status: "public",
    views: 0,
    createdAt
  };

  if (env?.RELIC_BUCKET) {
    await Promise.all([
      env.RELIC_BUCKET.put(artifactKey, artifact.bytes, {
        httpMetadata: {
          contentType: artifact.contentType,
          cacheControl: "public, max-age=31536000, immutable"
        }
      }),
      env.RELIC_BUCKET.put(cardKey, card.bytes, {
        httpMetadata: {
          contentType: card.contentType,
          cacheControl: "public, max-age=31536000, immutable"
        }
      })
    ]);
  } else {
    artifacts().set(artifactKey, {
      bytes: artifact.bytes,
      contentType: artifact.contentType
    });
    artifacts().set(cardKey, {
      bytes: card.bytes,
      contentType: card.contentType
    });
  }

  if (env?.DB) {
    await env.DB.prepare(
      `INSERT INTO relics (
        id, title, mode, rarity, score, pi_native, exact_pct, near_pct,
        lossy_pct, earth_pct, longest_fossil, dig_site, index_version,
        index_checksum, searched_digits, indexed_fragments, share_grid, summary,
        artifact_key, card_key, artifact_hash, match_hash, status, views,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        record.id,
        record.title,
        record.mode,
        record.rarity,
        record.score,
        record.piNative,
        record.exactPct,
        record.nearPct,
        record.lossyPct,
        record.earthPct,
        record.longestFossil,
        record.digSite,
        record.indexVersion,
        record.indexChecksum,
        record.searchedDigits,
        record.indexedFragments,
        record.shareGrid,
        record.summary,
        record.artifactKey,
        record.cardKey,
        record.artifactHash,
        record.matchHash,
        record.status,
        record.views,
        record.createdAt
      )
      .run();
  } else {
    relics().set(id, record);
  }

  return {
    relic: record,
    duplicate: false,
    nearMatch
  };
}

export async function listRelics(env: EnvLike | undefined, limit = 24) {
  const boundedLimit = Math.max(1, Math.min(72, limit));

  if (env?.DB) {
    const result = await env.DB.prepare(
      `SELECT * FROM relics
       WHERE status IN ('public', 'curated')
       ORDER BY views DESC, score DESC, created_at DESC
       LIMIT ?`
    )
      .bind(Math.min(216, boundedLimit * 3))
      .all<DbRelic>();

    return dedupeRelics(result.results.map(dbToRelic), boundedLimit);
  }

  const sorted = [...relics().values()]
    .filter((relic) => relic.status === "public" || relic.status === "curated")
    .sort(
      (a, b) =>
        b.views - a.views ||
        b.score - a.score ||
        b.createdAt.localeCompare(a.createdAt)
    );

  return dedupeRelics(sorted, boundedLimit);
}

export async function getRandomRelic(env: EnvLike | undefined) {
  if (env?.DB) {
    const result = await env.DB.prepare(
      `SELECT * FROM relics
       WHERE status IN ('public', 'curated')
       ORDER BY RANDOM()
       LIMIT 96`
    ).all<DbRelic>();
    const candidates = dedupeRelics(result.results.map(dbToRelic), 96);
    if (candidates.length === 0) return null;

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  const publicRelics = dedupeRelics(
    [...relics().values()].filter(visibleRelicsOnly),
    96
  );

  if (publicRelics.length === 0) return null;

  const index = Math.floor(Math.random() * publicRelics.length);
  return publicRelics[index];
}

export async function getRelic(env: EnvLike | undefined, id: string) {
  if (env?.DB) {
    const row = await env.DB.prepare("SELECT * FROM relics WHERE id = ?")
      .bind(id)
      .first<DbRelic>();

    return row ? dbToRelic(row) : null;
  }

  return relics().get(id) ?? null;
}

export async function recordView(
  env: EnvLike | undefined,
  id: string,
  weight = 1
) {
  const boundedWeight = Math.max(1, Math.min(64, Math.round(weight)));

  if (env?.DB) {
    await env.DB.prepare(
      "UPDATE relics SET views = views + ? WHERE id = ? AND status != 'hidden'"
    )
      .bind(boundedWeight, id)
      .run();
    return;
  }

  const relic = relics().get(id);
  if (relic && relic.status !== "hidden") {
    relic.views += boundedWeight;
    relics().set(id, relic);
  }
}

export async function getArtifact(env: EnvLike | undefined, key: string) {
  if (env?.RELIC_BUCKET) {
    const object = await env.RELIC_BUCKET.get(key);
    if (!object) return null;

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "image/png",
      cacheControl:
        object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable"
    };
  }

  const artifact = artifacts().get(key);
  if (!artifact) return null;

  return {
    body: artifact.bytes,
    contentType: artifact.contentType,
    cacheControl: "public, max-age=60"
  };
}
