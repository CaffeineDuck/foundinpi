/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type RuntimeEnv = {
  DB?: D1Database;
  RELIC_BUCKET?: R2Bucket;
  POSTHOG_ASSET_HOST?: string;
  POSTHOG_HOST?: string;
  POSTHOG_PROJECT_TOKEN?: string;
  PUBLIC_POSTHOG_HOST?: string;
  PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
  PUBLIC_POSTHOG_UI_HOST?: string;
};

declare namespace Cloudflare {
  interface Env extends RuntimeEnv {
    ASSETS?: Fetcher;
  }
}

declare namespace App {
  interface Locals {
    cfContext?: ExecutionContext;
  }
}
