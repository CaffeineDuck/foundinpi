import type { ExcavationMode, TileClass } from "./types";

export const DIG_SITE_DIGITS = 1_000_000;
export const DIG_SITE_FRAGMENT_DIGITS = 32;
export const DIG_SITE_FRAGMENT_STRIDE = 7;
export const DIG_SITE_FRAGMENT_BYTES = 3;
export const DIG_SITE_INDEX_VERSION = "pi32-1m-v1";
export const DIG_SITE_INDEX_URL = "/dig-sites/pi32-1m-v1.bin";
export const DIG_SITE_INDEX_SHA256 =
  "555ee7260f240b7a6808aafcaac31d1ace809b3d8e55da4245f6a92c3974fe66";

export const DIG_SITE_LABEL =
  "Dig Site I: first 1,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments";

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
