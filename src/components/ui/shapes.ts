type Point = readonly [x: number, y: number];
type Radius = (angle: number) => number;

const POINT_COUNT = 120;
const TAU = 2 * Math.PI;
const CENTER = 50;

function sample(radius: Radius, count = POINT_COUNT): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * TAU;
    const r = radius(angle);
    return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
  });
}

function interpolate(from: Point, to: Point, t: number): Point {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/** Subdivide the closed 64-sample outline to match the morph point count. */
function sunny(): Point[] {
  const points = sample((angle) => 50 * (0.9 + 0.1 * Math.cos(8 * angle)), 64);
  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const position = (index / POINT_COUNT) * points.length;
    const start = Math.floor(position);
    return interpolate(
      points[start]!,
      points[(start + 1) % points.length]!,
      position - start,
    );
  });
}

function pillRadius(angle: number): number {
  // A 100 × 60 stadium has straight sides at y = ±30 and cap centers at x = ±20.
  const x = Math.abs(Math.cos(angle));
  const y = Math.abs(Math.sin(angle));
  const side = 30 / y;
  if (side * x <= 20) return side;
  return 20 * x + Math.sqrt(30 ** 2 - (20 * y) ** 2);
}

function archRadius(angle: number): number {
  const y = Math.sin(angle);
  return y <= 0 ? 50 : 50 / Math.max(y, Math.abs(Math.cos(angle)));
}

function puffyDiamondRadius(angle: number): number {
  const rotated = angle - Math.PI / 4;
  const radius =
    (Math.abs(Math.cos(rotated)) ** 1.6 + Math.abs(Math.sin(rotated)) ** 1.6) **
    (-1 / 1.6);
  return 50 * (radius + 0.06 * Math.cos(4 * angle));
}

function gem(): Point[] {
  const vertices = sample(() => 50, 5);
  const samplesPerSide = POINT_COUNT / vertices.length;
  return vertices.flatMap((vertex, index) => {
    const previous = vertices[(index + 4) % 5]!;
    const next = vertices[(index + 1) % 5]!;
    const cornerStart = interpolate(vertex, previous, 0.18);
    const cornerEnd = interpolate(vertex, next, 0.18);
    const edgeEnd = interpolate(next, vertex, 0.18);
    return Array.from({ length: samplesPerSide }, (_, step) => {
      const half = samplesPerSide / 2;
      if (step >= half)
        return interpolate(cornerEnd, edgeEnd, (step - half) / half);
      const t = step / half;
      return interpolate(
        interpolate(cornerStart, vertex, t),
        interpolate(vertex, cornerEnd, t),
        t,
      );
    });
  });
}

function path(points: Point[]): string {
  // Keep floating-point drift at the edges from producing "-0.00".
  const round = (value: number) => Math.max(0, Math.min(100, value)).toFixed(2);
  const coordinates = points.map(([x, y]) => `${round(x)} ${round(y)}`);
  return `M ${coordinates.join(" L ")} Z`;
}

/** All paths use the same commands and a 0 0 100 100 viewBox. */
export const SHAPES = {
  circle: path(sample(() => 50)),
  "cookie-4": path(sample((angle) => 50 * (0.86 + 0.14 * Math.cos(4 * angle)))),
  "cookie-6": path(sample((angle) => 50 * (0.88 + 0.12 * Math.cos(6 * angle)))),
  "cookie-9": path(sample((angle) => 50 * (0.9 + 0.1 * Math.cos(9 * angle)))),
  "cookie-12": path(
    sample((angle) => 50 * (0.92 + 0.08 * Math.cos(12 * angle))),
  ),
  "clover-4": path(
    sample((angle) => 50 * (0.7 + 0.3 * Math.abs(Math.cos(2 * angle)) ** 0.6)),
  ),
  "clover-8": path(
    sample(
      (angle) => 50 * (0.78 + 0.22 * Math.abs(Math.cos(4 * angle)) ** 0.6),
    ),
  ),
  sunny: path(sunny()),
  "soft-burst": path(
    sample((angle) => 50 * (0.82 + 0.18 * Math.cos(10 * angle)) ** 1.2),
  ),
  flower: path(
    sample((angle) => 50 * (0.75 + 0.25 * Math.abs(Math.cos(2.5 * angle)))),
  ),
  "puffy-diamond": path(sample(puffyDiamondRadius)),
  pill: path(sample(pillRadius)),
  arch: path(sample(archRadius)),
  gem: path(gem()),
} as const;

export type ShapeName = keyof typeof SHAPES;
