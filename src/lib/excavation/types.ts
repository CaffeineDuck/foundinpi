export type ExcavationMode =
  | "museum"
  | "deep"
  | "cursed"
  | "holy"
  | "scientific";

export type TileClass = "exact" | "near" | "lossy" | "earth";

export type TileExcavation = {
  x: number;
  y: number;
  width: number;
  height: number;
  className: TileClass;
  distance: number;
  coordinate: string;
  source: [number, number, number];
  recovered: [number, number, number];
  signature: number[];
  exactSignature: boolean;
};

export type ExcavationSummary = {
  relicName: string;
  seed: string;
  score: number;
  piNative: number;
  exactPct: number;
  nearPct: number;
  lossyPct: number;
  earthPct: number;
  rarity: string;
  longestFossil: number;
  digSite: string;
  indexedFragments: number;
  searchedDigits: number;
  indexVersion: string;
  indexChecksum: string;
  shareGrid: string;
  summary: string;
};

export type ExcavationResult = {
  width: number;
  height: number;
  tiles: TileExcavation[];
  summary: ExcavationSummary;
  relicBuffer: ArrayBuffer;
  heatmapBuffer: ArrayBuffer;
};

export type WorkerRequest = {
  jobId: number;
  width: number;
  height: number;
  imageBuffer: ArrayBuffer;
  mode: ExcavationMode;
  tileSize: number;
};

export type WorkerResponse =
  | {
      type: "progress";
      jobId: number;
      progress: number;
      label: string;
    }
  | {
      type: "result";
      jobId: number;
      result: ExcavationResult;
    }
  | {
      type: "error";
      jobId: number;
      message: string;
    };
