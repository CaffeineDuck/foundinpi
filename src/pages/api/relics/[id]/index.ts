import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getRelic, type EnvLike } from "../../../../lib/server/store";

export const prerender = false;
const cfEnv = env as EnvLike;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing relic id" }, { status: 400 });

  const relic = await getRelic(cfEnv, id);
  if (!relic) return Response.json({ error: "Relic not found" }, { status: 404 });

  return Response.json({ relic });
};
