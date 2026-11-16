"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const Status = createContext("Checking this device…");
export const NotificationSummaryUpdater = createContext<
  (status: string) => void
>(() => {});

export function NotificationSummaryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState("Checking this device…");
  return (
    <NotificationSummaryUpdater value={setStatus}>
      <Status value={status}>{children}</Status>
    </NotificationSummaryUpdater>
  );
}

export function NotificationSummary() {
  return useContext(Status);
}
