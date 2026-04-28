import type { AppStatus } from "@shared/types";

export function OfflineBadge({ status }: { status: AppStatus }) {
  if (status.connection === "online" && status.pending_sync_count === 0) return null;
  const isOffline = status.connection === "offline";
  return (
    <div
      className={`text-xs px-2 py-1 rounded border ${
        isOffline ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-600"
      }`}
      title={status.last_sync_error ?? ""}
    >
      {isOffline ? "offline — queued" : `syncing… ${status.pending_sync_count} pending`}
    </div>
  );
}
