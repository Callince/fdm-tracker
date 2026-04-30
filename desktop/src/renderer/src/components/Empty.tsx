/**
 * Empty-state component with an inline SVG glyph. Same pattern across the
 * app so 'no data yet' screens feel intentional, not bug-like.
 */
import type { ReactNode } from "react";
import {
  CalendarDays,
  Inbox,
  Video,
  type LucideIcon,
} from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function Empty({ icon: Icon = Inbox, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <div className="relative mb-3">
        <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-brand/10 to-brand/0 blur-md" aria-hidden />
        <div className="relative h-12 w-12 rounded-full bg-gradient-to-br from-brand-tint to-white dark:from-[#3a1509]/40 dark:to-slate-900 border border-brand-light/40 dark:border-slate-700 flex items-center justify-center text-brand-dark dark:text-brand-light">
          <Icon size={20} />
        </div>
      </div>
      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// Re-export common icons so callers don't need a second import line.
export { CalendarDays as EmptyCalendar, Video as EmptyMeeting, Inbox as EmptyInbox };
