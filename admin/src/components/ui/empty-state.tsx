import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="px-5 py-10 text-center">
      {icon && <div className="mx-auto text-slate-300 dark:text-slate-600 mb-3">{icon}</div>}
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
