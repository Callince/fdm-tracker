import { BrowserWindow, shell, nativeImage, screen } from "electron";
import { join } from "node:path";
import Store from "electron-store";

interface MainWinState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const stateStore = new Store<{ main: MainWinState }>({
  name: "window-state",
  defaults: {
    main: { width: 960, height: 640, maximized: false },
  },
});

function clampToVisibleArea(s: MainWinState): MainWinState {
  if (typeof s.x !== "number" || typeof s.y !== "number") return s;
  const display = screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height });
  const area = display.workArea;
  const inBounds =
    s.x >= area.x - 10 &&
    s.y >= area.y - 10 &&
    s.x + s.width <= area.x + area.width + 10 &&
    s.y + s.height <= area.y + area.height + 10;
  return inBounds ? s : { width: s.width, height: s.height, maximized: s.maximized };
}

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
  const saved = clampToVisibleArea(stateStore.get("main"));

  mainWin = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 760,
    minHeight: 520,
    title: "FDM Tracker",
    icon: appIcon(),
    show: !hidden,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (saved.maximized) mainWin.maximize();

  // Persist size/position whenever it stops moving.
  let saveTimer: NodeJS.Timeout | null = null;
  const saveState = () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWin || mainWin.isDestroyed()) return;
      const isMax = mainWin.isMaximized();
      const b = isMax ? null : mainWin.getNormalBounds();
      stateStore.set("main", {
        x: b?.x,
        y: b?.y,
        width: b?.width ?? saved.width,
        height: b?.height ?? saved.height,
        maximized: isMax,
      });
    }, 400);
  };
  mainWin.on("resize", saveState);
  mainWin.on("move", saveState);
  mainWin.on("maximize", saveState);
  mainWin.on("unmaximize", saveState);

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
