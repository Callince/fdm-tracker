import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

/**
 * Small always-on-top floating widget. Shows the live timer and a few action
 * buttons so the user can start/stop a break or end work without popping the
 * main window. Loads the same renderer bundle with `#widget` so React can
 * detect the mode and render the compact UI.
 */

let widgetWin: BrowserWindow | null = null;

const WIDGET_WIDTH = 260;
const WIDGET_HEIGHT = 200;
const MARGIN = 24;

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

  const pos = defaultPosition();
  widgetWin = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
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
