import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { recordView, type EnvLike } from "../../../../lib/server/store";

export const prerender = false;
const cfEnv = env as EnvLike;
const MAX_VIEW_WEIGHT = 64;

async function getViewWeight(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return 1;

  try {
    const body = (await request.json()) as { weight?: unknown };
    const requestedWeight = Number(body.weight);
    if (!Number.isFinite(requestedWeight)) return 1;

    return Math.max(1, Math.min(MAX_VIEW_WEIGHT, Math.round(requestedWeight)));
  } catch {
    return 1;
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing relic id" }, { status: 400 });

  await recordView(cfEnv, id, await getViewWeight(request));
  return Response.json({ ok: true });
};
