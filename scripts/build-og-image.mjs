import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const width = 1200;
const height = 630;
const templatePath = "scripts/og-card.html";
const sourceImagePath = "public/og/sample-relic.png";
const output = "public/og/foundinpi-v3.png";
const legacyOutput = "public/og-default.png";

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "No Chrome/Chromium executable found. Set CHROME_PATH to run og:build."
    );
  }

  return found;
}

function dataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const [template, sampleImage] = await Promise.all([
  readFile(templatePath, "utf8"),
  readFile(sourceImagePath)
]);

const html = template
  .replaceAll("{{SAMPLE_IMAGE}}", dataUrl(sampleImage, "image/png"))
  .replaceAll("{{WIDTH}}", String(width))
  .replaceAll("{{HEIGHT}}", String(height));

await mkdir(path.dirname(output), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: {
    width,
    height,
    deviceScaleFactor: 1
  }
});

try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "dark" }
  ]);
  const screenshot = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width, height }
  });
  const optimized = await sharp(screenshot)
    .png({ compressionLevel: 9, palette: true, quality: 92, colors: 256 })
    .toBuffer();

  await Promise.all([
    sharp(optimized).toFile(output),
    sharp(optimized).toFile(legacyOutput)
  ]);
} finally {
  await browser.close();
}

console.log(`Wrote ${output} and ${legacyOutput}`);
