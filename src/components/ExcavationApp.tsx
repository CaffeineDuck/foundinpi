import {
  Copy,
  Download,
  Eye,
  FlaskConical,
  Grid3X3,
  ImagePlus,
  Info,
  Landmark,
  Layers,
  Link,
  LoaderCircle,
  Pickaxe,
  Shuffle,
  ScanSearch,
  Share2,
  Sparkles,
  Sun,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DIG_SITE_ID,
  DIG_SITES,
  MODES,
  TILE_CLASS_COLORS,
  TILE_CLASS_LABELS,
  type DigSiteId
} from "../lib/excavation/constants";
import type {
  ExcavationMode,
  ExcavationResult,
  TileClass,
  TileExcavation,
  WorkerResponse
} from "../lib/excavation/types";
import "../styles/dig-site.css";

type PublishState =
  | { status: "idle" }
  | { status: "publishing" }
  | {
      status: "published";
      url: string;
      id: string;
      duplicate: boolean;
      nearMatch: PublishMatch | null;
    }
  | { status: "error"; message: string };

type PublishMatch = {
  relic: {
    id: string;
    title: string;
  };
  similarity: number;
  url: string;
};

type PublishResponse = {
  error?: string;
  duplicate?: boolean;
  nearMatch?: PublishMatch | null;
  url?: string;
  relic?: {
    id: string;
  };
};

const MODES_IN_ORDER: ExcavationMode[] = [
  "museum",
  "deep",
  "cursed",
  "holy",
  "scientific"
];

const DIG_SITE_STORAGE_KEY = "foundinpi:dig-site";

// Streamed under the viewport before a specimen is loaded.
const PI_DIGIT_CHUNKS = [
  "14159 26535",
  "89793 23846",
  "26433 83279",
  "50288 41971",
  "69399 37510",
  "58209 74944",
  "59230 78164",
  "06286 20899",
  "86280 34825",
  "34211 70679"
];

// One-line character notes for each reconstruction mode.
const MODE_DESC: Record<ExcavationMode, string> = {
  museum: "Faithful & clean",
  deep: "Crunchy, pi-native",
  cursed: "Aggressive artifacts",
  holy: "High-contrast",
  scientific: "Grayscale plate"
};

const MODE_ICON: Record<ExcavationMode, LucideIcon> = {
  museum: Landmark,
  deep: Layers,
  cursed: Zap,
  holy: Sun,
  scientific: FlaskConical
};

// Maps share-grid glyphs back to a tile class for the coloured mini-map.
const GLYPH_CLASS: Record<string, TileClass> = {
  "🟩": "exact",
  "🟨": "near",
  "⬜": "lossy",
  "⬛": "earth"
};

const BREAKDOWN: ReadonlyArray<{ k: TileClass; label: string }> = [
  { k: "exact", label: "Exact Pi" },
  { k: "near", label: "Near Pi" },
  { k: "lossy", label: "Lossy Pi" },
  { k: "earth", label: "Earth Bytes" }
];

// plain-language explanation of each match type (used in tooltips)
const CLASS_TIP: Record<TileClass, string> = {
  exact: "An extremely tight pi fragment at this tile scale.",
  near: "A close pi fragment with small visual drift.",
  lossy: "A weak pi fragment that still carries the rough shape or color.",
  earth: "No credible pi fit in this dig site; rendered as dark pi-derived fill."
};

function isDigSiteId(value: string | null): value is DigSiteId {
  return DIG_SITES.some((site) => site.id === value);
}

// Eases a number up to its target whenever `resetKey` changes.
function useCountUp(target: number, resetKey: string | number) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 850;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return value;
}

function drawImageContained(image: HTMLImageElement | ImageBitmap) {
  const maxSide = 860;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Canvas is unavailable");

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#f6f7f4";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    canvas,
    width,
    height,
    imageData: context.getImageData(0, 0, width, height)
  };
}

function imageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image"));
    };
    image.src = url;
  });
}

