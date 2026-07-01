import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createRelic, listRelics, type EnvLike } from "../../lib/server/store";
import type { PublishRelicInput } from "../../lib/server/types";

export const prerender = false;
const cfEnv = env as EnvLike;

function isPublishRelicInput(value: unknown): value is PublishRelicInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const optionalNumber = (key: string) =>
    input[key] === undefined || typeof input[key] === "number";
  const optionalString = (key: string) =>
    input[key] === undefined || typeof input[key] === "string";

  return (
    typeof input.mode === "string" &&
    typeof input.rarity === "string" &&
    typeof input.score === "number" &&
    typeof input.piNative === "number" &&
    typeof input.exactPct === "number" &&
    typeof input.nearPct === "number" &&
    typeof input.lossyPct === "number" &&
    typeof input.earthPct === "number" &&
    typeof input.longestFossil === "number" &&
    typeof input.digSite === "string" &&
    optionalString("indexVersion") &&
    optionalString("indexChecksum") &&
    optionalNumber("searchedDigits") &&
    optionalNumber("indexedFragments") &&
    typeof input.shareGrid === "string" &&
    typeof input.summary === "string" &&
    typeof input.relicImage === "string" &&
    typeof input.cardImage === "string"
  );
}

export const GET: APIRoute = async ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? "24");
  const relics = await listRelics(cfEnv, limit);

  return Response.json({ relics });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return Response.json({ error: "Expected application/json" }, { status: 415 });
    }

    const input = await request.json();
    if (!isPublishRelicInput(input)) {
      return Response.json({ error: "Invalid relic payload" }, { status: 400 });
    }

    const result = await createRelic(cfEnv, input);
    const nearMatch = result.nearMatch
      ? {
          relic: result.nearMatch.relic,
          similarity: result.nearMatch.similarity,
          url: `/r/${result.nearMatch.relic.id}`
        }
      : null;

    return Response.json({
      relic: result.relic,
      duplicate: result.duplicate,
      nearMatch,
      url: `/r/${result.relic.id}`
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to publish relic"
      },
      { status: 400 }
    );
  }
};
