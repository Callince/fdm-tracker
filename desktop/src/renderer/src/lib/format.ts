import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function hms(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return "0h 00m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function atTz(iso: string | null, tz: string, fmt = "HH:mm"): string {
  if (!iso) return "--:--";
  return formatInTimeZone(parseISO(iso), tz, fmt);
}

export function relativeFromNow(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - parseISO(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}
