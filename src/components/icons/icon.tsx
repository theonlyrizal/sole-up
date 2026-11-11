import { ICON_PATHS } from "./icon-paths.generated";

export type IconName = keyof typeof ICON_PATHS;

type IconProps = {
  name: IconName;
  filled?: boolean;
  size?: number;
  className?: string;
};

/** Decorative. Give an icon-only control its own accessible name. */
export function Icon({
  name,
  filled = false,
  size = 24,
  className,
}: IconProps) {
  const paths = ICON_PATHS[name][filled ? "filled" : "outline"];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={className}
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
