import { app, Menu, Tray, nativeImage } from "electron";
import { join } from "node:path";
import { showMainWindow } from "./windows";
import { toggleWidget as doToggleWidget, isWidgetVisible } from "./widget";

let tray: Tray | null = null;

export interface TrayHandlers {
  isSessionActive: () => boolean;
  isOnBreak: () => boolean;
  startWork: () => void;
  endWork: () => void;
  startBreak: () => void;
  endBreak: () => void;
}

function trayIcon() {
  // Prefer a hand-tuned tray PNG if present; otherwise downsample the full
  // brand icon so swapping in a new `icon.png` propagates automatically.
  const candidates = [
    join(process.resourcesPath ?? "", "tray-icon.png"),
    join(__dirname, "..", "..", "resources", "tray-icon.png"),
    join(process.cwd(), "resources", "tray-icon.png"),
    join(process.resourcesPath ?? "", "icon.png"),
    join(__dirname, "..", "..", "resources", "icon.png"),
    join(process.cwd(), "resources", "icon.png"),
  ];
  let img = nativeImage.createEmpty();
  for (const p of candidates) {
    const probe = nativeImage.createFromPath(p);
    if (!probe.isEmpty()) { img = probe; break; }
  }
  if (img.isEmpty()) return nativeImage.createEmpty();
  return img.resize({ width: 16, height: 16, quality: "best" });
}

export function ensureTray(handlers: TrayHandlers) {
  if (tray) return tray;
  tray = new Tray(trayIcon());
  tray.setToolTip("FDM Tracker");
  rebuild(handlers);
  tray.on("click", showMainWindow);
  return tray;
}

export function rebuild(handlers: TrayHandlers) {
  if (!tray) return;
  const active = handlers.isSessionActive();
  const onBreak = handlers.isOnBreak();
  const widgetOn = isWidgetVisible();
  const menu = Menu.buildFromTemplate([
    { label: "Show window", click: showMainWindow },
    { label: widgetOn ? "Hide floating widget" : "Show floating widget", click: () => doToggleWidget() },
    { type: "separator" },
    ...(active
      ? [
          ...(onBreak
            ? [{ label: "Resume work", click: handlers.endBreak }]
            : [{ label: "Start break", click: handlers.startBreak }]),
          { label: "End work session", click: handlers.endWork },
        ]
      : [{ label: "Start work session", click: handlers.startWork }]),
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        (globalThis as unknown as { __fdmQuitting?: boolean }).__fdmQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

export function getTray(): Tray | null {
  return tray;
}
