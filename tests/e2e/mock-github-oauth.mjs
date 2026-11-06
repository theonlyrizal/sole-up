// Preloaded only in Playwright's app server. The browser test redirects from
// the account chooser to the real Better Auth callback with a fixture code.
// Only the provider's token and profile HTTP endpoints are stubbed here.
if (process.env.NODE_ENV === "test") {
  const fetchUpstream = globalThis.fetch;
  const tokenURL = "https://github.com/login/oauth/access_token";
  const profileURL = "https://api.github.com/user";
  const emailsURL = `${profileURL}/emails`;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (![tokenURL, profileURL, emailsURL].includes(url)) {
      return fetchUpstream(input, init);
    }
    const request = new Request(input, init);
    const code =
      url === tokenURL
        ? new URLSearchParams(await request.text()).get("code")
        : request.headers.get("authorization")?.replace(/^Bearer /i, "");
    const fixture = code?.match(
      /^soleup-e2e\.([0-9a-f-]{36})\.(e2e-[0-9a-f-]+@example\.test)$/,
    );
    if (!fixture) return Response.json({}, { status: 400 });

    const [, id, email] = fixture;
    if (url === tokenURL) {
      return Response.json({ access_token: code, token_type: "bearer" });
    }
    if (url === profileURL) {
      return Response.json({ id, email, name: "OAuth fixture" });
    }
    return Response.json([{ email, verified: true, primary: true }]);
  };
}
