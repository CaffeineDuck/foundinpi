import type { ExcavationMode, TileClass } from "./types";

export const DIG_SITE_FRAGMENT_DIGITS = 32;
export const DIG_SITE_FRAGMENT_STRIDE = 7;
export const DIG_SITE_FRAGMENT_BYTES = 3;
export const DIG_SITE_INDEX_BYTES_V1 = 11;
export const DIG_SITE_INDEX_BYTES_V2 = 19;

export const DIG_SITES = [
  {
    id: "dig-site-i",
    shortLabel: "Dig Site I",
    label:
      "Dig Site I: first 1,000,000 decimal digits of pi, indexed as v2 patch descriptors",
    indexVersion: "pi32-1m-v2",
    indexUrl: "/dig-sites/pi32-1m-v2.bin",
    indexChecksum:
      "3fbd4e1c2487913d884fcae1283c0bf26e6e4e0adc8e3c6f8b113d8c2a645672",
    packedFragmentBytes: DIG_SITE_INDEX_BYTES_V2,
    digits: 1_000_000,
    indexedFragments: 142_853,
    depthLabel: "1M digits",
    note: "Patch match"
  },
  {
    id: "dig-site-ii",
    shortLabel: "Dig Site II",
    label:
      "Dig Site II: first 10,000,000 decimal digits of pi, indexed as v2 patch descriptors",
    indexVersion: "pi32-10m-v2",
    indexUrl: "/dig-sites/pi32-10m-v2.bin",
    indexChecksum:
      "1c91437fa50634f2a09cfa0374079391ffde37e8552de8bb3f922daf67ad61f2",
    packedFragmentBytes: DIG_SITE_INDEX_BYTES_V2,
    digits: 10_000_000,
    indexedFragments: 1_428_567,
    depthLabel: "10M digits",
    note: "Deeper patch match"
  }
] as const;

export type DigSite = (typeof DIG_SITES)[number];
export type DigSiteId = DigSite["id"];

export const DIG_SITE_HISTORY = [
  ...DIG_SITES,
  {
    id: "dig-site-i-v1",
    shortLabel: "Dig Site I",
    label:
      "Dig Site I: first 1,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments",
    indexVersion: "pi32-1m-v1",
    indexUrl: "/dig-sites/pi32-1m-v1.bin",
    indexChecksum:
      "555ee7260f240b7a6808aafcaac31d1ace809b3d8e55da4245f6a92c3974fe66",
    packedFragmentBytes: DIG_SITE_INDEX_BYTES_V1,
    digits: 1_000_000,
    indexedFragments: 142_853,
    depthLabel: "1M digits",
    note: "Legacy visual fragments"
  },
  {
    id: "dig-site-ii-v1",
    shortLabel: "Dig Site II",
    label:
      "Dig Site II: first 10,000,000 decimal digits of pi, indexed as overlapping 32-digit visual fragments",
    indexVersion: "pi32-10m-v1",
    indexUrl: "/dig-sites/pi32-10m-v1.bin",
    indexChecksum:
      "ea6785ba281de9ae879fa730ba70662d729d1dd5600d12de7d1734315b0f5359",
    packedFragmentBytes: DIG_SITE_INDEX_BYTES_V1,
    digits: 10_000_000,
    indexedFragments: 1_428_567,
    depthLabel: "10M digits",
    note: "Legacy visual fragments"
  }
] as const;

export const DEFAULT_DIG_SITE_ID = "dig-site-i" satisfies DigSiteId;
export const DEFAULT_DIG_SITE = DIG_SITES[0];

export function getDigSite(id: string | undefined): DigSite {
  return DIG_SITES.find((site) => site.id === id) ?? DEFAULT_DIG_SITE;
}

export const DIG_SITE_DIGITS = DEFAULT_DIG_SITE.digits;
export const DIG_SITE_INDEX_VERSION = DEFAULT_DIG_SITE.indexVersion;
export const DIG_SITE_INDEX_URL = DEFAULT_DIG_SITE.indexUrl;
export const DIG_SITE_INDEX_SHA256 = DEFAULT_DIG_SITE.indexChecksum;
export const DIG_SITE_LABEL = DEFAULT_DIG_SITE.label;

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
