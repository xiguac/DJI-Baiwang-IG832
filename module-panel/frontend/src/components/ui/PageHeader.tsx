import type { ReactNode } from "react";

// Flat PageHeader: plain title + optional subtitle + right-aligned actions.
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}