function sampleFile() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  canvas.width = 820;
  canvas.height = 620;
  context.fillStyle = "#f6f7f4";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const ratio = y / canvas.height;
    context.fillStyle = `rgb(${Math.round(34 + ratio * 42)}, ${Math.round(
      68 + ratio * 74
    )}, ${Math.round(52 + ratio * 42)})`;
    context.fillRect(0, y, canvas.width, 1);
  }

  context.fillStyle = "#c18a21";
  context.fillRect(96, 96, 230, 410);
  context.fillStyle = "#171814";
  context.fillRect(132, 132, 162, 338);
  context.fillStyle = "#f7f8f3";
  context.font = "900 150px Georgia, serif";
  context.fillText("π", 168, 332);

  context.fillStyle = "#a74336";
  context.beginPath();
  context.arc(560, 248, 118, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f7f8f3";
  context.beginPath();
  context.arc(590, 218, 42, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(247, 248, 243, 0.58)";
  context.lineWidth = 7;
  for (let offset = -280; offset < 980; offset += 58) {
    context.beginPath();
    context.moveTo(offset, 620);
    context.lineTo(offset + 420, 0);
    context.stroke();
  }

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create sample image"));
        return;
      }
      resolve(new File([blob], "sample-relic.png", { type: "image/png" }));
    }, "image/png");
  });
}

function drawResultCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  buffer: ArrayBuffer
) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = width;
  canvas.height = height;
  context.putImageData(
    new ImageData(new Uint8ClampedArray(buffer), width, height),
    0,
    0
  );
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = x + (width - drawWidth) / 2;
  const dy = y + (height - drawHeight) / 2;
  context.drawImage(source, dx, dy, drawWidth, drawHeight);
}

function drawShareGrid(
  context: CanvasRenderingContext2D,
  grid: string,
  x: number,
  y: number,
  cell: number,
  colors: Record<TileClass, string> = TILE_CLASS_COLORS
) {
  const colorMap: Record<string, string> = {
    "🟩": colors.exact,
    "🟨": colors.near,
    "⬜": colors.lossy,
    "⬛": colors.earth
  };
  const rows = grid.split("\n");

  rows.forEach((row, rowIndex) => {
    Array.from(row).forEach((glyph, colIndex) => {
      context.fillStyle = colorMap[glyph] ?? "#d7d9d4";
      roundedRect(
        context,
        x + colIndex * (cell + 5),
        y + rowIndex * (cell + 5),
        cell,
        cell,
        4
      );
      context.fill();
    });
  });
}

function buildShareText(
  result: ExcavationResult,
  publicUrl: string | null,
  id: string | null
) {
  const label = id
    ? `${result.summary.relicName} #${id}`
    : result.summary.relicName;
  const url = publicUrl ?? "foundinpi.com";

  return `${label}
${result.summary.piNative.toFixed(1)}% pi-native
Longest fossil: ${result.summary.longestFossil} bytes
Rarity: ${result.summary.rarity}
${result.summary.digSite.split(":")[0]}
${result.summary.shareGrid}
${url}`;
}

function tileAt(
  tiles: TileExcavation[],
  point: { x: number; y: number } | null
) {
  if (!point) return null;
  return (
    tiles.find(
      (tile) =>
        point.x >= tile.x &&
        point.x < tile.x + tile.width &&
        point.y >= tile.y &&
        point.y < tile.y + tile.height
    ) ?? null
  );
}

