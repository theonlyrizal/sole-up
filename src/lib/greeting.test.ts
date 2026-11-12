import { expect, it } from "vitest";
import { greetingFor } from "./greeting";

it.each([
  ["2026-11-12T22:59:59Z", "Good evening"],
  ["2026-11-12T23:00:00Z", "Good morning"],
  ["2026-11-13T05:59:59Z", "Good morning"],
  ["2026-11-13T06:00:00Z", "Good afternoon"],
  ["2026-11-13T11:59:59Z", "Good afternoon"],
  ["2026-11-13T12:00:00Z", "Good evening"],
])("greets at %s in Dhaka", (now, greeting) => {
  expect(greetingFor(new Date(now), "Asia/Dhaka")).toBe(greeting);
});
