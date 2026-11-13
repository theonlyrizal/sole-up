"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useKeyboardOpen } from "@/components/hooks/use-keyboard-open";
import { QuickAdd } from "@/components/tasks/quick-add";
import { CreateMenu, type OpenQuickAdd } from "./create-menu";
import type { ShellAccount } from "./more-sheet";
import { NavigationBar } from "./navigation-bar";
import { NavigationRail } from "./navigation-rail";

const QuickAddContext = createContext<OpenQuickAdd>(() => {});

export function useOpenQuickAdd() {
  return useContext(QuickAddContext);
}

export function AppShell({
  account,
  children,
}: {
  account: ShellAccount;
  children: React.ReactNode;
}) {
  const keyboardOpen = useKeyboardOpen();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const openQuickAdd = useCallback<OpenQuickAdd>((origin) => {
    const active = document.activeElement;
    returnTo.current =
      origin ?? (active instanceof HTMLElement ? active : null);
    setQuickAddOpen(true);
  }, []);

  function restoreFocus(event: Event) {
    event.preventDefault();
    const origin = returnTo.current;
    if (
      origin?.isConnected &&
      origin !== document.body &&
      origin.getClientRects().length
    ) {
      origin.focus({ preventScroll: true });
    } else {
      document.getElementById("main")?.focus({ preventScroll: true });
    }
  }

  return (
    <div
      className="app-shell flex min-w-0 flex-1 bg-canvas"
      data-keyboard-open={keyboardOpen || undefined}
    >
      <NavigationRail account={account} onQuickAdd={openQuickAdd} />
      <QuickAddContext.Provider value={openQuickAdd}>
        {children}
      </QuickAddContext.Provider>
      <NavigationBar account={account} />
      <div className="compact-create medium:hidden">
        <CreateMenu onQuickAdd={openQuickAdd} />
      </div>
      <QuickAdd
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onShortcut={openQuickAdd}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
