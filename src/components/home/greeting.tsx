import { MoreSheet } from "@/components/shell/more-sheet";
import { SEARCH_PATH } from "@/components/shell/nav-items";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { greetingFor } from "@/lib/greeting";

export function homeGreeting(
  name: string,
  now: Date,
  timeZone: string,
  locale: string,
) {
  const firstName = name.trim().split(/\s+/)[0];
  const greeting = greetingFor(now, timeZone);
  return {
    title: firstName ? `${greeting}, ${firstName}` : greeting,
    date: new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now),
  };
}

export function HomeAppBar({
  title,
  date,
  account,
}: {
  title: string;
  date: string;
  account: { id: string; name: string };
}) {
  return (
    <TopAppBar
      title={title}
      greeting={{
        date,
        avatar: (
          <ShapeAvatar
            id={account.id}
            entityType="user"
            label={account.name}
            size={40}
          />
        ),
      }}
      actions={
        <MoreSheet
          account={account}
          trigger={
            <IconButton
              label="More destinations"
              icon="more_horiz"
              tooltip={false}
            />
          }
        />
      }
    />
  );
}

export function GreetingHeader({
  title,
  date,
}: {
  title: string;
  date: string;
}) {
  return (
    <header className="hidden items-start justify-between gap-4 medium:flex">
      <div className="min-w-0">
        <p className="text-headline-large-emphasized wrap-anywhere">{title}</p>
        <p className="mt-1 text-body-large text-on-surface-variant">{date}</p>
      </div>
      <IconLink
        href={SEARCH_PATH}
        label="Search"
        icon="search"
        variant="tonal"
      />
    </header>
  );
}
