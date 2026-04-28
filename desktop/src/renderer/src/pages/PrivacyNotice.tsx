import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

interface Props {
  onAcknowledge: () => void;
}

const BODY = `
FDM Tracker is an internal tool used by Fourth Dimension Media Solutions to
measure active working time. Before it begins recording anything, please
read what it does and does not collect.

WHAT WE COLLECT WHILE YOU ARE LOGGED IN
  • Whether the operating system reports you as active or idle, sampled
    every 10 seconds. The threshold for "idle" is configured by your admin.
  • Keyboard event counts per minute (how many keys were pressed). We
    DO NOT record which keys, in what order, or in which application.
  • Mouse event counts per minute (moves, clicks, scrolls). We DO NOT
    record cursor position or which windows you interacted with.
  • The start and end times of each work session and each break you take.

WHAT WE NEVER COLLECT
  • Screenshots of your screen.
  • The titles or contents of windows or browser tabs.
  • The text you type — key counts only, never key codes.
  • Files on your device.
  • Your location.

WHEN TRACKING IS ACTIVE
  Tracking runs only between the moment you press "Start work" and the
  moment you press "End work" (or quit from the tray). Outside those
  windows, the app sends nothing to the server.

WHERE YOUR DATA LIVES
  Counts and timestamps are stored on a server operated by Fourth Dimension
  Media Solutions. Only authorised admins in the company can view them.
  In line with India's Digital Personal Data Protection Act 2023, you can
  ask your admin for a copy of your data or for it to be deleted.

CONTROL
  You can log out at any time. When you log out, tracking stops immediately.
`;

export function PrivacyNotice({ onAcknowledge }: Props) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="h-full flex items-center justify-center p-6 overflow-auto">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="text-lg font-semibold">Before we start tracking</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Please read this once. You won't be asked again unless you reinstall.</div>
        </CardHeader>
        <CardBody className="space-y-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-sans">{BODY.trim()}</pre>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
            <span>I have read the above and understand what FDM Tracker collects and does not collect.</span>
          </label>
          <div className="flex justify-end">
            <Button disabled={!checked} onClick={onAcknowledge}>Continue</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
