import { describe, expect, it } from "vitest";

import { configuredProviders } from "./providers";

describe("configuredProviders", () => {
  it("is empty when no credentials are set", () => {
    expect(configuredProviders({})).toEqual([]);
  });

  it("lists only providers with both an ID and a secret, in a fixed order", () => {
    const providers = configuredProviders({
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      GOOGLE_CLIENT_ID: "g-id",
    });
    expect(providers.map((p) => p.id)).toEqual(["github"]);
    expect(providers[0]).toMatchObject({
      label: "GitHub",
      clientId: "gh-id",
      clientSecret: "gh-secret",
    });
  });

  it("lists Google before GitHub when both are set", () => {
    const providers = configuredProviders({
      GOOGLE_CLIENT_ID: "a",
      GOOGLE_CLIENT_SECRET: "b",
      GITHUB_CLIENT_ID: "c",
      GITHUB_CLIENT_SECRET: "d",
    });
    expect(providers.map((p) => p.id)).toEqual(["google", "github"]);
  });
});
