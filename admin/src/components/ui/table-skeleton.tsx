export function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <div className="overflow-hidden">
      <div className="animate-pulse">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
          >
            {Array.from({ length: cols }, (__, j) => (
              <div
                key={j}
                className={`h-3 rounded bg-slate-100 dark:bg-slate-800 ${
                  j === 1 ? "flex-[2]" : "flex-1"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
