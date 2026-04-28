import { useEffect, useState } from "react";
import type { AppStatus } from "@shared/types";

export function useAppStatus(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(null);

  useEffect(() => {
    let cancel = false;
    window.fdm.getStatus().then((s) => { if (!cancel) setStatus(s); });
    const off = window.fdm.onStatus(setStatus);
    return () => { cancel = true; off(); };
  }, []);

  return status;
}
