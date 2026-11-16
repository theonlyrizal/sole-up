"use client";

import { useLayoutEffect, useRef } from "react";
import { cx } from "./cx";

const GAP = 4;
const STOP_RADIUS = 2;
const CIRCLE_SIZE = 48;
const INITIAL_LINEAR_WIDTH = 240;
const TURN = 2 * Math.PI;

type PointAt = (position: number) => readonly [number, number];

function wavePath(start: number, end: number, step: number, pointAt: PointAt) {
  const segments = Math.max(1, Math.ceil((end - start) / step));
  let path = "";
  for (let index = 0; index <= segments; index++) {
    const [x, y] = pointAt(start + ((end - start) * index) / segments);
    path += `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

function linearPaths(
  width: number,
  progress: number,
  stroke: number,
  amplitude: number,
  phase: number,
) {
  const y = stroke / 2 + 3;
  const left = stroke / 2;
  const right = width - left;
  const end = Math.max(left, width * progress - left);
  const start = progress === 0 ? left : end + stroke + GAP;
  const active =
    progress === 0
      ? ""
      : amplitude === 0
        ? `M${left} ${y}H${end}`
        : wavePath(left, end, 2, (x) => [
            x,
            y + amplitude * Math.sin(((x - left) / 40) * TURN - phase),
          ]);
  return {
    active,
    track: start <= right ? `M${start} ${y}H${right}` : "",
    stop: progress === 0 || end + left + GAP <= right - STOP_RADIUS,
  };
}

function circularPaths(
  progress: number,
  stroke: number,
  amplitude: number,
  phase: number,
) {
  const center = CIRCLE_SIZE / 2;
  const radius = center - stroke / 2 - 1.6;
  const point = (angle: number, offset = 0) =>
    [
      center + (radius + offset) * Math.sin(angle),
      center - (radius + offset) * Math.cos(angle),
    ] as const;
  const coordinates = (angle: number) =>
    point(angle)
      .map((coordinate) => coordinate.toFixed(3))
      .join(" ");
  const arc = (start: number, end: number) =>
    end > start
      ? `M${coordinates(start)}A${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${coordinates(end)}`
      : "";
  const circle = arc(0, Math.PI) + arc(Math.PI, TURN);
  if (progress === 0) return { active: "", track: circle };
  if (progress === 1) return { active: circle, track: "" };

  const cap = Math.asin(stroke / (2 * radius));
  const gap = 2 * Math.asin((stroke + GAP) / (2 * radius));
  const start = cap;
  const end = Math.max(start + 0.001, progress * TURN - cap);
  const waves = Math.round((TURN * radius) / 15);
  const active =
    amplitude === 0
      ? arc(start, end)
      : wavePath(start, end, 1.2 / radius, (angle) => {
          // Bring the wave back to the track radius at each rounded cap.
          const taper = Math.min(
            1,
            (radius * Math.min(angle - start, end - angle)) / 4,
          );
          return point(
            angle,
            amplitude * taper * Math.sin(waves * (angle - start) - phase),
          );
        });
  return { active, track: arc(end + gap, start + TURN - gap) };
}

function waveAmplitude(progress: number, circular: boolean) {
  const taper = Math.max(0, Math.min(1, progress / 0.1, (1 - progress) / 0.05));
  return taper * (circular ? 1.6 : 3);
}

/** Determinate Material progress. Value is a percentage from 0 to 100. */
export function ProgressIndicator({
  label,
  value,
  shape = "linear",
  wavy = false,
  thick = false,
  className,
}: {
  label: string;
  value: number;
  shape?: "linear" | "circular";
  wavy?: boolean;
  thick?: boolean;
  className?: string;
}) {
  const progress = Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  const svg = useRef<SVGSVGElement>(null);
  const track = useRef<SVGPathElement>(null);
  const active = useRef<SVGPathElement>(null);
  const stop = useRef<SVGCircleElement>(null);
  const current = useRef(progress / 100);
  const setTarget = useRef<(target: number) => void>(null);
  const circular = shape === "circular";
  const stroke = thick ? 8 : 4;
  const height = circular ? CIRCLE_SIZE : stroke + 6;
  const initialAmplitude = wavy ? waveAmplitude(progress / 100, circular) : 0;
  const initialPaths = circular
    ? {
        ...circularPaths(progress / 100, stroke, initialAmplitude, 0),
        stop: false,
      }
    : linearPaths(
        INITIAL_LINEAR_WIDTH,
        progress / 100,
        stroke,
        initialAmplitude,
        0,
      );

  useLayoutEffect(() => {
    const element = svg.current!;
    const trackPath = track.current!;
    const activePath = active.current!;
    const stopDot = stop.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let from = current.current;
    let target = from;
    let start = 0;
    let frame = 0;
    let visible = true;
    let width = CIRCLE_SIZE;

    function draw(time: number) {
      frame = 0;
      const completion =
        motion.matches || !visible ? 1 : Math.min(1, (time - start) / 300);
      const p =
        completion === 1
          ? target
          : from + (target - from) * (1 - (1 - completion) ** 3);
      current.current = p;
      const amplitude = wavy ? waveAmplitude(p, circular) : 0;
      const phase = motion.matches ? 0 : ((time % 1000) / 1000) * TURN;
      if (circular) {
        const paths = circularPaths(p, stroke, amplitude, phase);
        trackPath.setAttribute("d", paths.track);
        activePath.setAttribute("d", paths.active);
      } else {
        const paths = linearPaths(width, p, stroke, amplitude, phase);
        trackPath.setAttribute("d", paths.track);
        activePath.setAttribute("d", paths.active);
        stopDot?.setAttribute("opacity", paths.stop ? "1" : "0");
      }
      if (visible && !motion.matches && (p !== target || amplitude > 0))
        frame = requestAnimationFrame(draw);
    }

    function refresh() {
      cancelAnimationFrame(frame);
      draw(performance.now());
    }

    function resize() {
      width = Math.max(stroke, element.clientWidth);
      element.setAttribute("viewBox", `0 0 ${width} ${height}`);
      stopDot?.setAttribute("cx", String(width - stroke / 2));
      refresh();
    }

    setTarget.current = (next) => {
      if (next === target) return;
      from = current.current;
      start = performance.now();
      target = next;
      refresh();
    };
    const sizeObserver = circular ? undefined : new ResizeObserver(resize);
    sizeObserver?.observe(element);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      refresh();
    });
    visibilityObserver.observe(element);
    motion.addEventListener("change", refresh);
    if (circular) refresh();
    else resize();
    return () => {
      cancelAnimationFrame(frame);
      sizeObserver?.disconnect();
      visibilityObserver.disconnect();
      motion.removeEventListener("change", refresh);
      setTarget.current = null;
    };
  }, [circular, height, stroke, wavy]);

  useLayoutEffect(() => {
    setTarget.current?.(progress / 100);
  }, [circular, progress, stroke, wavy]);

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={progress}
      className={cx("block min-w-0", circular && "size-12 shrink-0", className)}
    >
      <svg
        ref={svg}
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${circular ? CIRCLE_SIZE : INITIAL_LINEAR_WIDTH} ${height}`}
        preserveAspectRatio={circular ? undefined : "none"}
        width={circular ? CIRCLE_SIZE : "100%"}
        height={height}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className={cx("block", !circular && "rtl:-scale-x-100")}
      >
        <path
          ref={track}
          d={initialPaths.track}
          className="stroke-secondary-container"
        />
        <path ref={active} d={initialPaths.active} className="stroke-primary" />
        {!circular && (
          <circle
            ref={stop}
            cx={INITIAL_LINEAR_WIDTH - stroke / 2}
            cy={height / 2}
            r={STOP_RADIUS}
            opacity={initialPaths.stop ? 1 : 0}
            className="fill-primary"
          />
        )}
      </svg>
    </span>
  );
}
