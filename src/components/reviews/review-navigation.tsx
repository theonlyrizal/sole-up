import { Tabs } from "@/components/ui/tabs";

const items = [
  { value: "weekly", label: "Weekly review", href: "/review" },
  { value: "history", label: "Past reviews", href: "/review/history" },
  { value: "insights", label: "Insights", href: "/review/insights" },
] as const;

export function ReviewNavigation({
  current,
}: {
  current: (typeof items)[number]["value"];
}) {
  return (
    <Tabs mode="link" label="Review pages" items={items} value={current} />
  );
}
