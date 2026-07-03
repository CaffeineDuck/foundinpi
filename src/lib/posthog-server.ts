import { PostHog } from "posthog-node";
import { env } from "cloudflare:workers";

let posthogClient: PostHog | null = null;

const runtimeEnv = env as Cloudflare.Env;

function getProjectToken(): string {
  return (
    runtimeEnv.POSTHOG_PROJECT_TOKEN ?? import.meta.env.POSTHOG_PROJECT_TOKEN ?? ""
  );
}

function getPostHogHost(): string {
  return runtimeEnv.POSTHOG_HOST ?? import.meta.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
}

export function getPostHogServer(): PostHog | null {
  const projectToken = getProjectToken();
  if (!projectToken) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(projectToken, {
      host: getPostHogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function shutdownPostHog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
