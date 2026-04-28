export function TeamBadge({ name, size = "sm" }: { name: string | null; size?: "sm" | "xs" }) {
  if (!name) {
    return (
      <span className={`inline-block rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ${size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"}`}>
        No team
      </span>
    );
  }
  return (
    <span className={`inline-block rounded-full bg-slate-900 dark:bg-slate-700 text-white ${size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"}`}>
      {name}
    </span>
  );
}
