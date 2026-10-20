export const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

type ProviderEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

/**
 * The providers whose credentials are set. The env schema already rejects a
 * half-set pair, so a provider is either fully configured or absent.
 */
export function configuredProviders(env: ProviderEnv) {
  const credentials: Record<ProviderId, [string?, string?]> = {
    google: [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    github: [env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET],
  };
  return PROVIDERS.flatMap((provider) => {
    const [clientId, clientSecret] = credentials[provider.id];
    return clientId && clientSecret
      ? [{ ...provider, clientId, clientSecret }]
      : [];
  });
}
