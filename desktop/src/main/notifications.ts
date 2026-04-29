/**
 * Native OS notifications. Wraps Electron's Notification so callers can
 * no-op when the platform doesn't support notifications (rare) without
 * littering guards throughout the app.
 */
import { Notification } from "electron";

interface NotifyOpts {
  title: string;
  body: string;
  sound?: boolean;
  onClick?: () => void;
}

export function notify(
  titleOrOpts: string | NotifyOpts,
  body?: string,
  onClick?: () => void,
): void {
  if (!Notification.isSupported()) return;
  const opts: NotifyOpts =
    typeof titleOrOpts === "string"
      ? { title: titleOrOpts, body: body ?? "", onClick }
      : titleOrOpts;
  const n = new Notification({
    title: opts.title,
    body: opts.body,
    silent: opts.sound === false,
  });
  if (opts.onClick) n.on("click", opts.onClick);
  n.show();
}
