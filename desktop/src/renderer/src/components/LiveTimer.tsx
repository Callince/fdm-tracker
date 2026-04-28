import { useEffect, useState } from "react";

/**
 * Ticks every second, rendering HH:MM:SS since `startedAt`.
 * Pauses when `pausedSince` is set (i.e., on a break).
 */
export function LiveTimer({
  startedAt,
  pausedSince,
  className = "",
}: {
  startedAt: string;
  pausedSince?: string | null;
  className?: string;
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((n) => (n + 1) & 0x3fffffff), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startedAt).getTime();
  const end = pausedSince ? new Date(pausedSince).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <span className={`tabular-nums ${className}`}>
      {`${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`}
    </span>
  );
}
