import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import Store from "electron-store";

interface WidgetState { x?: number; y?: number; }
const widgetStore = new Store<{ pos: WidgetState }>({
  name: "widget-state",
  defaults: { pos: {} },
});

/**
 * Small always-on-top floating widget. Shows the live timer and a few action
 * buttons so the user can start/stop a break or end work without popping the
 * main window. Loads the same renderer bundle with `#widget` so React can
 * detect the mode and render the compact UI.
 */

let widgetWin: BrowserWindow | null = null;

const WIDGET_WIDTH = 260;
// Three sizes:
// - mini (half of normal): tiny pill with just the live timer + close
// - normal: timer + actions (default)
// - max (double of normal): timer + actions + today totals
const WIDGET_HEIGHT_MINI = 64;
const WIDGET_HEIGHT_NORMAL = 132;
const WIDGET_HEIGHT_MAX = 264;
const MARGIN = 24;

export type WidgetSize = "mini" | "normal" | "max";

function iconPath(): string {
  return join(__dirname, "..", "..", "resources", "icon.png");
}

function defaultPosition() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width } = display.workArea;
  return {
    x: x + width - WIDGET_WIDTH - MARGIN,
    y: y + MARGIN,
  };
}

export function getWidgetWindow(): BrowserWindow | null {
  return widgetWin;
}

export function createWidget(): BrowserWindow {
  if (widgetWin && !widgetWin.isDestroyed()) return widgetWin;

  const saved = widgetStore.get("pos");
  const pos = (typeof saved.x === "number" && typeof saved.y === "number")
    ? { x: saved.x, y: saved.y }
    : defaultPosition();
  widgetWin = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT_NORMAL,
    x: pos.x,
    y: pos.y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    hasShadow: true,
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWin.setAlwaysOnTop(true, "floating");

  if (process.env["ELECTRON_RENDERER_URL"]) {
    widgetWin.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#widget`);
  } else {
    widgetWin.loadFile(join(__dirname, "../renderer/index.html"), { hash: "widget" });
  }

  let saveTimer: NodeJS.Timeout | null = null;
  widgetWin.on("move", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      const [x, y] = widgetWin.getPosition();
      widgetStore.set("pos", { x, y });
    }, 400);
  });

  widgetWin.on("closed", () => {
    widgetWin = null;
  });

  return widgetWin;
}

export function showWidget() {
  const w = createWidget();
  if (w.isMinimized()) w.restore();
  w.show();
}

export function hideWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide();
}

export function toggleWidget() {
  if (widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()) {
    hideWidget();
  } else {
    showWidget();
  }
}

export function isWidgetVisible(): boolean {
  return !!(widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible());
}

export function setWidgetSize(size: WidgetSize): void {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const target =
    size === "mini" ? WIDGET_HEIGHT_MINI :
    size === "max" ? WIDGET_HEIGHT_MAX :
    WIDGET_HEIGHT_NORMAL;
  const [w] = widgetWin.getSize();
  widgetWin.setSize(w, target, true);
}
