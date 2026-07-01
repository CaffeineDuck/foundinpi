import type { ExcavationMode, TileClass } from "./types";

export const DIG_SITE_DIGITS = 10_000_000;
export const DIG_SITE_FRAGMENT_DIGITS = 32;
export const DIG_SITE_FRAGMENT_STRIDE = 7;
export const DIG_SITE_FRAGMENT_BYTES = 3;
export const DIG_SITE_INDEX_VERSION = "pi32-10m-v1";
export const DIG_SITE_INDEX_URL = "/dig-sites/pi32-10m-v1.bin";
export const DIG_SITE_INDEX_SHA256 =
  "ea6785ba281de9ae879fa730ba70662d729d1dd5600d12de7d1734315b0f5359";

export const DIG_SITE_LABEL =
  "Dig Site I: first 10,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments";

export const TILE_CLASS_LABELS: Record<TileClass, string> = {
  exact: "Exact Pi",
  near: "Near Pi",
  lossy: "Lossy Pi",
  earth: "Earth Bytes"
};

export const TILE_CLASS_COLORS: Record<TileClass, string> = {
  exact: "#39b36b",
  near: "#d4a72c",
  lossy: "#6ca6d9",
  earth: "#191919"
};

export const MODES: Record<
  ExcavationMode,
  {
    label: string;
    short: string;
  }
> = {
  museum: {
    label: "Museum Restoration",
    short: "Restored"
  },
  deep: {
    label: "Deep Relic",
    short: "Deep"
  },
  cursed: {
    label: "Cursed Pi",
    short: "Cursed"
  },
  holy: {
    label: "Holy Fragment",
    short: "Holy"
  },
  scientific: {
    label: "Scientific Plate",
    short: "Plate"
  }
};
