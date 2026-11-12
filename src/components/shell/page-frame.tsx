import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";
import { TopAppBar } from "./top-app-bar";

/** Keep the route title and page spacing consistent across the two shells. */
export function PageFrame({
  children,
  width,
  mobileHeader,
  wash,
  hideCreate,
  ...header
}: Omit<ComponentProps<typeof PageHeader>, "headingLevel"> & {
  children: ReactNode;
  width?: ComponentProps<typeof PageContainer>["width"];
  mobileHeader?: ReactNode;
  wash?: boolean;
  hideCreate?: boolean;
}) {
  return (
    <div
      className={cx("relative min-w-0", wash && "app-header-wash")}
      data-hide-create={hideCreate || undefined}
    >
      {mobileHeader ?? <TopAppBar title={header.title} back={header.back} />}
      <PageContainer width={width} className="flex flex-col gap-6">
        <PageHeader {...header} />
        {children}
      </PageContainer>
    </div>
  );
}
