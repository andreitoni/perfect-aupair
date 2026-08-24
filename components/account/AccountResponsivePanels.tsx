"use client";

import { useRef, useState, type ReactNode } from "react";

export type AccountResponsivePanel = {
  id: string;
  label: string;
  children: ReactNode;
};

type AccountResponsivePanelsProps = {
  ariaLabel: string;
  panels: AccountResponsivePanel[];
};

export function AccountResponsivePanels({
  ariaLabel,
  panels,
}: AccountResponsivePanelsProps) {
  const [activePanelId, setActivePanelId] = useState(panels[0]?.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);

  function showPanel(panelId: string) {
    setActivePanelId(panelId);
    window.requestAnimationFrame(() => {
      tabsRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-20 -mx-1 bg-[var(--background)]/95 px-1 py-2 backdrop-blur lg:hidden">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label={ariaLabel}
          className="pa-scrollbar-none flex min-w-0 justify-between gap-0.5 overflow-x-auto rounded-[0.95rem] bg-white p-0.5 shadow-sm ring-1 ring-[#d6e2e8]"
        >
          {panels.map((panel) => {
            const active = panel.id === activePanelId;

            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`account-panel-${panel.id}`}
                className={[
                  "h-10 shrink-0 rounded-[0.75rem] px-1.5 text-sm font-black transition",
                  active
                    ? "bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] shadow-sm"
                    : "text-[#52666f] hover:bg-[#f4f8fa] hover:text-[#172426]",
                ].join(" ")}
                onClick={() => showPanel(panel.id)}
              >
                {panel.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-4 lg:mt-0 lg:space-y-3">
        {panels.map((panel) => (
          <div
            key={panel.id}
            id={`account-panel-${panel.id}`}
            role="tabpanel"
            className={[
              panel.id === activePanelId ? "block" : "hidden",
              "min-w-0 space-y-4 lg:block lg:space-y-3",
            ].join(" ")}
          >
            {panel.children}
          </div>
        ))}
      </div>
    </div>
  );
}