export default function ExcavationApp() {
  const [mode, setMode] = useState<ExcavationMode>("museum");
  const [digSiteId, setDigSiteId] =
    useState<DigSiteId>(DEFAULT_DIG_SITE_ID);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ExcavationResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Awaiting specimen");
  const [isWorking, setIsWorking] = useState(false);
  const [slider, setSlider] = useState(58);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [publishState, setPublishState] = useState<PublishState>({
    status: "idle"
  });
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDemoSpecimen, setIsDemoSpecimen] = useState(false);
  const shareMsgTimer = useRef<number | null>(null);

  const relicCanvas = useRef<HTMLCanvasElement | null>(null);
  const heatmapCanvas = useRef<HTMLCanvasElement | null>(null);
  const imageStage = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastIsDemoRef = useRef(false);
  const activeJobIdRef = useRef(0);
  const workingRef = useRef(false);

  const activeTile = useMemo(
    () => tileAt(result?.tiles ?? [], hoverPoint),
    [hoverPoint, result]
  );
  const activeDigSite = useMemo(
    () => DIG_SITES.find((site) => site.id === digSiteId) ?? DIG_SITES[0],
    [digSiteId]
  );

  const stageState = isWorking ? "working" : result ? "ready" : "idle";
  const phase: "intro" | "scanning" | "relic" =
    !sourceUrl && !isWorking ? "intro" : result && !isWorking ? "relic" : "scanning";

  const coordItems = useMemo(() => {
    if (result) {
      const picks = result.tiles
        .filter((tile) => tile.className === "exact" || tile.className === "near")
        .slice(0, 18)
        .map((tile) => tile.coordinate);
      if (picks.length) return picks;
    }
    return PI_DIGIT_CHUNKS;
  }, [result]);

  const shownPct = useCountUp(
    result?.summary.piNative ?? 0,
    result?.summary.seed ?? "idle"
  );

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(DIG_SITE_STORAGE_KEY);
    if (isDigSiteId(saved)) setDigSiteId(saved);
  }, []);

  useEffect(() => {
    if (!result) return;
    drawResultCanvas(
      relicCanvas.current,
      result.width,
      result.height,
      result.relicBuffer
    );
    drawResultCanvas(
      heatmapCanvas.current,
      result.width,
      result.height,
      result.heatmapBuffer
    );
  }, [result]);

  function createWorker() {
    const worker = new Worker(
      new URL("../lib/excavation/worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.jobId !== activeJobIdRef.current) return;

      if (event.data.type === "progress") {
        setProgress(event.data.progress);
        setProgressLabel(event.data.label);
        return;
      }

      workingRef.current = false;

      if (event.data.type === "error") {
        setIsWorking(false);
        setProgressLabel(event.data.message);
        return;
      }

      setProgress(1);
      setProgressLabel("Relic cataloged");
      setResult(event.data.result);
      setSlider(100);
      setIsWorking(false);
    };

    return worker;
  }

  function getWorker() {
    if (workingRef.current) {
      workerRef.current?.terminate();
      workerRef.current = null;
    }

    workerRef.current ??= createWorker();

    return workerRef.current;
  }

  async function excavate(
    file: File,
    nextMode = mode,
    options?: { demo?: boolean; digSiteId?: DigSiteId }
  ) {
    if (!file.type.startsWith("image/")) {
      setProgressLabel("Choose an image file");
      return;
    }

    const isDemo = options?.demo ?? lastIsDemoRef.current;
    const selectedDigSite =
      DIG_SITES.find((site) => site.id === options?.digSiteId) ?? activeDigSite;
    setIsWorking(true);
    setProgress(0.03);
    setProgressLabel("Preparing specimen");
    setPublishState({ status: "idle" });
    setShareMsg(null);
    setResult(null);
    setSlider(0);
    lastFileRef.current = file;
    lastIsDemoRef.current = isDemo;
    setIsDemoSpecimen(isDemo);

    try {
      const image = await imageFromFile(file);
      const prepared = drawImageContained(image);
      const tileSize = Math.max(
        10,
        Math.min(28, Math.round(Math.min(prepared.width, prepared.height) / 32))
      );

      setSourceUrl(prepared.canvas.toDataURL("image/png"));
      setProgress(0.07);
      setProgressLabel(`Opening ${selectedDigSite.shortLabel}`);

      const jobId = activeJobIdRef.current + 1;
      activeJobIdRef.current = jobId;
      const worker = getWorker();
      workingRef.current = true;

      worker.postMessage(
        {
          jobId,
          width: prepared.width,
          height: prepared.height,
          imageBuffer: prepared.imageData.data.buffer,
          mode: nextMode,
          digSiteId: selectedDigSite.id,
          tileSize
        },
        [prepared.imageData.data.buffer]
      );
    } catch (error) {
      workingRef.current = false;
      setIsWorking(false);
      setProgressLabel(
        error instanceof Error ? error.message : "Unable to excavate image"
      );
    }
  }

  function handleFileList(files: FileList | null) {
    const file = files?.[0];
    if (file) void excavate(file, mode, { demo: false, digSiteId });
  }

  async function excavateSample() {
    const file = await sampleFile();
    void excavate(file, mode, { demo: true, digSiteId });
  }

  function chooseDigSite(nextDigSiteId: DigSiteId) {
    if (nextDigSiteId === digSiteId) return;

    setDigSiteId(nextDigSiteId);
    window.localStorage.setItem(DIG_SITE_STORAGE_KEY, nextDigSiteId);

    if (lastFileRef.current) {
      void excavate(lastFileRef.current, mode, {
        demo: lastIsDemoRef.current,
        digSiteId: nextDigSiteId
      });
    }
  }

  function digSiteSelector(className = "") {
    return (
      <div className="tool-group">
        <span className="tool-group-label">Dig depth — how much of π to search</span>
        <div
          className={`mode-seg dig-site-seg ${className}`.trim()}
          role="group"
          aria-label="How deep to dig into pi"
        >
          {DIG_SITES.map((site) => (
            <button
              key={site.id}
              className={
                site.id === digSiteId
                  ? "mode-card dig-site-card active"
                  : "mode-card dig-site-card"
              }
              type="button"
              disabled={isWorking}
              aria-pressed={site.id === digSiteId}
              title={`Search the first ${site.digits.toLocaleString()} digits of pi`}
              onClick={() => chooseDigSite(site.id)}
            >
              <span className="mode-top">
                <Pickaxe size={15} aria-hidden="true" />
                {site.depthLabel}
              </span>
              <em>{site.note}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function handleStageMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!result || !imageStage.current) return;
    const rect = imageStage.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * result.width;
    const y = ((event.clientY - rect.top) / rect.height) * result.height;
    setHoverPoint({ x, y });
  }

  async function drawCardCanvas(): Promise<HTMLCanvasElement> {
    if (!result || !relicCanvas.current) {
      throw new Error("No relic to export");
    }
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* best-effort font readiness */
      }
    }

    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const tone = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;

    const bg = tone("--bg", "#d7d5ce");
    const ink = tone("--ink", "#1a1915");
    const inkDim = tone("--ink-dim", "#56544c");
    const muted = tone("--muted", "#86847a");
    const accent = tone("--accent", "#ff4d00");
    const gold = tone("--gold", "#a9781f");
    const line = tone("--line-strong", "#a09d90");
    const gridColors: Record<TileClass, string> = {
      exact: tone("--exact", "#1f7a3d"),
      near: tone("--near", "#d98a00"),
      lossy: tone("--lossy", "#2f6db0"),
      earth: tone("--earth", "#8f8c82")
    };
    const light = true; // Field Instrument is a light concrete card
    const display = "Archivo";
    const mono = "IBM Plex Mono";

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 630);
    if (!light) {
      const glow = ctx.createRadialGradient(560, 90, 80, 560, 340, 860);
      glow.addColorStop(0, "rgba(0,0,0,0)");
      glow.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1200, 630);
    }

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.strokeRect(24.5, 24.5, 1151, 581);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = `900 26px ${display}, sans-serif`;
    ctx.fillText("◆ FOUND IN PI", 48, 74);
    ctx.textAlign = "right";
    ctx.fillStyle = muted;
    ctx.font = `700 15px ${mono}, monospace`;
    ctx.fillText(
      `${result.summary.digSite.split(":")[0].toUpperCase()} · foundinpi.com`,
      1152,
      72
    );
    ctx.textAlign = "left";
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(48, 96);
    ctx.lineTo(1152, 96);
    ctx.stroke();

    const ix = 48;
    const iy = 128;
    const iw = 496;
    const ih = 454;
    ctx.save();
    roundedRect(ctx, ix, iy, iw, ih, 6);
    ctx.clip();
    drawCover(ctx, relicCanvas.current, result.width, result.height, ix, iy, iw, ih);
    ctx.restore();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundedRect(ctx, ix, iy, iw, ih, 6);
    ctx.stroke();

    const chip = MODES[mode].label.toUpperCase();
    ctx.font = `700 13px ${mono}, monospace`;
    const chipW = ctx.measureText(chip).width + 24;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    roundedRect(ctx, ix + 14, iy + 14, chipW, 28, 4);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillText(chip, ix + 26, iy + 32);

    const rx = 592;
    ctx.fillStyle = ink;
    ctx.font = `800 30px ${display}, sans-serif`;
    let name = result.summary.relicName;
    if (ctx.measureText(name).width > 560) {
      while (name.length > 4 && ctx.measureText(`${name}…`).width > 560) {
        name = name.slice(0, -1);
      }
      name = `${name.trimEnd()}…`;
    }
    ctx.fillText(name, rx, 176);

    ctx.fillStyle = accent;
    ctx.font = `800 94px ${display}, sans-serif`;
    const score = result.summary.piNative.toFixed(1);
    ctx.fillText(score, rx, 278);
    const scoreW = ctx.measureText(score).width;
    ctx.font = `800 38px ${display}, sans-serif`;
    ctx.fillText("%", rx + scoreW + 8, 278);
    ctx.fillStyle = muted;
    ctx.font = `700 15px ${mono}, monospace`;
    ctx.fillText("PI-NATIVE", rx + 2, 306);

    ctx.font = `700 16px ${mono}, monospace`;
    const rarity = result.summary.rarity.toUpperCase();
    const pillW = ctx.measureText(rarity).width + 34;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5;
    roundedRect(ctx, rx, 330, pillW, 40, 20);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.fillText(rarity, rx + 17, 356);

    ctx.fillStyle = inkDim;
    ctx.font = `700 15px ${mono}, monospace`;
    ctx.fillText(
      `LONGEST FOSSIL ${result.summary.longestFossil}B   ·   SCORE ${result.summary.score.toFixed(1)}`,
      rx,
      414
    );

    ctx.fillStyle = muted;
    ctx.font = `700 13px ${mono}, monospace`;
    ctx.fillText("EXCAVATION MAP", rx, 448);
    drawShareGrid(ctx, result.summary.shareGrid, rx, 460, 15, gridColors);

    ctx.fillStyle = muted;
    ctx.font = `400 14px ${mono}, monospace`;
    ctx.fillText("We have not searched all of pi. No one has.", 48, 600);

    return canvas;
  }

  async function renderCardDataUrl() {
    return (await drawCardCanvas()).toDataURL("image/png");
  }

  function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to render card image"));
      }, "image/png");
    });
  }

  function flashShare(message: string) {
    setShareMsg(message);
    if (shareMsgTimer.current) window.clearTimeout(shareMsgTimer.current);
    shareMsgTimer.current = window.setTimeout(() => setShareMsg(null), 2000);
  }

  async function publish(): Promise<{ url: string; id: string } | null> {
    if (!result || !relicCanvas.current) return null;
    if (publishState.status === "published") {
      return { url: publishState.url, id: publishState.id };
    }
    if (isDemoSpecimen) {
      setPublishState({
        status: "error",
        message: "Demo specimens stay private — upload your own image to publish."
      });
      return null;
    }

    setPublishState({ status: "publishing" });
    try {
      const cardImage = await renderCardDataUrl();
      const relicImage = relicCanvas.current.toDataURL("image/png");
      const response = await fetch("/api/relics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: result.summary.relicName,
          demo: isDemoSpecimen,
          mode,
          ...result.summary,
          relicImage,
          cardImage
        })
      });
      const body = (await response.json()) as PublishResponse;
      if (!response.ok) throw new Error(body.error ?? "Unable to publish relic");
      if (!body.url || !body.relic?.id) {
        throw new Error("Publish response was incomplete");
      }
      const url = new URL(body.url, window.location.origin).toString();
      const id = body.relic.id;
      setPublishState({
        status: "published",
        url,
        id,
        duplicate: body.duplicate === true,
        nearMatch: body.nearMatch
          ? {
              ...body.nearMatch,
              url: new URL(body.nearMatch.url, window.location.origin).toString()
            }
          : null
      });
      return { url, id };
    } catch (error) {
      setPublishState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to publish"
      });
      return null;
    }
  }

  async function shareRelic() {
    if (!result) return;
    const published = await publish();
    if (!published) return; // demo / error is surfaced through publishState
    const text = buildShareText(result, published.url, published.id);

    try {
      const file = new File([await canvasToBlob(await drawCardCanvas())], "found-in-pi.png", {
        type: "image/png"
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Found in Pi", text, files: [file] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Found in Pi", text, url: published.url });
        return;
      }
    } catch {
      /* fall through to clipboard copy */
    }
    await navigator.clipboard.writeText(text);
    flashShare("Link + caption copied");
  }

  async function downloadCard() {
    try {
      const url = await renderCardDataUrl();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `found-in-pi-${result?.summary.seed ?? "relic"}.png`;
      anchor.click();
      flashShare("Card downloaded");
    } catch {
      flashShare("Could not render card");
    }
  }

  async function copyImage() {
    try {
      const blob = await canvasToBlob(await drawCardCanvas());
      if (!window.ClipboardItem || !navigator.clipboard?.write) {
        throw new Error("unsupported");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);
      flashShare("Card image copied");
    } catch {
      flashShare("Copy image unsupported — use Download");
    }
  }

  return (
    <div className="app" data-phase={phase} aria-label="Found in Pi excavation app">
      <header className="app-bar screws">
        <a className="wordmark" href="/">
          Found in Pi
        </a>
        <nav className="app-nav" aria-label="Primary">
          <a href="/museum">
            <Eye size={16} aria-hidden="true" />
            Museum
          </a>
          <a href="/random">
            <Shuffle size={16} aria-hidden="true" />
            Random
          </a>
          <a href="/about">
            <Info size={16} aria-hidden="true" />
            About
          </a>
        </nav>
      </header>

      {phase === "intro" ? (
        <section className="intro">
          <div className="ambient-pi" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index}>
                31415926535897932384626433832795028841971693993751058209749445923078164062862089986
              </span>
            ))}
          </div>

          <p className="intro-eyebrow">An internet toy</p>
          <h1 className="intro-title">
            Drop an image.
            <br />
            We&rsquo;ll dig it out of <span className="pi-glyph">π</span>.
          </h1>
          <p className="intro-sub">
            The digits of pi run on forever and never repeat, so little pieces
            of any picture are already hiding inside them. Drop a photo and
            we&rsquo;ll dig yours back out.
          </p>

          <label
            className="drop-hero screws"
            data-drag={isDragging ? "true" : "false"}
            onDragOver={(event) => event.preventDefault()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setIsDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFileList(event.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(event) => handleFileList(event.currentTarget.files)}
            />
            <span className="drop-hero-glow" aria-hidden="true" />
            <span className="drop-hero-icon">
              <ImagePlus size={30} aria-hidden="true" />
            </span>
            <span className="drop-hero-text">
              <strong>Drop an image, or click to browse</strong>
              <small>Private until you publish · JPG, PNG, WebP</small>
            </span>
          </label>

          <div className="intro-or">
            <button
              className="ghost-sample"
              type="button"
              onClick={excavateSample}
            >
              <Pickaxe size={15} aria-hidden="true" />
              or try an example
            </button>
          </div>

          <p className="intro-honesty">
            We dig through a finite slice of pi: 1M digits by default, or 10M
            if you choose Dig Site II. It&rsquo;s a toy, not real compression.
          </p>
        </section>
      ) : (
        <section className="workbench">
          <div className="stage-col">
            <div
              className="stage"
              ref={imageStage}
              data-state={stageState}
              style={{
                aspectRatio: result
                  ? `${result.width} / ${result.height}`
                  : "4 / 3"
              }}
              onPointerMove={handleStageMove}
              onPointerLeave={() => setHoverPoint(null)}
            >
              {sourceUrl ? (
                <img src={sourceUrl} alt="" className="source-image" />
              ) : null}
              <canvas
                ref={relicCanvas}
                className="relic-canvas"
                style={{
                  clipPath: `inset(0 ${100 - slider}% 0 0)`,
                  WebkitClipPath: `inset(0 ${100 - slider}% 0 0)`
                }}
              />
              <canvas
                ref={heatmapCanvas}
                className={`heatmap-canvas ${heatmapVisible ? "visible" : ""}`}
              />
              <div className="stage-fx" aria-hidden="true" />
              {result && !isWorking ? (
                <span
                  className="split-seam"
                  style={{ left: `${slider}%` }}
                  aria-hidden="true"
                />
              ) : null}
              {result && !isWorking ? (
                <div className="stage-badges">
                  <span>{MODES[mode].label}</span>
                  {heatmapVisible ? <span className="hot">Heatmap</span> : null}
                </div>
              ) : null}
              {isWorking ? (
                <div className="scan-overlay">
                  <div className="scan-line" />
                  <div className="scan-reticle" aria-hidden="true" />
                  <LoaderCircle size={22} aria-hidden="true" />
                  <span>{progressLabel}</span>
                </div>
              ) : null}
              {activeTile ? (
                <div className="tile-popover" data-k={activeTile.className}>
                  <strong>{TILE_CLASS_LABELS[activeTile.className]}</strong>
                  <span>π offset {activeTile.coordinate}</span>
                  <small>distance {activeTile.distance}</small>
                </div>
              ) : null}
            </div>

            <div
              className="coord-rail"
              data-live={result ? "true" : "false"}
              aria-hidden="true"
            >
              <div className="coord-rail-track">
                {[...coordItems, ...coordItems].map((item, index) => (
                  <span key={index}>
                    <b>π</b> {item.replace(/^π[:\s]*/, "")}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="progress-rail"
              data-done={result && !isWorking ? "true" : "false"}
              aria-label="Excavation progress"
            >
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>

            <div className="stage-tools">
              {digSiteSelector("dig-site-seg-tools")}

              <div className="tool-group">
                <span className="tool-group-label">Style — how the dug-up image looks</span>
                <div className="mode-seg" role="group" aria-label="Reconstruction style">
                {MODES_IN_ORDER.map((entry) => {
                  const Icon = MODE_ICON[entry];
                  return (
                    <button
                      key={entry}
                      className={entry === mode ? "mode-card active" : "mode-card"}
                      type="button"
                      disabled={isWorking}
                      aria-pressed={entry === mode}
                      title={MODES[entry].label}
                      onClick={() => {
                        setMode(entry);
                        if (lastFileRef.current) {
                          void excavate(lastFileRef.current, entry, {
                            demo: lastIsDemoRef.current,
                            digSiteId
                          });
                        }
                      }}
                    >
                      <span className="mode-top">
                        <Icon size={15} aria-hidden="true" />
                        {MODES[entry].short}
                      </span>
                      <em>{MODE_DESC[entry]}</em>
                    </button>
                  );
                })}
                </div>
              </div>

              <div className="stage-tool-row">
                <label className="range-tool" data-disabled={!result}>
                  <span>Reveal</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={slider}
                    disabled={!result}
                    style={{ ["--fill" as string]: `${slider}%` } as React.CSSProperties}
                    onChange={(event) =>
                      setSlider(Number(event.currentTarget.value))
                    }
                  />
                </label>
                <button
                  className={heatmapVisible ? "icon-button active" : "icon-button"}
                  type="button"
                  disabled={!result}
                  onClick={() => setHeatmapVisible((value) => !value)}
                >
                  <Grid3X3 size={16} aria-hidden="true" />
                  Heat
                </button>
                <label className="icon-button new-image">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileList(event.currentTarget.files)}
                  />
                  <ImagePlus size={16} aria-hidden="true" />
                  New
                </label>
              </div>
            </div>
          </div>

          <aside className="report screws">
            {phase === "scanning" ? (
              <div className="report-live">
                <p className="report-kicker">
                  <ScanSearch size={15} aria-hidden="true" />
                  Excavating specimen
                </p>
                <div className="live-percent">
                  {Math.round(progress * 100)}
                  <i>%</i>
                </div>
                <p className="live-label">{progressLabel}</p>
                <ul className="field-log">
                  <li>
                    Opening index <b>{activeDigSite.indexVersion}</b>
                  </li>
                  <li>
                    Reading {activeDigSite.digits.toLocaleString()} π digits
                  </li>
                  <li>Matching 32-digit windows</li>
                  <li>Classifying recovered tiles</li>
                </ul>
                <div className="skeletons" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : result ? (
              <div className="report-relic" key={result.summary.seed}>
                <p className="report-kicker">
                  <Sparkles size={15} aria-hidden="true" />
                  Relic recovered
                </p>
                <h2 className="relic-name">{result.summary.relicName}</h2>

                <div className="score-hero">
                  <div className="score-huge">
                    {shownPct.toFixed(1)}
                    <i>%</i>
                  </div>
                  <div className="score-meta">
                    <span className="score-label">pi-native</span>
                    <span className="rarity-badge">
                      <Sparkles size={14} aria-hidden="true" />
                      {result.summary.rarity}
                    </span>
                  </div>
                </div>

                <div className="breakdown">
                  {BREAKDOWN.map(({ k, label }) => {
                    const pct =
                      k === "exact"
                        ? result.summary.exactPct
                        : k === "near"
                          ? result.summary.nearPct
                          : k === "lossy"
                            ? result.summary.lossyPct
                            : result.summary.earthPct;
                    return (
                      <div
                        className="bar"
                        key={k}
                        data-k={k}
                        data-tip={CLASS_TIP[k]}
                        tabIndex={0}
                        aria-label={`${label}: ${CLASS_TIP[k]}`}
                      >
                        <span className="bar-label">
                          {label}
                          <Info className="bar-info" size={12} aria-hidden="true" />
                        </span>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="bar-val">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>

                <div className="stat-line">
                  <div>
                    <dt>Longest fossil</dt>
                    <dd>{result.summary.longestFossil} B</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>{result.summary.score.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Seed</dt>
                    <dd>{result.summary.seed}</dd>
                  </div>
                </div>

                <div className="map-block">
                  <span className="map-caption">Excavation map</span>
                  <div
                    className="excavation-map"
                    role="img"
                    aria-label={`Excavation map, ${result.summary.piNative.toFixed(
                      1
                    )} percent pi-native`}
                  >
                    {result.summary.shareGrid.split("\n").map((row, rowIndex) => (
                      <div className="map-row" key={rowIndex}>
                        {Array.from(row).map((glyph, colIndex) => (
                          <i
                            key={colIndex}
                            data-k={GLYPH_CLASS[glyph] ?? "earth"}
                            style={{ animationDelay: `${(rowIndex * 7 + colIndex) * 12}ms` }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => handleFileList(event.currentTarget.files)}
                />
                <div className="share">
                  <button
                    type="button"
                    className="share-primary"
                    onClick={() =>
                      isDemoSpecimen
                        ? uploadInputRef.current?.click()
                        : void shareRelic()
                    }
                    disabled={publishState.status === "publishing"}
                  >
                    {isDemoSpecimen ? (
                      <ImagePlus size={17} aria-hidden="true" />
                    ) : (
                      <Share2 size={17} aria-hidden="true" />
                    )}
                    {isDemoSpecimen
                      ? "Upload to share"
                      : publishState.status === "publishing"
                        ? "Publishing…"
                        : publishState.status === "published"
                          ? "Share link"
                          : "Publish & share"}
                  </button>
                  <button
                    type="button"
                    className="share-opt"
                    onClick={downloadCard}
                    title="Download the relic card (PNG)"
                    aria-label="Download the relic card"
                  >
                    <Download size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="share-opt"
                    onClick={copyImage}
                    title="Copy the relic card image"
                    aria-label="Copy the relic card image"
                  >
                    <Copy size={17} aria-hidden="true" />
                  </button>
                </div>

                <p className="share-toast" data-show={shareMsg ? "true" : "false"}>
                  {shareMsg ?? " "}
                </p>

                {publishState.status === "published" ? (
                  <a
                    className="published-link"
                    data-duplicate={publishState.duplicate ? "true" : "false"}
                    href={publishState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Link size={13} aria-hidden="true" />
                    <span>
                      {publishState.duplicate
                        ? "Already in the museum — view"
                        : "Live in the museum — view"}
                    </span>
                    <small>{publishState.url}</small>
                  </a>
                ) : null}
                {publishState.status === "published" && publishState.nearMatch ? (
                  <a
                    className="near-match-link"
                    href={publishState.nearMatch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Sparkles size={13} aria-hidden="true" />
                    Nearest museum match: {publishState.nearMatch.relic.title} ·{" "}
                    {publishState.nearMatch.similarity.toFixed(1)}%
                  </a>
                ) : null}
                {isDemoSpecimen ? (
                  <p className="demo-note">
                    Sample specimen — demo only. Upload your own image to publish
                    &amp; share a link.
                  </p>
                ) : null}
                {publishState.status === "error" ? (
                  <p className="error-text">{publishState.message}</p>
                ) : null}

                <details className="dig-note">
                  <summary>
                    {result.summary.digSite.split(":")[0]} · {result.summary.indexVersion}
                  </summary>
                  <p>
                    {result.summary.searchedDigits.toLocaleString()} computed π
                    digits · {result.summary.indexedFragments.toLocaleString()}{" "}
                    indexed fragments · checksum{" "}
                    {result.summary.indexChecksum.slice(0, 12)}. Original pixels
                    are used for matching only, never painted into the relic.
                  </p>
                </details>
              </div>
            ) : null}
          </aside>
        </section>
      )}
    </div>
  );
}
