import { defineMiddleware } from "astro:middleware";

type EdgeCacheRule = {
  name: string;
  edgeTtl: number;
  browserTtl: number;
  includeSearch?: boolean;
  match: (pathname: string) => boolean;
};

const YEAR = 31536000;

const EDGE_CACHE_RULES: EdgeCacheRule[] = [
  {
    name: "home",
    edgeTtl: 300,
    browserTtl: 60,
    match: (pathname) => pathname === "/"
  },
  {
    name: "about",
    edgeTtl: 3600,
    browserTtl: 300,
    match: (pathname) => pathname === "/about"
  },
  {
    name: "museum",
    edgeTtl: 120,
    browserTtl: 30,
    match: (pathname) => pathname === "/museum"
  },
  {
    name: "relic-page",
    edgeTtl: 300,
    browserTtl: 60,
    match: (pathname) => /^\/r\/[^/]+$/.test(pathname)
  },
  {
    name: "relic-list-api",
    edgeTtl: 60,
    browserTtl: 15,
    includeSearch: true,
    match: (pathname) => pathname === "/api/relics"
  },
  {
    name: "relic-api",
    edgeTtl: 300,
    browserTtl: 60,
    match: (pathname) => /^\/api\/relics\/[^/]+$/.test(pathname)
  },
  {
    name: "artifact",
    edgeTtl: YEAR,
    browserTtl: YEAR,
    match: (pathname) => pathname.startsWith("/artifacts/")
  },
  {
    name: "posthog-asset",
    edgeTtl: 3600,
    browserTtl: 3600,
    includeSearch: true,
    match: (pathname) =>
      pathname.startsWith("/ingest/static/") ||
      pathname.startsWith("/ingest/array/")
  }
];

function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function matchingRule(pathname: string) {
  const normalized = normalizePathname(pathname);
  return EDGE_CACHE_RULES.find((rule) => rule.match(normalized));
}

function requestBypassesCache(request: Request) {
  const cacheControl = request.headers.get("cache-control") ?? "";
  const pragma = request.headers.get("pragma") ?? "";

  return (
    request.headers.has("authorization") ||
    /\bno-cache\b|\bno-store\b/.test(cacheControl) ||
    /\bno-cache\b/.test(pragma)
  );
}

function cacheControlFor(rule: EdgeCacheRule) {
  if (rule.edgeTtl === rule.browserTtl) {
    return `public, max-age=${rule.browserTtl}`;
  }

  return `public, max-age=${rule.browserTtl}, s-maxage=${rule.edgeTtl}`;
}

function cacheKeyFor(url: URL, rule: EdgeCacheRule) {
  const cacheUrl = new URL(url);
  cacheUrl.pathname = normalizePathname(cacheUrl.pathname);

  if (!rule.includeSearch) {
    cacheUrl.search = "";
  } else {
    cacheUrl.searchParams.sort();
  }

  return new Request(cacheUrl.toString(), { method: "GET" });
}

function shouldStore(response: Response) {
  const cacheControl = response.headers.get("cache-control") ?? "";

  return (
    response.status === 200 &&
    !response.headers.has("set-cookie") &&
    response.headers.get("vary") !== "*" &&
    !/\bprivate\b|\bno-cache\b|\bno-store\b/.test(cacheControl)
  );
}

function withCacheHeaders(response: Response, rule: EdgeCacheRule) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControlFor(rule));
  headers.set("cdn-cache-control", `public, max-age=${rule.edgeTtl}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withDebugHeaders(
  response: Response,
  status: "HIT" | "MISS" | "BYPASS",
  rule: EdgeCacheRule,
  headOnly: boolean
) {
  const headers = new Headers(response.headers);
  headers.set("x-foundinpi-cache", status);
  headers.set("x-foundinpi-cache-rule", rule.name);

  return new Response(headOnly ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return next();
  }
  const headOnly = method === "HEAD";

  const rule = matchingRule(context.url.pathname);
  const workerCaches = globalThis.caches as
    | (CacheStorage & { default?: Cache })
    | undefined;
  const cache = workerCaches?.default;

  if (!rule || !cache || requestBypassesCache(context.request)) {
    return next();
  }

  const cacheKey = cacheKeyFor(context.url, rule);
  const lookupKey = new Request(cacheKey.url, {
    headers: context.request.headers,
    method: "GET"
  });
  const cached = await cache.match(lookupKey);

  if (cached) {
    return withDebugHeaders(cached, "HIT", rule, headOnly);
  }

  const response = await next();
  if (method !== "GET" || !shouldStore(response)) {
    return withDebugHeaders(response, "BYPASS", rule, headOnly);
  }

  const cacheable = withCacheHeaders(response, rule);
  const store = cache.put(cacheKey, cacheable.clone()).catch(() => undefined);
  context.locals.cfContext?.waitUntil?.(store);

  return withDebugHeaders(cacheable, "MISS", rule, headOnly);
});
