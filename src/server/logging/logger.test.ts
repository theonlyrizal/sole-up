import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";
import { isRedactedKey, REDACTED, REDACTED_KEYS } from "./redact";

const SECRET = "SECRET-VALUE-4f1c";

function capture() {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));
  return {
    logger,
    text: () => lines.join(""),
    entries: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/** Shaped like Drizzle's DrizzleQueryError wrapping a pg unique violation. */
function drizzleError() {
  const cause = Object.assign(
    new Error(`duplicate key value violates unique constraint (${SECRET})`),
    {
      code: "23505",
      constraint: "life_areas_active_name",
      table: "life_areas",
      detail: SECRET,
    },
  );
  return Object.assign(
    new Error(`Failed query: insert into "life_areas"\nparams: ${SECRET}`, {
      cause,
    }),
    { name: "DrizzleQueryError", params: [SECRET] },
  );
}

describe("logger redaction", () => {
  it.each(REDACTED_KEYS)("never writes the value of a %s field", (key) => {
    const { logger, text, entries } = capture();

    logger.info({ [key]: SECRET }, "top level");
    logger.info({ request: { headers: { [key]: SECRET } } }, "nested");
    logger.info({ items: [{ deep: { deeper: { [key]: SECRET } } }] }, "array");
    logger.child({ [key]: SECRET }).info("child binding");
    logger.child({ ctx: { [key]: SECRET } }).info("nested child binding");

    expect(text()).not.toContain(SECRET);
    expect(entries()[0]![key]).toBe(REDACTED);
  });

  it("redacts headers however they are spelled, and *token / *secret keys", () => {
    const { logger, text } = capture();

    logger.info(
      {
        headers: {
          Authorization: `Bearer ${SECRET}`,
          Cookie: `soleup.session_token=${SECRET}`,
          "Set-Cookie": SECRET,
          set_cookie: SECRET,
        },
        accessToken: SECRET,
        refresh_token: SECRET,
        sessionToken: SECRET,
        clientSecret: SECRET,
        BETTER_AUTH_SECRET: SECRET,
      },
      "request",
    );

    expect(text()).not.toContain(SECRET);
  });

  it("keeps fields that are not sensitive", () => {
    const { logger, entries } = capture();

    logger.info(
      { requestId: "abc", path: "/home", status: 500, entity: { id: "1" } },
      "kept",
    );

    expect(entries()[0]).toMatchObject({
      level: "info",
      msg: "kept",
      requestId: "abc",
      path: "/home",
      status: 500,
      entity: { id: "1" },
    });
    expect(entries()[0]!.time).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });

  it("never writes an error's message, cause message or extra fields", () => {
    const { logger, text, entries } = capture();

    logger.error({ err: drizzleError() }, "with message");
    logger.error({ err: drizzleError() });
    logger.error(drizzleError());
    logger.warn({ context: { failure: drizzleError() } }, "nested error");

    expect(text()).not.toContain(SECRET);
    const [first, second, third] = entries();
    expect(first!.err).toMatchObject({
      type: "DrizzleQueryError",
      cause: {
        type: "Error",
        code: "23505",
        constraint: "life_areas_active_name",
        table: "life_areas",
      },
    });
    expect((first!.err as { stack: string[] }).stack[0]).toMatch(/^at /);
    // pino would otherwise use error.message as the message.
    expect(second!.msg).toBe("Unexpected error");
    expect(third!.msg).toBe("Unexpected error");
  });

  it("survives circular objects", () => {
    const { logger, entries } = capture();
    const loop: Record<string, unknown> = { id: "1" };
    loop.self = loop;

    logger.info({ loop }, "circular");

    expect(entries()[0]!.loop).toEqual({ id: "1", self: "[Circular]" });
  });
});

describe("isRedactedKey", () => {
  it.each(["id", "path", "status", "code", "name", "type", "requestId"])(
    "does not redact %s",
    (key) => {
      expect(isRedactedKey(key)).toBe(false);
    },
  );
});
