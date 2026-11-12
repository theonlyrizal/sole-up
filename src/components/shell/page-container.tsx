import { cx } from "@/components/ui/cx";

const widths = {
  overview: "expanded:max-w-[1040px] large:max-w-[1240px]",
  detail: "max-w-[840px]",
  reading: "max-w-[720px]",
};

export function PageContainer({
  width = "overview",
  children,
  className,
}: {
  width?: keyof typeof widths;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "page-container mx-auto w-full min-w-0 px-4 pt-4 medium:px-6 medium:pt-10 medium:pb-16 large:px-8 xlarge:px-10",
        widths[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
