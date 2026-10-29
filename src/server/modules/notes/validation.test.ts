import { describe, expect, it } from "vitest";

import {
  EMPTY_NOTE_DOCUMENT,
  NOTE_DOCUMENT_INVALID,
  NOTE_LINK_INVALID,
} from "@/lib/notes/document";

import {
  EXPECTED_UPDATED_AT_INVALID,
  LINK_TARGET_INVALID,
  noteLinkSchema,
  saveNoteSchema,
} from "./validation";

const ID = "8f0d6c1e-1f7a-4a52-9a07-2d4b6f0f3c11";
const UPDATED_AT = "2026-11-04T12:00:00.123Z";

function fieldErrors(input: unknown) {
  const result = saveNoteSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => [
    issue.path.join("."),
    issue.message,
  ]);
}

describe("saveNoteSchema", () => {
  it("trims the title and stores an empty one as null", () => {
    const parsed = saveNoteSchema.parse({
      title: "  Plan  ",
      body: EMPTY_NOTE_DOCUMENT,
      expectedUpdatedAt: null,
    });
    expect(parsed.title).toBe("Plan");
    expect(
      saveNoteSchema.parse({
        title: "   ",
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
      }).title,
    ).toBeNull();
    expect(
      saveNoteSchema.parse({
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
      }).title,
    ).toBeNull();
  });

  it("refuses a title over 200 characters after trimming", () => {
    expect(
      saveNoteSchema.safeParse({
        title: ` ${"a".repeat(200)} `,
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
      }).success,
    ).toBe(true);
    expect(
      fieldErrors({
        title: "a".repeat(201),
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
      }),
    ).toEqual([["title", "Keep the title to 200 characters."]]);
  });

  it("takes expectedUpdatedAt as an ISO string or a Date", () => {
    const fromString = saveNoteSchema.parse({
      id: ID,
      body: EMPTY_NOTE_DOCUMENT,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(fromString.expectedUpdatedAt?.toISOString()).toBe(UPDATED_AT);
    const fromDate = saveNoteSchema.parse({
      id: ID,
      body: EMPTY_NOTE_DOCUMENT,
      expectedUpdatedAt: new Date(UPDATED_AT),
    });
    expect(fromDate.expectedUpdatedAt?.toISOString()).toBe(UPDATED_AT);
  });

  it("requires expectedUpdatedAt exactly when there is an id", () => {
    const message = [["expectedUpdatedAt", EXPECTED_UPDATED_AT_INVALID]];
    expect(
      fieldErrors({
        id: ID,
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
      }),
    ).toEqual(message);
    expect(
      fieldErrors({ body: EMPTY_NOTE_DOCUMENT, expectedUpdatedAt: UPDATED_AT }),
    ).toEqual(message);
    expect(
      fieldErrors({
        id: ID,
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: "yesterday",
      }),
    ).toEqual(message);
    expect(
      fieldErrors({ id: ID, body: EMPTY_NOTE_DOCUMENT }).map(([path]) => path),
    ).toEqual(["expectedUpdatedAt"]);
  });

  it("refuses a body outside the allowlist with a fixed message", () => {
    expect(
      fieldErrors({
        body: { type: "doc", content: [{ type: "image" }] },
        expectedUpdatedAt: null,
      }),
    ).toEqual([["body", NOTE_DOCUMENT_INVALID]]);
    expect(
      fieldErrors({
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        },
        expectedUpdatedAt: null,
      }),
    ).toEqual([["body", NOTE_LINK_INVALID]]);
    expect(fieldErrors({ body: "<p>hi</p>", expectedUpdatedAt: null })).toEqual(
      [["body", NOTE_DOCUMENT_INVALID]],
    );
  });

  it("refuses unknown keys, such as a client-sent bodyText", () => {
    expect(
      fieldErrors({
        body: EMPTY_NOTE_DOCUMENT,
        bodyText: "forged",
        expectedUpdatedAt: null,
      }).map(([path]) => path),
    ).toEqual([""]);
  });
});

describe("noteLinkSchema", () => {
  it("takes a goal or a task", () => {
    expect(
      noteLinkSchema.parse({ id: ID, targetType: "goal", targetId: ID }),
    ).toEqual({ id: ID, targetType: "goal", targetId: ID });
    expect(
      noteLinkSchema.safeParse({ id: ID, targetType: "task", targetId: ID })
        .success,
    ).toBe(true);
  });

  it("refuses other targets and bad IDs", () => {
    for (const input of [
      { id: ID, targetType: "habit", targetId: ID },
      { id: ID, targetType: "goal", targetId: "not-a-uuid" },
    ]) {
      const result = noteLinkSchema.safeParse(input);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        LINK_TARGET_INVALID,
      ]);
    }
  });
});
