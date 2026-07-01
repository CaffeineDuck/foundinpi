/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type RuntimeEnv = {
  DB?: D1Database;
  RELIC_BUCKET?: R2Bucket;
};

declare namespace Cloudflare {
  interface Env extends RuntimeEnv {
    ASSETS?: Fetcher;
  }
}
