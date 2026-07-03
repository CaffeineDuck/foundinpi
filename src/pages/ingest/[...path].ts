import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const PROXY_PREFIX = "/ingest";
const DEFAULT_API_HOST = "https://us.i.posthog.com";
const DEFAULT_ASSET_HOST = "https://us-assets.i.posthog.com";
const ASSET_PATH_PREFIXES = ["/static/", "/array/"];
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];
const runtimeEnv = env as Cloudflare.Env;

function normalizeOrigin(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function inferAssetHost(apiHost: string): string {
  const hostname = new URL(apiHost).hostname;
  if (hostname === "eu.i.posthog.com") return "https://eu-assets.i.posthog.com";
  if (hostname === "us.i.posthog.com") return DEFAULT_ASSET_HOST;
  return DEFAULT_ASSET_HOST;
}

function isAssetPath(pathname: string): boolean {
  return ASSET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getTarget(pathname: string): URL {
  const apiHost = normalizeOrigin(
    runtimeEnv.POSTHOG_HOST ?? import.meta.env.POSTHOG_HOST,
    DEFAULT_API_HOST
  );
  const assetHost = normalizeOrigin(
    runtimeEnv.POSTHOG_ASSET_HOST ?? import.meta.env.POSTHOG_ASSET_HOST,
    inferAssetHost(apiHost)
  );

  return new URL(isAssetPath(pathname) ? assetHost : apiHost);
}

function getUpstreamUrl(requestUrl: URL): URL {
  const pathname = requestUrl.pathname.startsWith(PROXY_PREFIX)
    ? requestUrl.pathname.slice(PROXY_PREFIX.length) || "/"
    : requestUrl.pathname;
  const target = getTarget(pathname);

  target.pathname = pathname;
  target.search = requestUrl.search;
  return target;
}

function withCorsHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("access-control-allow-origin", request.headers.get("origin") ?? "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "*");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const ALL: APIRoute = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return withCorsHeaders(new Response(null, { status: 204 }), request);
  }

  const upstreamUrl = getUpstreamUrl(new URL(request.url));
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  headers.delete("cookie");
  headers.set("host", upstreamUrl.hostname);

  const clientIp = request.headers.get("cf-connecting-ip") ?? "";
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
    headers.set("x-real-ip", clientIp);
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  return withCorsHeaders(response, request);
};
