import type { ShapeName } from "../components/ui/shapes";
import type { LifeAreaColor } from "./life-areas";

const IDENTITY_SHAPES = [
  "cookie-9",
  "clover-4",
  "cookie-6",
  "flower",
  "gem",
  "clover-8",
  "cookie-4",
  "puffy-diamond",
  "cookie-12",
] as const satisfies readonly ShapeName[];

const IDENTITY_PALETTES = [
  "blue",
  "teal",
  "violet",
  "pink",
  "amber",
  "green",
] as const satisfies readonly LifeAreaColor[];

const encoder = new TextEncoder();

/** D-07: hash the stable entity key, independent of title and route. */
export function entityIdentity(entityType: string, id: string) {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(`${entityType}:${id}`)) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  hash >>>= 0;

  return {
    shape: IDENTITY_SHAPES[hash % IDENTITY_SHAPES.length]!,
    palette: IDENTITY_PALETTES[(hash >>> 8) % IDENTITY_PALETTES.length]!,
  };
}
