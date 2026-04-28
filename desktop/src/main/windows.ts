import { BrowserWindow, shell, nativeImage } from "electron";
import { join } from "node:path";

function appIcon() {
  // Try packaged resources/ first, then dev workspace root.
  const candidates = [
    join(process.resourcesPath ?? "", "icon.png"),
    join(__dirname, "..", "..", "resources", "icon.png"),
    join(process.cwd(), "resources", "icon.png"),
  ];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  }
  return undefined;
}

let mainWin: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWin;
}

export function createMainWindow(): BrowserWindow {
  const hidden = process.argv.includes("--hidden");

  mainWin = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    title: "FDM Tracker",
    icon: appIcon(),
    show: !hidden,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWin.on("close", (e) => {
    // Minimize to tray instead of quitting. The user can choose "Quit"
    // explicitly from the tray menu.
    const anyApp = (globalThis as unknown as { __fdmQuitting?: boolean }).__fdmQuitting;
    if (!anyApp && mainWin) {
      e.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWin.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWin.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return mainWin;
}

export function showMainWindow() {
  if (!mainWin) mainWin = createMainWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}
