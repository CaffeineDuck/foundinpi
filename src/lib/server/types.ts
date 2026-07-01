import type { ExcavationMode } from "../excavation/types";

export type RelicStatus = "public" | "curated" | "hidden";

export type RelicRecord = {
  id: string;
  title: string;
  mode: ExcavationMode;
  rarity: string;
  score: number;
  piNative: number;
  exactPct: number;
  nearPct: number;
  lossyPct: number;
  earthPct: number;
  longestFossil: number;
  digSite: string;
  shareGrid: string;
  summary: string;
  artifactKey: string;
  cardKey: string;
  artifactHash: string | null;
  matchHash: string | null;
  status: RelicStatus;
  views: number;
  createdAt: string;
};

export type RelicMatch = {
  relic: RelicRecord;
  similarity: number;
};

export type CreateRelicResult = {
  relic: RelicRecord;
  duplicate: boolean;
  nearMatch: RelicMatch | null;
};

export type PublishRelicInput = {
  title?: string;
  demo?: boolean;
  mode: ExcavationMode;
  rarity: string;
  score: number;
  piNative: number;
  exactPct: number;
  nearPct: number;
  lossyPct: number;
  earthPct: number;
  longestFossil: number;
  digSite: string;
  shareGrid: string;
  summary: string;
  relicImage: string;
  cardImage: string;
};

export type Artifact = {
  body: Uint8Array | ReadableStream;
  contentType: string;
  cacheControl?: string;
};
