import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getArtifact, type EnvLike } from "../../lib/server/store";

export const prerender = false;
const cfEnv = env as EnvLike;

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) return new Response("Missing artifact key", { status: 400 });

  const artifact = await getArtifact(cfEnv, key);
  if (!artifact) return new Response("Artifact not found", { status: 404 });

  const body =
    artifact.body instanceof ReadableStream
      ? artifact.body
      : new Blob([
          Uint8Array.from(artifact.body).buffer as ArrayBuffer
        ]);

  return new Response(body, {
    headers: {
      "content-type": artifact.contentType,
      "cache-control": artifact.cacheControl ?? "public, max-age=31536000"
    }
  });
};
